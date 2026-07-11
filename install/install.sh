#!/usr/bin/env bash
#
# Instala el native messaging host de WireGuardExt para Chromium/Chrome/Edge en Linux.
# No requiere root: instala en rutas de usuario.
#
# Uso:
#   ./install.sh                  # instala con el ID de extensión pedido
#   ./install.sh <extension-id>   # instala con un ID dado (32 caracteres a-p)
#
# Tras instalar, recarga la extensión en chrome://extensions.

set -euo pipefail

HOST_NAME="com.wireguardext.host"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_BIN="$PROJECT_DIR/host/wireguardext-host"

# --- ID de la extensión ---
EXTENSION_ID="${1:-}"
if [[ -z "$EXTENSION_ID" ]]; then
  echo "Introduce el ID de la extensión (lo ves en chrome://extensions):"
  echo "  Ej:abcdefghijklmnopabcdefghijklmnop"
  read -r EXTENSION_ID
fi
if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Error: el ID de extensión debe tener 32 caracteres entre a y p." >&2
  exit 1
fi

# --- Verificar que el binario del host existe o construirlo ---
if [[ ! -x "$HOST_BIN" ]]; then
  if command -v go >/dev/null 2>&1; then
    echo "Construyendo el host con Go…"
    (cd "$PROJECT_DIR/host" && go build -o "$HOST_BIN" .)
  else
    echo "Error: no se encontró el binario '$HOST_BIN' ni 'go' para construirlo." >&2
    echo "Instala Go desde https://go.dev/dl/ o compila el host manualmente." >&2
    exit 1
  fi
fi

# --- Directorio de instalación (usuario) ---
INSTALL_DIR="$HOME/.local/share/wireguardext"
mkdir -p "$INSTALL_DIR"
cp "$HOST_BIN" "$INSTALL_DIR/wireguardext-host"
chmod +x "$INSTALL_DIR/wireguardext-host"

# --- Generar manifest de Native Messaging con la ruta real ---
MANIFEST_TEMPLATE="$SCRIPT_DIR/${HOST_NAME}.json"
HOST_PATH="$INSTALL_DIR/wireguardext-host"
MANIFEST_OUT="$INSTALL_DIR/${HOST_NAME}.json"

sed -e "s|__HOST_PATH_PLACEHOLDER__|$HOST_PATH|g" \
    -e "s|__EXTENSION_ID_PLACEHOLDER__|$EXTENSION_ID|g" \
    "$MANIFEST_TEMPLATE" > "$MANIFEST_OUT"

# --- Registrar el manifest en cada navegador instalado ---
NM_DIRS=(
  "$HOME/.config/google-chrome/NativeMessagingHosts"
  "$HOME/.config/chromium/NativeMessagingHosts"
  "$HOME/.config/google-chrome-beta/NativeMessagingHosts"
  "$HOME/.config/microsoft-edge/NativeMessagingHosts"
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/.config/vivaldi/NativeMessagingHosts"
)

registered=0
for nm_dir in "${NM_DIRS[@]}"; do
  if [[ -d "$(dirname "$nm_dir")" ]]; then
    mkdir -p "$nm_dir"
    cp "$MANIFEST_OUT" "$nm_dir/${HOST_NAME}.json"
    echo "Registrado en: $nm_dir/${HOST_NAME}.json"
    registered=$((registered + 1))
  fi
done

if [[ "$registered" -eq 0 ]]; then
  # No se detectó ningún navegador: dejamos el manifest en ~/.config/google-chrome
  # como ubicación por defecto para que el usuario la mueva si hace falta.
  nm_dir="$HOME/.config/google-chrome/NativeMessagingHosts"
  mkdir -p "$nm_dir"
  cp "$MANIFEST_OUT" "$nm_dir/${HOST_NAME}.json"
  echo "No se detectaron navegadores conocidos. Manifest escrito en:"
  echo "  $nm_dir/${HOST_NAME}.json"
  echo "Si usas otro navegador, copia el fichero a su carpeta NativeMessagingHosts."
fi

echo ""
echo "✓ Instalación completada."
echo "  Binario: $HOST_PATH"
echo "  Manifest: $MANIFEST_OUT"
echo ""
echo "Ahora carga la extensión en chrome://extensions (modo desarrollador) si no lo has hecho,"
echo "y recarga el service worker. Ya puedes usar WireGuardExt."
