# WireGuardExt

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Extensión de navegador (Chrome/Chromium/Edge, Manifest V3) que enruta **únicamente el tráfico del navegador** por un túnel WireGuard, sin afectar al resto del sistema. Permite configurar varios perfiles VPN desde una página de opciones y activarlos con un clic.

Para ello usa [wireproxy](https://github.com/windtf/wireproxy), un cliente WireGuard en **espacio de usuario** (sin root, sin interfaz de red), que la extensión controla mediante un *native messaging host* en Go.

## ¿Cómo funciona?

```
┌─ Extensión MV3 ──────────────────────────────┐
│  • Página de opciones: crea/edita N perfiles │
│  • Popup: conectar/desconectar + estado      │
│  • chrome.proxy.settings → 127.0.0.1:<SOCKS5>│
│  • connectNative ↔ host Go                   │
└───────────────────────┬──────────────────────┘
                        │ Native Messaging (stdin/stdout)
┌───────────────────────▼───────────────────────┐
│  Host Go (native messaging host)              │
│  • Genera config en memoria                   │
│  • Arranca/para wireproxy como librería       │
│  • Expone SOCKS5 en 127.0.0.1                 │
└───────────────────────┬───────────────────────┘
                        │ usa como librería
┌───────────────────────▼───────────────────────┐
│  wireproxy (userspace, sin root)              │
│  • Túnel WireGuard → UDP al endpoint del peer │
│  • SOCKS5 local expuesto al navegador         │
└───────────────────────────────────────────────┘
```

Solo el navegador pasa por la VPN; el resto de las conexiones del sistema quedan intactas.

## Requisitos

- **Chrome / Chromium / Edge** (u otro navegador basado en Chromium con soporte MV3).
- Un **servidor WireGuard** remoto funcional (con su peer configurado).

> No necesitas instalar Go ni compilar nada: las [releases](https://github.com/yoprogramo/wireguardext/releases) incluyen binarios del host ya compilados para cada plataforma.

## Instalación desde la Chrome Web Store

La forma más sencilla: instala la extensión directamente desde la Chrome Web Store (en cuanto se publique). Como la CWS **no permite empaquetar el binario del host dentro de la extensión**, el componente host se instala aparte, pero la propia extensión te guía:

1. Instala **WireGuardExt** desde la Chrome Web Store.
2. Al abrir el popup por primera vez verás el aviso **«Host component not installed»**. Pulsa **«Install the host component»**: se abre una página de ayuda con instrucciones para tu sistema operativo y el ID de tu extensión ya rellenado.
3. Descarga el paquete del host para tu SO desde la [última release](https://github.com/yoprogramo/wireguardext/releases/latest), ejecuta el instalador (`install.sh` / `install.ps1`) pegando el ID y recarga la extensión.

> Política de privacidad: <https://yoprogramo.github.io/wireguardext/>

## Instalación (usuario final)

Esta vía usa los binarios publicados en la página de [releases](https://github.com/yoprogramo/wireguardext/releases). No requiere compilar nada.

### 1. Cargar la extensión y obtener su ID

1. Ve a [la última release](https://github.com/yoprogramo/wireguardext/releases/latest) y descarga `wireguardext-extension-vX.Y.Z.zip`.
2. Descomprímelo en una carpeta permanente (por ejemplo `~/wireguardext-extension/`). No la borres después: Chrome la necesita.
3. Abre `chrome://extensions`, activa el **modo desarrollador** y pulsa **Cargar descomprimida** → selecciona la carpeta del paso anterior.
4. Copia el **ID** que aparece bajo el nombre de la extensión (32 caracteres). Lo necesitarás en el paso 2.

### 2. Descargar y registrar el host nativo

Descarga de [la misma release](https://github.com/yoprogramo/wireguardext/releases/latest) el paquete del host correspondiente a tu sistema operativo y arquitectura:

| Sistema | Arquitectura | Paquete |
|---|---|---|
| Linux | x86_64 | `wireguardext-host-linux-amd64-vX.Y.Z.tar.gz` |
| Linux | ARM64 | `wireguardext-host-linux-arm64-vX.Y.Z.tar.gz` |
| macOS (Intel) | x86_64 | `wireguardext-host-darwin-amd64-vX.Y.Z.tar.gz` |
| macOS (Apple Silicon) | ARM64 | `wireguardext-host-darwin-arm64-vX.Y.Z.tar.gz` |
| Windows | x86_64 | `wireguardext-host-windows-amd64-vX.Y.Z.zip` |
| Windows | ARM64 | `wireguardext-host-windows-arm64-vX.Y.Z.zip` |

Cada paquete contiene: el binario del host, el instalador y el manifest de Native Messaging.

**Linux / macOS** — extrae y ejecuta el instalador pasando el ID de la extensión:

```bash
tar xzf wireguardext-host-linux-amd64-vX.Y.Z.tar.gz
./install.sh <ID_DE_LA_EXTENSION>
```

El instalador coloca el binario en `~/.local/share/wireguardext/`, genera el manifest de Native Messaging y lo registra en Chrome, Chromium, Edge, Brave y Vivaldi (los que detecte). No requiere root.

**Windows** (PowerShell) — descomprime el zip, abre PowerShell **en la carpeta descomprimida** y ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId <ID_DE_LA_EXTENSION>
```

> El flag `-ExecutionPolicy Bypass` es necesario porque Windows trae la ejecución de scripts deshabilitada por defecto; solo afecta a esta ejecución. Si prefieres no ponerlo, desbloquea el permiso para tu usuario con `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (una sola vez) y luego lanza `.\install.ps1 -ExtensionId <ID>`. Si al ejecutar te aparece el error «no se puede cargar porque la ejecución de scripts está deshabilitada en este sistema», es exactamente esa restricción: usa el flag `Bypass` del primer comando.

Registra el manifest en `HKCU` (no requiere administrador) para Chrome y Edge.

Una vez completados ambos pasos (extensión cargada + host registrado con su ID), ya puedes usar WireGuardExt.

---

## Instalación (desarrollo)

Si prefieres construir desde el código fuente (para contribuir o empaquetar tú mismo):

### Requisitos adicionales

- **Go 1.24+** para compilar el host.

### Compilar el host

```bash
cd host
go build -o wireguardext-host .
```

### Registrar el host

Usa los instaladores del repositorio (buscarán el binario recién compilado en `host/`):

```bash
# Linux / macOS
./install/install.sh <ID_DE_LA_EXTENSION>

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -ExtensionId <ID_DE_LA_EXTENSION>
```

### Cargar la extensión

Abre `chrome://extensions`, activa el **modo desarrollador**, **Cargar descomprimida** → selecciona la carpeta `extension/`. Copia el ID y úsalo en el instalador del host.

> Para reempaquetar todo para distribución, consulta [Empaquetado para distribución](#empaquetado-para-distribución).

## ID de extensión estable

El ID de **WireGuardExt** es siempre **`ngfheojelhaaceelejicpkdfagmhkoam`**, tanto si la instalas desde la Chrome Web Store como si la cargas descomprimida (desde `extension/` o desde el `.zip` de una release).

Esto se consigue incluyendo la **clave pública** de la extensión (`"key"`) en `extension/manifest.json`. Sin esa clave, Chrome calcularía el ID a partir de la ruta de la carpeta, dando un ID distinto en cada máquina o carpeta y obligando a reinstalar el host cada vez. Con la clave, el ID deriva de ella y queda fijo.

Consecuencia práctica: **el host nativo se instala una sola vez** con ese ID y no hay que volver a registrarlo, aunque muevas la extensión de carpeta o la cargues en otro equipo (siendo en este el mismo manifest del host).

```bash
# Linux / macOS
./install.sh ngfheojelhaaceelejicpkdfagmhkoam

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId ngfheojelhaaceelejicpkdfagmhkoam
```

> El campo `key` es la clave **pública**, no compromete la firma que hace Google de la extensión en la tienda. Al generar el `.zip` que se sube a la Chrome Web Store, `build/package.sh` elimina automáticamente `key` del manifest (la tienda rechazaría un paquete con `key` embebida); solo se conserva en el árbol de fuentes para fijar el ID en desarrollo y en el `.zip` de las releases para carga descomprimida.

## Uso

1. Abre las opciones de la extensión (botón derecho en el icono → Opciones).
2. Crea un perfil manualmente (**+ Nuevo perfil**) o **importa un `.conf`** de WireGuard existente:
   - Botón **Importar .conf**, o arrastra archivos `.conf` sobre la lista de perfiles.
   - Se aceptan varios `.conf` a la vez y `.conf` con varios `[Peer]` (genera un perfil por peer).
   - Cada perfil se puede **Exportar** de vuelta a `.conf` desde su botón correspondiente.
3. Los campos de cada perfil son los estándar de WireGuard:
   - **Clave privada** (PrivateKey) y **Address** (IP del túnel, ej. `10.0.0.2/32`).
   - **Clave pública del peer**, **Endpoint** (`host:puerto`), **AllowedIPs** (`0.0.0.0/0` para todo).
4. Pulsa el icono de la extensión → selecciona el perfil → **Conectar**.
5. Verifica en `https://ifconfig.me` que tu IP cambió.

## Solución de problemas

### Mi LAN doméstica y la red del servidor usan la misma subred (p. ej. ambas `192.168.1.0/24`)

Este es el caso clásico en el que una VPN WireGuard **a nivel de sistema** falla: la tabla de rutas del cliente considera que la IP destino (p. ej. `192.168.1.50` en la oficina) pertenece a la red local y el paquete nunca sale del router doméstico, por lo que no llega nunca al servidor.

Con **WireGuardExt esto funciona sin configuración adicional**, porque el túnel **no** es una interfaz de red del sistema. El navegador envía todo su tráfico a un proxy SOCKS5 local (`127.0.0.1`) gestionado por wireproxy, y es este quien lo mete cifrado en el túnel UDP hacia el endpoint WireGuard. La decisión de enrutamiento la toma wireproxy **dentro** del túnel, no el sistema operativo del cliente, así que la colisión de subredes del cliente es irrelevante: el paquete se descifra en el lado del servidor, donde esa IP sí es la red correcta.

Consecuencias a tener en cuenta:

- **Solo el navegador** pasa por el túnel. El resto de apps del equipo siguen usando la red doméstica directa (no hay interfaz WG a nivel sistema, precisamente para evitar la colisión).
- Usa la **IP literal** (`http://192.168.1.50`) en la barra de direcciones. Si además quieres resolver nombres internos, pon como **DNS** de la interfaz (en el perfil) el servidor DNS de la oficina; así los nombres `host.local` también resolverán a través del túnel.
- `AllowedIPs = 0.0.0.0/0` (lo habitual) ya es correcto: no hay que cambiarlo.
- El **servidor** debe permitir reenviar ese tráfico hacia su LAN (`net.ipv4.ip_forward=1`) y que la máquina destino tenga como gateway al servidor (o SNAT en este). Esa parte es configuración del lado del servidor, no de la extensión.

### La conexión falla con `encoding/hex: invalid byte`

Las claves del `.conf` están en base64 y la extensión/host ya las convierten al formato hex que exige la IPC de WireGuard. Si ves este error, asegúrate de estar usando un binario del host **v0.1.2 o superior** (las versiones anteriores pasaban la clave en base64 sin convertir).

## Estructura del proyecto

```
wireguardext/
├── extension/      # WebExtension MV3 (JS vainilla, sin build)
│   ├── background/ # Service worker (orquestador)
│   ├── lib/        # storage, native, proxy, validate, conf (import/export)
│   ├── options/    # Página de configuración (CRUD de perfiles + import .conf)
│   ├── popup/      # Toggle de conexión
│   └── icons/
├── host/           # Native messaging host en Go
├── install/        # Instaladores Linux/Windows + manifest NM
├── build/          # Scripts de empaquetado para distribución
└── docs/           # Arquitectura y protocolo
```

## Empaquetado para distribución

El script `build/package.sh` compila el host para todas las plataformas y empaqueta la extensión:

```bash
./build/package.sh              # todo: extensión + 6 binarios del host
./build/package.sh extension    # solo la extensión (.zip)
./build/package.sh host         # solo los binarios del host
```

Genera en `dist/`:

| Artefacto | Descripción |
|---|---|
| `wireguardext-extension-vX.Y.Z.zip` | Extensión lista para cargar en `chrome://extensions` |
| `wireguardext-host-{linux,darwin,windows}-{amd64,arm64}-vX.Y.Z.{tar.gz,zip}` | Host nativo por plataforma, con instaladores y manifest NM incluidos |

El host se compila con `CGO_ENABLED=0` (totalmente estático) y `-trimpath -ldflags="-s -w"` (binario optimizado). La versión se lee automáticamente del `manifest.json` de la extensión.

## CI y releases (GitHub Actions)

El repositorio incluye dos workflows en `.github/workflows/`:

- **`ci.yml`** — en cada push a `main` o PR: `go vet` + build + `gofmt` check del host, smoke test del protocolo Native Messaging, validación de sintaxis JS y JSON, y empaquetado de prueba de la extensión. Ejecuta el host en Go 1.24 y la última estable.
- **`release.yml`** — se dispara al publicar un tag `v*` (p. ej. `v0.1.2`): compila el host para las 6 plataformas, empaqueta la extensión, corre el smoke test sobre el binario de Linux y **crea una GitHub Release** con todos los artefactos adjuntos y notas autogeneradas desde los commits.

### Publicar una release

```bash
# 1. Asegúrate de que la versión en extension/manifest.json está actualizada.
# 2. Etiqueta y empuja el tag:
git tag v0.1.2
git push origin v0.1.2
```

El workflow crea automáticamente la release en https://github.com/yoprogramo/wireguardext/releases con los binarios descargables. No hace falta ejecutar `build/package.sh` a mano.

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Diseño detallado y por qué no se hace en WASM puro.
- [`docs/PROTOCOL.md`](docs/PROTOCOL.md) — Mensajes entre la extensión y el host.

## Licencia

Copyright 2026 yoprogramo (yoprogramo@gmail.com). Distribuido bajo la **Licencia Apache 2.0**. Consulta el archivo [LICENSE](LICENSE) para los términos completos.

### Dependencias de terceros

Este proyecto incluye o enlaza software de terceros con sus propias licencias:

- [wireproxy](https://github.com/windtf/wireproxy) — cliente WireGuard en espacio de usuario (BSD-3-Clause).
- [wireguard-go](https://github.com/WireGuard/wireguard-go) — implementación oficial de WireGuard en Go (MIT).
- [go-socks5](https://github.com/things-go/go-socks5) — servidor SOCKS5 (MIT).

## Créditos

- [wireproxy](https://github.com/windtf/wireproxy) — cliente WireGuard en espacio de usuario.
- [wireguard-go](https://github.com/WireGuard/wireguard-go) — implementación oficial de WireGuard en Go.
