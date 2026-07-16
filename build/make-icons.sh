#!/usr/bin/env bash
#
# make-icons.sh — Regenera los iconos PNG de la extensión desde el SVG fuente.
#
# Toma build/icon.svg y lo rasteriza a 16/48/128 px. Busca el rasterizador
# disponible (rsvg-convert, convert/ImageMagick o inkscape).
#
# Uso: ./build/make-icons.sh [directorio_destino]
#   por defecto: extension/icons

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_SVG="$SCRIPT_DIR/icon.svg"
OUT_DIR="${1:-$(cd "$SCRIPT_DIR/.." && pwd)/extension/icons}"
SIZES=(16 48 128)

if [[ ! -f "$SRC_SVG" ]]; then
  echo "Error: no se encuentra el SVG fuente: $SRC_SVG" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# --- Elegir rasterizador disponible ---
rasterize() {
  local size="$1" out="$2"
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" "$SRC_SVG" -o "$out"
  elif command -v inkscape >/dev/null 2>&1; then
    inkscape "$SRC_SVG" -w "$size" -h "$size" -o "$out" 2>/dev/null
  elif command -v convert >/dev/null 2>&1; then
    convert -background none -resize "${size}x${size}" "$SRC_SVG" "$out"
  else
    echo "Error: se necesita rsvg-convert, inkscape o ImageMagick (convert)." >&2
    echo "  Debian/Ubuntu: sudo apt install librsvg2-bin" >&2
    echo "  Arch:          sudo pacman -S librsvg" >&2
    exit 1
  fi
}

for s in "${SIZES[@]}"; do
  out="$OUT_DIR/icon-${s}.png"
  rasterize "$s" "$out"
  echo "  ✓ $out"
done

echo "Iconos generados en: $OUT_DIR"
