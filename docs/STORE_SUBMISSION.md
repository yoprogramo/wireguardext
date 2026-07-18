# Chrome Web Store — Submission guide

Guía paso a paso para publicar WireGuardExt en la Chrome Web Store (CWS). Los
campos están pensados para pasar la **revisión humana**, que es más estricta
para extensiones con permisos `proxy` + `nativeMessaging`.

> Antes de empezar, activa **GitHub Pages** en este repo (Settings → Pages →
> Source: `main` / carpeta `/docs`). Esto publica la política de privacidad en
> `https://yoprogramo.github.io/wireguardext/`, URL necesaria en el paso 4.

---

## 0. Cuenta de desarrollador

- Ve a <https://chrome.google.com/webstore/devportal/>.
- Inicia sesión con la cuenta de Google que publicará la extensión.
- Paga la **tarifa única de 5 USD** (verificación de identidad obligatoria;
  tarjeta y, según la región, verificación por teléfono).

---

## 1. Crear el item y subir el .zip

```bash
./build/package.sh extension     # genera dist/wireguardext-extension-vX.Y.Z.zip
```

- En el dashboard → **Add new item** → arrastra
  `dist/wireguardext-extension-v0.2.0.zip`.
- **Importante:** sube el `.zip` (no «cargar descomprimida»). Solo el zip
  publicado pasa por revisión y recibe un ID estable.

---

## 2. Store listing (ficha)

| Campo | Valor |
|---|---|
| **Name** | `WireGuardExt` (se toma del `name` del manifest; el listing puede sobreescribirlo) |
| **Summary** (≤132 chars) | `Route only this browser's traffic through a WireGuard tunnel, without affecting the rest of the system.` |
| **Category** | `Productivity` |
| **Language** | `English`; añade `Spanish` como traducción adicional |
| **Icon** (128×128) | `extension/icons/icon-128.png` |
| **Screenshots** | 1–5 imágenes (ver `store/README.md`). Mínimo 1 obligatorio. |
| **Small promo tile** (440×280) | Opcional pero recomendado. |
| **Marquee promo** (1400×560) | Opcional. |

### Texto descriptivo (Description)

Usa el borrador de `store/README.md` (sección «Description»). Pégalo aquí.

---

## 3. Privacy practices  ⚠️ **la parte más crítica**

Pestaña **Privacy practices** del item. Es lo que más revisa el equipo de
Chrome para permisos sensibles.

### 3a. Privacy policy URL

```
https://yoprogramo.github.io/wireguardext/
```

(Servida por GitHub Pages desde `docs/index.html`; el contenido está en
`docs/PRIVACY.md`.)

### 3b. Permission justification

Para **cada** permiso, indica por qué es necesario y si expone datos sensibles:

- **`proxy`** — *To route the browser's traffic through the user's own
  WireGuard SOCKS5 tunnel running locally, and to restore the direct
  connection when the user disconnects. Does not intercept or read page
  content.* — No recopila datos.
- **`storage`** — *To save the user's WireGuard profiles and connection
  state locally on their device, so the configuration persists across
  browser restarts.* — Almacena localmente credenciales del usuario; no se
  envían a ningún servidor del desarrollador.
- **`nativeMessaging`** — *To communicate with the local companion host
  application (the user installs it separately) that runs the userspace
  wireproxy WireGuard client. Communication is local (stdin/stdout), not a
  network socket.* — No recopila datos.

### 3c. Single purpose

Campo obligatorio (≤132 chars). Una frase que describa el único propósito:

```
Route browser traffic through a user-configured WireGuard VPN tunnel, without affecting system-wide networking.
```

### 3d. Data usage declarations

- **Authentication:** No — *This extension does not require authentication
  and does not request accounts.*
- **Personally identifiable information:** No.
- **Financial / payment:** No.
- **Personal communications:** No.
- **Location:** No.
- **Web history:** No.
- **User activity / website content:** No.
- Marca **“I do not sell or transfer user data to third parties.”**
- Marca **“I do not use or transfer user data for purposes unrelated to my
  item's single purpose.”**

> Como no declaras ningún permiso que use datos, aparecerás en la categoría
> de extensión que **no requiere divulgación de ventas de datos**. Esto ayuda
> a pasar la revisión.

### 3e. Remote code

- Marca **“No, I am not using remote code.”** — La extensión no carga ni
  ejecuta código externo (sin `eval`, sin scripts remotos; verificado por CI).

---

## 4. Distribution

- **Visibility:** elige `Public` (aparece en búsquedas) o `Unlisted`
  (instalable solo con enlace directo). `Unlisted` es útil para hacer
  pruebas con usuarios elegidos antes de hacerla pública.
- **Regions:** por defecto todas; puedes limitarlas.

---

## 5. Tras la primera publicación: el ID del host

La CWS asigna un **ID de extensión** al publicar (ej.
`abcdefghijklmnopqrstuvwxyzabcdef`). Este ID es el que debe registrarse en el
**native messaging host** del usuario para que la extensión pueda hablar con él.

El flujo de instalación del host ya lo gestiona:

```bash
./install.sh <extension-id>                                    # Linux/macOS
powershell -ExecutionPolicy Bypass -File .\install.ps1         # Windows (pide el ID)
```

> En Windows el flag `-ExecutionPolicy Bypass` es necesario porque la
> ejecución de scripts viene deshabilitada por defecto; sin él el usuario ve
> «no se puede cargar porque la ejecución de scripts está deshabilitada en
> este sistema». Alternativamente puede fijarlo una sola vez con
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

> **Nota sobre forzar un ID:** si quieres que el ID sea predecible *antes* de
> subir la primera versión, puedes subir el `.zip` una vez, anotar el ID, y
> luego seguir publicando. No necesitas generar una clave `.pem` privada
> salvo que quieras mantener el mismo ID en stores/derivados.

---

## 6. Checklist final

- [ ] `manifest.json` con `version`, `default_locale`, `homepage_url`.
- [ ] `.zip` regenerado con `./build/package.sh extension`.
- [ ] GitHub Pages activo y la URL de privacidad responde (`200 OK`).
- [ ] Privacy practices rellenada (single purpose + justificaciones + todas
      las declaraciones de datos en «No»).
- [ ] Al menos 1 screenshot subido (1280×800 o 640×400).
- [ ] Icono 128×128 subido.
- [ ] Sin código remoto (verificado por CI / revisión manual).
