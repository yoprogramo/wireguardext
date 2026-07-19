#!/usr/bin/env bash
#
# package.sh — Empaqueta wireguardext para distribución.
#
# Genera:
#   dist/wireguardext-extension.zip     — la extensión (cargar en chrome://extensions)
#   dist/wireguardext-host-linux-amd64.tar.gz
#   dist/wireguardext-host-linux-arm64.tar.gz
#   dist/wireguardext-host-darwin-amd64.tar.gz   (macOS)
#   dist/wireguardext-host-darwin-arm64.tar.gz   (macOS Apple Silicon)
#   dist/wireguardext-host-windows-amd64.zip
#   dist/wireguardext-host-windows-arm64.zip
#
# Uso:
#   ./build/package.sh              # todo
#   ./build/package.sh extension    # solo la extensión
#   ./build/package.sh host         # solo los binarios del host
#
# Requisitos:
#   - Go (en PATH o en ~/.local/go)
#   - zip
#   - tar

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
HOST_DIR="$ROOT_DIR/host"
EXT_DIR="$ROOT_DIR/extension"
INSTALL_DIR="$ROOT_DIR/install"

# Versión: se lee del manifest de la extensión (source of truth).
VERSION="$(python3 -c "import json; print(json.load(open('$EXT_DIR/manifest.json'))['version'])")"
PKG_NAME="wireguardext"

# --- Go al PATH si está en ~/.local/go ---
if ! command -v go >/dev/null 2>&1 && [[ -x "$HOME/.local/go/bin/go" ]]; then
  export PATH="$HOME/.local/go/bin:$PATH"
fi

if ! command -v go >/dev/null 2>&1; then
  echo "Error: Go no está instalado." >&2
  exit 1
fi

# Targets: "os/arch" -> "sufijo del binario"
TARGETS=(
  "linux/amd64"
  "linux/arm64"
  "darwin/amd64"
  "darwin/arm64"
  "windows/amd64"
  "windows/arm64"
)

WHAT="${1:-all}"

mkdir -p "$DIST_DIR"

# =============================================================================
# Extensión
# =============================================================================
build_extension() {
  echo "📦 Empaquetando extensión v$VERSION..."
  local out="$DIST_DIR/${PKG_NAME}-extension-v${VERSION}.zip"

  # Validar que los iconos existen (faltan en git, se regeneran).
  if [[ ! -f "$EXT_DIR/icons/icon-128.png" ]]; then
    echo "  Generando iconos..." >&2
    "$SCRIPT_DIR/make-icons.sh" "$EXT_DIR/icons" 2>/dev/null || true
  fi

  # El manifest del repo lleva "key" para fijar el ID en cargas descomprimidas,
  # pero la Chrome Web Store rechaza subir un .zip con key embebida (Google firma
  # el .crx con su propia clave). Empaquetamos desde un staging con un manifest
  # temporal sin "key" ni "_key_doc".
  local staging="$DIST_DIR/staging-extension"
  rm -rf "$staging"
  mkdir -p "$staging"
  cp -R "$EXT_DIR/." "$staging/"
  python3 -c "
import json, sys
m = json.load(open('$staging/manifest.json'))
m.pop('key', None)
m.pop('_key_doc', None)
json.dump(m, open('$staging/manifest.json', 'w'), indent=2, ensure_ascii=False)
print('', file=open('$staging/manifest.json', 'a'))
"
  echo "  (manifiesto del .zip sin 'key' para la tienda)"

  (cd "$staging" && zip -qr "$out" . \
    -x '*.DS_Store' -x '*/.*')
  rm -rf "$staging"
  echo "  ✓ $out"
}

# =============================================================================
# Host (cross-compile por plataforma)
# =============================================================================
build_host() {
  echo "🔨 Compilando host para ${#TARGETS[@]} plataformas..."

  for target in "${TARGETS[@]}"; do
    local os="${target%%/*}"
    local arch="${target##*/}"
    local ext=""
    [[ "$os" == "windows" ]] && ext=".exe"

    local bin_name="${PKG_NAME}-host${ext}"
    local staging="$DIST_DIR/staging/${PKG_NAME}-${os}-${arch}"
    rm -rf "$staging"
    mkdir -p "$staging"

    echo "  · $os/$arch..."
    ( cd "$HOST_DIR" && \
      CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build \
        -trimpath -ldflags="-s -w" \
        -o "$staging/$bin_name" . ) || {
        echo "    Error compilando $os/$arch" >&2
        continue
      }

    # Copiar instaladores y manifest NM junto al binario.
    cp "$INSTALL_DIR/install.sh" "$staging/" 2>/dev/null || true
    cp "$INSTALL_DIR/install.ps1" "$staging/" 2>/dev/null || true
    cp "$INSTALL_DIR/com.wireguardext.host.json" "$staging/" 2>/dev/null || true
    cp "$ROOT_DIR/README.md" "$staging/README.md"

    # Empaquetar según SO.
    local archive
    if [[ "$os" == "windows" ]]; then
      archive="$DIST_DIR/${PKG_NAME}-host-${os}-${arch}-v${VERSION}.zip"
      (cd "$staging" && zip -qr "$archive" .)
    else
      archive="$DIST_DIR/${PKG_NAME}-host-${os}-${arch}-v${VERSION}.tar.gz"
      tar -C "$staging" -czf "$archive" .
    fi
    echo "    ✓ $(basename "$archive")"
  done

  rm -rf "$DIST_DIR/staging"
}

# =============================================================================
# Ejecución
# =============================================================================
case "$WHAT" in
  all)
    build_extension
    build_host
    ;;
  extension) build_extension ;;
  host) build_host ;;
  *)
    echo "Uso: $0 [all|extension|host]" >&2
    exit 1
    ;;
esac

echo ""
echo "✅ Empaquetado completado en: $DIST_DIR"
ls -1 "$DIST_DIR" 2>/dev/null | head -20
