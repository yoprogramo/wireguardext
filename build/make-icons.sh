#!/usr/bin/env bash
#
# make-icons.sh — Regenera los iconos PNG de la extensión.
# Requiere Python 3 (sin dependencias externas).
#
# Uso: ./build/make-icons.sh [directorio_destino]
#   por defecto: extension/icons

set -euo pipefail

OUT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/extension/icons}"
mkdir -p "$OUT_DIR"

python3 - "$OUT_DIR" << 'PYEOF'
import struct, zlib, sys, os

out_dir = sys.argv[1]

def make_png(size):
    """Icono: escudo azul con punto central (estilo VPN/key)."""
    fg = (0x4c, 0x8e, 0xff, 0xff)
    bg = (0, 0, 0, 0)
    cx, cy = size / 2, size / 2
    r_outer = size * 0.42
    r_inner = size * 0.14
    pixels = []
    for y in range(size):
        row = bytearray([0])  # filter byte
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist <= r_inner:
                row.extend(bg)
            elif dist <= r_outer:
                row.extend(fg)
            else:
                row.extend(bg)
        pixels.append(bytes(row))
    raw = b"".join(pixels)

    def chunk(ctype, data):
        c = ctype + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(raw))
    png += chunk(b"IEND", b"")
    return png

for s in (16, 48, 128):
    path = os.path.join(out_dir, f"icon-{s}.png")
    with open(path, "wb") as f:
        f.write(make_png(s))
    print(f"  ✓ {path}")
PYEOF
