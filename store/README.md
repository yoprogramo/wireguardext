# Store assets — WireGuardExt

Recursos para la ficha de la Chrome Web Store. **Las capturas (.png) hay que
tomarlas manualmente** desde el navegador con la extensión cargada y el host
instalado; aquí está la lista exacta de qué capturar y el texto de la ficha.

---

## Capturas de pantalla

La CWS pide **entre 1 y 5** capturas (formato 1280×800 o 640×400, PNG/JPEG).
Guárdalas en esta carpeta con estos nombres:

| Archivo | Qué mostrar | Cómo obtenerla |
|---|---|---|
| `screenshots/01-popup-connected.png` | El popup con un perfil conectado (badge verde «Connected», botón rojo «Disconnect», dirección SOCKS5 visible). | Configura un perfil real, conéctalo y captura solo el popup (recorta al tamaño 1280×800). |
| `screenshots/02-popup-disconnected.png` | El popup recién abierto, desconectado, con el selector de perfil y el botón azul «Connect». | Desconecta y captura el popup. |
| `screenshots/03-options-list.png` | La página de opciones con 2–3 perfiles en la lista (muestra los endpoint y direcciones). | `chrome-extension://<id>/options/options.html` con varios perfiles creados. |
| `screenshots/04-options-form.png` | El formulario de edición de un perfil (campos PrivateKey, Address, Endpoint, AllowedIPs…). | Pulsa «+ New profile» o «Edit» y captura el formulario rellenado. |
| `screenshots/05-onboarding.png` (opcional) | La página de onboarding con el ID de extensión y los pasos de instalación del host. | Abre el popup sin host instalado → «Install the host component» → captura la pestaña. |

**Consejos:**
- Usa el **modo navegador en inglés** (`chrome://settings/languages`) para
  que las capturas salgan en inglés y sirvan para el listing global, o en
  español si vas a publicar primero el listing en español.
- Oculta o difumina cualquier clave privada / endpoint real antes de subir.
- Recorta a **1280×800** exacto (la CWS lo escala bien a 640×400).

### Plantillas con fondo de marca (opcional pero recomendado)

Hay 5 plantillas SVG **1280×800** en `store/screenshots/` con el fondo de marca
de WireGuardExt y un área punteada donde pegar la captura. Para regenerarlas:

```bash
python3 store/make-templates.py
```

Flujo de edición (con [Inkscape](https://inkscape.org/), gratuito):

1. Abre `store/screenshots/01-popup-connected.svg` (etc.).
2. `Archivo → Importar…` tu captura PNG; colócala dentro del área punteada.
3. Borra el rectángulo punteado y el texto «Pega aquí la captura».
4. `Archivo → Exportar → Exportar PNG` → dimensiones **1280×800**, mismo
   nombre base (`.png`).

Las plantillas de popup (`01`, `02`) ya dibujan una ventana de navegador de
fondo y sitúan el área del popup arriba-derecha, como en Chrome. Las de página
completa (`03`, `04`, `05`) usan un rectángulo limpio a ancho completo.

---

## Texto de la ficha (Description)

Pega este bloque en el campo **Description** del item. Está en inglés porque la
revisión global prioriza ese idioma; el listing en español se añade como
traducción adicional desde el dashboard.

### English (descripción principal)

> **WireGuardExt — Browser-only WireGuard VPN**
>
> Route **only your browser's traffic** through a WireGuard tunnel, without
> touching the rest of your system's networking. Unlike a system-wide VPN,
> WireGuardExt leaves your other apps, games, and background services on their
> normal connection.
>
> **How it works**
> The extension pairs with a small open-source companion app (a userspace
> WireGuard client, [wireproxy](https://github.com/pufferffish/wireproxy)) that
> you install on your computer. It exposes a local SOCKS5 proxy that only this
> browser uses — so DNS and traffic stay inside the tunnel, with no leaks to
> your system.
>
> **Features**
> - 🔒 Browser-only routing: the rest of your system keeps its normal network.
> - 👤 Bring your own server: configure any WireGuard peer you control.
> - 📑 Multiple profiles: keep several VPN endpoints and switch with one click.
> - 📥 Import `.conf` files exported by your WireGuard provider.
> - 🚫 No accounts, no telemetry, no tracking. Your credentials never leave
>   your device.
>
> **Privacy**
> WireGuardExt does not collect, sell, or share your data. Profiles are stored
> locally in your browser. Traffic goes only to the WireGuard server you
> configured. See the full policy: <https://yoprogramo.github.io/wireguardext/>
>
> **Requirements**
> - A working WireGuard server (peer) you can configure.
> - The companion host application, installed once from the
>   [releases page](https://github.com/yoprogramo/wireguardext/releases/latest).
>   The extension will guide you through it the first time.
>
> Open source (Apache-2.0): <https://github.com/yoprogramo/wireguardext>

### Spanish (traducción adicional)

> **WireGuardExt — VPN WireGuard solo para el navegador**
>
> Enruta **únicamente el tráfico de tu navegador** por un túnel WireGuard, sin
> afectar a la conexión del resto del sistema. A diferencia de una VPN global,
> WireGuardExt deja tus otras aplicaciones en su red normal.
>
> **Cómo funciona**
> La extensión se complementa con una pequeña aplicación de código abierto
> (un cliente WireGuard en espacio de usuario,
> [wireproxy](https://github.com/pufferffish/wireproxy)) que instalas en tu
> equipo. Expone un proxy SOCKS5 local que solo usa este navegador, de modo que
> el DNS y el tráfico viajan dentro del túnel, sin fugas al sistema.
>
> **Características**
> - 🔒 Enrutado solo del navegador: el resto del sistema usa su red habitual.
> - 👤 Tu propio servidor: configura cualquier peer de WireGuard que controles.
> - 📑 Varios perfiles: guarda varios endpoints y cambia con un clic.
> - 📥 Importa archivos `.conf` de tu proveedor de WireGuard.
> - 🚫 Sin cuentas, sin telemetría, sin rastreo. Tus credenciales no salen de
>   tu dispositivo.
>
> **Privacidad**
> WireGuardExt no recopila, vende ni comparte tus datos. Los perfiles se
> guardan localmente en tu navegador. El tráfico va únicamente al servidor de
> WireGuard que hayas configurado. Consulta la política completa:
> <https://yoprogramo.github.io/wireguardext/>
>
> **Requisitos**
> - Un servidor WireGuard (peer) funcional que puedas configurar.
> - La aplicación host auxiliar, que se instala una vez desde la
>   [página de releases](https://github.com/yoprogramo/wireguardext/releases/latest).
>   La extensión te guiará la primera vez.
>
> Código abierto (Apache-2.0): <https://github.com/yoprogramo/wireguardext>

---

## Summary (corto, ≤132 caracteres)

> EN: `Route only this browser's traffic through a WireGuard tunnel. Browser-only VPN, no telemetry.`
>
> ES: `Enruta solo el tráfico de tu navegador por un túnel WireGuard. VPN solo para el navegador.`

## Categoría sugerida

`Productivity` (también cabe en `Search Tools`, pero Productivity es más visible).

## Icono de la tienda

Usa `extension/icons/icon-128.png`. Si quieres reemplazarlo por uno más pulido,
regénéralo o sustitúyelo antes de empaquetar el `.zip`.
