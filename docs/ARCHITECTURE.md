# Arquitectura

## Visión general

WireGuardExt enruta **solo el tráfico del navegador** por un túnel WireGuard. Lo consigue con tres piezas:

1. **Extensión MV3** — configura el proxy del navegador (`chrome.proxy.settings`) para apuntar a un SOCKS5 local, y ofrece la UI.
2. **Native messaging host (Go)** — recibe órdenes de la extensión por stdin/stdout, arranca/para wireproxy en el mismo proceso.
3. **wireproxy** — cliente WireGuard userspace (sin root, sin TUN del kernel) que expone el SOCKS5 y cifra el tráfico hacia el peer remoto.

```
Navegador ──(tráfico web)──▶ SOCKS5 (127.0.0.1:8869)
                                  │
                                  ▼
                          wireproxy (userspace)
                                  │ crypto Noise (WireGuard)
                                  ▼
                          UDP al endpoint del peer ──▶ Internet
```

El resto de aplicaciones del sistema **no** pasa por el proxy del navegador, por lo que sus conexiones quedan sin modificar.

## Flujo de conexión

1. El usuario selecciona un perfil en el popup y pulsa **Conectar**.
2. La extensión envía `{command:"start", profile:{...}}` al host por Native Messaging.
3. El host construye la `Configuration` de wireproxy en memoria (sin ficheros temporales).
4. El host llama a `wireproxy.StartWireguard(conf, logLevel)` → arranca el túnel y la rutina SOCKS5.
5. El host responde `{type:"started", socksPort:8869}`.
6. La extensión aplica `chrome.proxy.settings` → `fixed_servers` con esquema `socks5` apuntando a `127.0.0.1:8869`.
7. A partir de aquí, todo el tráfico HTTP/HTTPS del navegador pasa por el túnel.

La desconexión invierte el proceso: `{command:"stop"}` → el host detiene wireproxy → la extensión restaura el proxy a `direct`.

## ¿Por qué no en WASM puro dentro del navegador?

La motivación inicial era ejecutar wireproxy directamente dentro de la extensión, compilado a WebAssembly. **No es viable** por un bloqueante arquitectónico:

- WireGuard transporta su criptografía Noise en **paquetes UDP** hacia el endpoint del peer. Es intrínseco al protocolo.
- Las WebExtensions MV3 **no exponen sockets UDP ni TCP crudos**. Solo `fetch` (HTTP request/response) y `WebSocket`.
- `chrome.sockets.udp` pertenecía a *Chrome Apps*, una plataforma deprecada; **no está disponible en extensiones MV3**. ([Chromium issue 40068590](https://issues.chromium.org/40068590))
- Compilar Go/WireGuard a WASM no sortea el sandbox del navegador: el runtime caería al intentar abrir el socket UDP. ([WebAssembly/design#1251](https://github.com/WebAssembly/design/issues/1251))

El único caso real de `wireguard-go` corriendo en WASM dentro de un navegador es el **NetBird Browser Client**, pero resuelve un caso de uso distinto (red P2P corporativa con señalización propia) y no es aplicable como proxy VPN hacia un endpoint WireGuard arbitrario. ([NetBird docs](https://docs.netbird.io/manage/peers/browser-client/architecture))

**Conclusión:** se necesita un proceso nativo con acceso a sockets. Native Messaging es el mecanismo estándar de las extensiones para interactuar con procesos nativos, y wireproxy al ser userspace no requiere root ni interfaz de red del kernel. La combinación cumple el objetivo: VPN solo para el navegador, sin privilegios.

## wireproxy como librería

wireproxy expone una API pública en Go que permite integrarlo **en el mismo proceso** del host (no como subproceso):

- `StartWireguard(conf *Configuration, logLevel int) (*VirtualTun, error)` — arranca el túnel.
- `Configuration{Device *DeviceConfig, Routines []RoutineSpawner}` — config en memoria.
- `Socks5Config{BindAddress, Username, Password}` implementa `RoutineSpawner` y levanta el listener SOCKS5.

Esto da un único binario y control directo del ciclo de vida.

### Gestión del ciclo de vida (Start/Stop real)

`Socks5Config.SpawnRoutine` usa `server.ListenAndServe` que es bloqueante y no expone el `net.Listener` (además llama `log.Fatal` si falla el accept, lo que mataría el host entero). Para tener un `Stop` **real**, el host **no usa** las rutinas de wireproxy. En su lugar:

1. Crea él mismo el `net.Listener` TCP (`net.Listen("tcp", "127.0.0.1:port")`).
2. Construye un `socks5.Server` con el dial y resolver del `VirtualTun` (`vt.Tnet.DialContext`, `vt` como resolver).
3. Lo sirve en una goroutine con `server.Serve(ln)`.
4. En `Stop`: cierra el listener (detiene el accept) y llama `vt.Dev.Close()` (cierra los binds UDP y detiene las goroutines de wireguard-go).

Así la desconexión es limpia: el navegador deja de enrutar por el SOCKS5 y el túnel WireGuard se cierra de verdad.

## Resiliencia del service worker

En MV3, el service worker puede ser terminado por el navegador en cualquier momento. Para mantener la conectividad:

- **wireproxy corre dentro del host**, no dentro del SW. Si el SW muere, el host (y el túnel) siguen vivos mientras el navegador mantenga el port nativo o el proceso host siga ejecutándose.
- Al **revivir el SW** (`onStartup` / carga), este reconsulta `status` al host. Si wireproxy seguía activo, **reaplica** el proxy hacia el puerto SOCKS5 que sigue escuchando. Si no estaba activo, limpia el estado.
- El proxy del navegador (`chrome.proxy.settings`) persiste independientemente del SW, así que no se pierde la configuración de enrutamiento.

## Seguridad

- **Private keys**: se guardan en `chrome.storage.local` (cifrado a nivel de perfil de Chrome) y solo se envían al host en el comando `start`. No se loguean.
- **Native Messaging**: el manifest restringe `allowed_origins` al ID concreto de la extensión. Ningún otro origen puede comunicarse con el host.
- **SOCKS5 sin credenciales**: escucha en `127.0.0.1`, por lo que solo procesos locales pueden usarlo. No se expone a la red.

## Limitaciones conocidas

- **Una VPN activa a la vez.** Cambiar de perfil detiene el túnel actual (cierra listener + device) y arranca el nuevo.
- **No hay hot-swap** en wireproxy: el cambio implica reiniciar el túnel.
- **DNS**: con esquema `socks5`, la resolución DNS se hace a través del túnel (evita fugas). El DNS configurado en el perfil (`Interface.DNS`) lo usa wireproxy internamente.
