# WireGuardExt

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Extensión de navegador (Chrome/Chromium/Edge, Manifest V3) que enruta **únicamente el tráfico del navegador** por un túnel WireGuard, sin afectar al resto del sistema. Permite configurar varios perfiles VPN desde una página de opciones y activarlos con un clic.

Para ello usa [wireproxy](https://github.com/windtf/wireproxy), un cliente WireGuard en **espacio de usuario** (sin root, sin interfaz de red), que la extensión controla mediante un *native messaging host* en Go.

## ¿Cómo funciona?

```
┌─ Extensión MV3 ──────────────────────────────┐
│  • Página de opciones: crea/edita N perfiles  │
│  • Popup: conectar/desconectar + estado        │
│  • chrome.proxy.settings → 127.0.0.1:<SOCKS5> │
│  • connectNative ↔ host Go                     │
└───────────────────────┬───────────────────────┘
                        │ Native Messaging (stdin/stdout)
┌───────────────────────▼───────────────────────┐
│  Host Go (native messaging host)               │
│  • Genera config en memoria                    │
│  • Arranca/para wireproxy como librería        │
│  • Expone SOCKS5 en 127.0.0.1                  │
└───────────────────────┬───────────────────────┘
                        │ usa como librería
┌───────────────────────▼───────────────────────┐
│  wireproxy (userspace, sin root)               │
│  • Túnel WireGuard → UDP al endpoint del peer  │
│  • SOCKS5 local expuesto al navegador          │
└────────────────────────────────────────────────┘
```

Solo el navegador pasa por la VPN; el resto de las conexiones del sistema quedan intactas.

## Requisitos

- **Go 1.24+** (solo para compilar el host; el usuario final solo necesita el binario ya compilado).
- **Chrome / Chromium / Edge** con soporte MV3.
- Un **servidor WireGuard** remoto funcional (con su peer configurado).

## Instalación

### 1. Construir el host nativo

```bash
cd host
go build -o wireguardext-host .
```

### 2. Registrar el native messaging host

#### Linux

```bash
./install/install.sh <ID_DE_LA_EXTENSION>
```

El instalador coloca el binario en `~/.local/share/wireguardext/`, genera el manifest de Native Messaging y lo registra en Chrome, Chromium, Edge, Brave y Vivaldi (los que detecte). No requiere root.

#### Windows (PowerShell)

```powershell
.\install\install.ps1 -ExtensionId <ID_DE_LA_EXTENSION>
```

Registra el manifest en `HKCU` (no requiere administrador) para Chrome y Edge.

> **¿De dónde sale el ID de la extensión?** Carga la extensión sin empaquetar en `chrome://extensions` (modo desarrollador) y copia el ID que aparece.

### 3. Cargar la extensión

1. Abre `chrome://extensions`.
2. Activa el **modo desarrollador**.
3. **Cargar descomprimida** → selecciona la carpeta `extension/`.
4. Copia el **ID** de la extensión y úsalo en el instalador del host (paso 2).

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
