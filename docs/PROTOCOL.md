# Protocolo de mensajería (extensión ↔ host)

La extensión y el host nativo se comunican mediante **Native Messaging de Chrome**: mensajes JSON con prefijo de longitud de 4 bytes little-endian, sobre stdin/stdout del proceso host.

- Codificación: UTF-8 JSON.
- Prefijo: `uint32` little-endian con la longitud en bytes del payload.
- Tamaño máximo: 1 MiB.

## Extensión → Host

### `ping`

Healthcheck del host.

```json
{ "command": "ping" }
```

### `start`

Arranca wireproxy con el perfil dado y un listener SOCKS5 en `127.0.0.1`. Si `socksPort` es `0`, se usa el puerto por defecto (8869).

```json
{
  "command": "start",
  "socksPort": 0,
  "profile": {
    "id": "uuid",
    "name": "Trabajo",
    "interface": {
      "privateKey": "base64...",
      "address": "10.0.0.2/32",
      "dns": "1.1.1.1",
      "mtu": 1280
    },
    "peer": {
      "publicKey": "base64...",
      "endpoint": "vpn.midominio.com:51820",
      "allowedIPs": "0.0.0.0/0",
      "presharedKey": "",
      "persistentKeepalive": 25
    }
  }
}
```

### `stop`

Detiene el túnel activo.

```json
{ "command": "stop" }
```

### `status`

Consulta el estado actual del túnel.

```json
{ "command": "status" }
```

## Host → Extensión

### `pong`

Respuesta a `ping`.

```json
{ "type": "pong", "version": "0.1.0" }
```

### `started`

wireproxy está corriendo y el SOCKS5 escucha en `socksPort`.

```json
{ "type": "started", "socksPort": 8869 }
```

### `stopped`

El túnel se ha detenido.

```json
{ "type": "stopped" }
```

### `status`

Estado actual.

```json
{
  "type": "status",
  "running": true,
  "socksPort": 8869,
  "profileName": "Trabajo"
}
```

### `error`

Error durante una operación. `code` identifica la categoría.

```json
{ "type": "error", "code": "start_failed", "message": "falta PrivateKey" }
```

Códigos conocidos:

| code | significado |
|---|---|
| `unknown_command` | El comando recibido no existe |
| `missing_profile` | `start` recibido sin `profile` |
| `start_failed` | wireproxy no pudo arrancar (config inválida, endpoint inalcanzable, puerto ocupado, etc.) |

### `log` (notificación asíncrona)

Reenvío de logs de wireproxy. No responde a ningún comando específico.

```json
{ "type": "log", "level": "info", "message": "..." }
```

## Mensajes internos de la extensión (UI ↔ service worker)

Estos no son Native Messaging, sino `chrome.runtime.sendMessage` dentro de la propia extensión:

| command | payload | respuesta |
|---|---|---|
| `connect` | `{ profileId }` | `{ socksPort, profileName }` |
| `disconnect` | — | — |
| `getStatus` | — | `{ host: {running, socksPort, profileName}, state }` |
| `testHost` | — | `{ version }` (pong del host) |
