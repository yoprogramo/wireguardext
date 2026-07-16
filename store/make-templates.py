#!/usr/bin/env python3
# make-templates.py — Genera plantillas SVG 1280×800 para las capturas de la
# Chrome Web Store, con el fondo de marca de WireGuardExt y un área marcada
# donde pegar la captura.
#
# Uso:
#   python3 store/make-templates.py
#
# Produce un .svg por captura en store/screenshots/, con el mismo nombre base
# que la imagen final (solo cambia la extensión). Edita cada SVG en Inkscape,
# pega tu captura en el área punteada y exporta a PNG a 1280×800.

import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT_DIR, exist_ok=True)

# --- Tokens de diseño (coinciden con la UI de la extensión) ---
BG_TOP = "#0f1115"
BG_BOTTOM = "#181b22"
ACCENT = "#4c8eff"
TEXT = "#e6e8ec"
DIM = "#9aa0aa"
BORDER = "#2c313c"

W, H = 1280, 800


def shield(cx, cy, r):
    """Escudo azul con punto central (marca de la extensión)."""
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{ACCENT}"/>' \
           f'<circle cx="{cx}" cy="{cy}" r="{r*0.34}" fill="{BG_TOP}"/>'


def header(title, subtitle):
    """Marca arriba-izquierda + título y subtítulo centrados."""
    return f"""
    <g id="header">
      {shield(64, 56, 16)}
      <text x="92" y="63" font-family="sans-serif" font-size="22" font-weight="600" fill="{TEXT}">WireGuardExt</text>
      <text x="{W/2}" y="120" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="{TEXT}">{title}</text>
      <text x="{W/2}" y="152" text-anchor="middle" font-family="sans-serif" font-size="16" fill="{DIM}">{subtitle}</text>
    </g>"""


def footer():
    return f"""
    <text x="{W/2}" y="772" text-anchor="middle" font-family="sans-serif" font-size="13" fill="{DIM}">
      github.com/yoprogramo/wireguardext  ·  pega tu captura en el área punteada y exporta a PNG 1280×800
    </text>"""


def placeholder(x, y, w, h, label):
    """Área punteada donde pegar la captura."""
    cx, cy = x + w / 2, y + h / 2
    return f"""
    <g id="placeholder">
      <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12"
            fill="none" stroke="{ACCENT}" stroke-width="2" stroke-dasharray="10 8"/>
      <text x="{cx}" y="{cy - 8}" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="600" fill="{DIM}">{label}</text>
      <text x="{cx}" y="{cy + 20}" text-anchor="middle" font-family="sans-serif" font-size="15" fill="{DIM}">Pega aquí la captura</text>
    </g>"""


def wide_template(title, subtitle, label):
    """Plantilla para capturas anchas (página completa: options/form/onboarding).
    La captura ya incluye el marco del navegador, así que el área es un rectángulo limpio."""
    body = placeholder(60, 180, 1160, 560, label)
    return svg(title, subtitle, body)


def popup_template(title, subtitle, label):
    """Plantilla para capturas del popup. Dibuja un escritorio/navegador de fondo
    y sitúa el área del popup arriba-derecha, como en Chrome."""
    # Ventana del navegador simulada.
    win_x, win_y, win_w, win_h = 60, 180, 1160, 560
    bar_h = 40
    browser = f"""
    <g id="browser">
      <rect x="{win_x}" y="{win_y}" width="{win_w}" height="{win_h}" rx="10" fill="#11141a" stroke="{BORDER}"/>
      <rect x="{win_x}" y="{win_y}" width="{win_w}" height="{bar_h}" rx="10" fill="#1b1f27"/>
      <rect x="{win_x}" y="{win_y + bar_h - 10}" width="{win_w}" height="10" fill="#1b1f27"/>
      <circle cx="{win_x + 22}" cy="{win_y + 20}" r="6" fill="#ff5f56"/>
      <circle cx="{win_x + 44}" cy="{win_y + 20}" r="6" fill="#ffbd2e"/>
      <circle cx="{win_x + 66}" cy="{win_y + 20}" r="6" fill="#27c93f"/>
      <rect x="{win_x + 140}" y="{win_y + 10}" width="900" height="22" rx="11" fill="{BG_TOP}"/>
      <rect x="{win_x + 140}" y="{win_y + 10}" width="520" height="22" rx="11" fill="none" stroke="{BORDER}"/>
      <text x="{win_x + 160}" y="{win_y + 26}" font-family="sans-serif" font-size="13" fill="{DIM}">chrome-extension://…</text>
    </g>"""
    # Área del popup: arriba-derecha, donde aparece en Chrome.
    popup = placeholder(820, 240, 360, 480, label)
    return svg(title, subtitle, browser + popup)


def svg(title, subtitle, body):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- Plantilla 1280×800 para {title}.
     Edita en Inkscape: importa/pega tu captura, ajústala al área punteada,
     y exporta a PNG (Archivo → Exportar PNG) a 1280×800 con el mismo nombre base. -->
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{BG_TOP}"/>
      <stop offset="1" stop-color="{BG_BOTTOM}"/>
    </linearGradient>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <!-- acento sutil -->
  <rect y="0" width="{W}" height="4" fill="{ACCENT}"/>

  {header(title, subtitle)}
  {body}
  {footer()}
</svg>
"""


SHOTS = [
    # (nombre_base, título, subtítulo, etiqueta del área, layout)
    ("01-popup-connected", "Connected — tunnel active",
     "Badge «Connected», SOCKS5 address visible", "Popup capture", "popup"),
    ("02-popup-disconnected", "Disconnected — ready to connect",
     "Profile selector + «Connect» button", "Popup capture", "popup"),
    ("03-options-list", "Manage your VPN profiles",
     "Multiple profiles with endpoints", "Screenshot", "wide"),
    ("04-options-form", "Create or edit a profile",
     "PrivateKey, Address, Endpoint, AllowedIPs…", "Screenshot", "wide"),
    ("05-onboarding", "Guided host installation",
     "First-run onboarding for the native host", "Screenshot", "wide"),
]


def main():
    for name, title, sub, label, layout in SHOTS:
        if layout == "popup":
            content = popup_template(title, sub, label)
        else:
            content = wide_template(title, sub, label)
        path = os.path.join(OUT_DIR, name + ".svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  ✓ {path}")


if __name__ == "__main__":
    main()
