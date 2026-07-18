# Instala el native messaging host de WireGuardExt para Chrome/Edge en Windows.
# Registra en HKCU (no requiere administrador).
#
# Uso (PowerShell):
#   .\install.ps1                          # pide el ID de extensión
#   .\install.ps1 -ExtensionId <id>       # con ID dado
#
# ---------------------------------------------------------------------------
# ¿No te deja ejecutar el script? (error "no se puede cargar porque la
# ejecución de scripts está deshabilitada en este sistema")
#
# Windows trae ExecutionPolicy restringida por defecto. Tres opciones:
#
#   A) Ejecutar esta vez sin cambiar la global (recomendado, solo esta sesión):
#        powershell -ExecutionPolicy Bypass -File .\install.ps1
#
#   B) Desactivar la restricción SOLO en la sesión actual de PowerShell:
#        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#        .\install.ps1
#
#   C) Permitir scripts para tu usuario de forma permanente:
#        Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#        .\install.ps1
#
#   (RemoteSigned permite scripts locales firmados/descargados; sigue
#    requiriendo firma para scripts descargados de Internet.)
# ---------------------------------------------------------------------------

param(
    [Parameter(Mandatory=$false)]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"
$HostName = "com.wireguardext.host"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir

# --- Localizar el binario del host ---
# Orden de busqueda:
#   1. Mismo directorio que este script (como viene en el .zip de la release:
#      el .exe va junto a install.ps1).
#   2. ..\host\wireguardext-host.exe (arbol de desarrollo / compilacion local).
#   3. Si no existe y hay Go, se compila desde las fuentes.
$HostBin = Join-Path $ScriptDir "wireguardext-host.exe"
if (-not (Test-Path $HostBin)) {
    $HostBin = Join-Path $ProjectDir "host\wireguardext-host.exe"
}

# --- ID de extensión ---
if (-not $ExtensionId) {
    Write-Host "Introduce el ID de la extensión (lo ves en chrome://extensions):" -ForegroundColor Cyan
    $ExtensionId = Read-Host
}
if ($ExtensionId -notmatch '^[a-p]{32}$') {
    Write-Error "El ID de extensión debe tener 32 caracteres entre a y p."
    exit 1
}

# --- Verificar binario ---
if (-not (Test-Path $HostBin)) {
    if (Get-Command go -ErrorAction SilentlyContinue) {
        Write-Host "Construyendo el host con Go..." -ForegroundColor Yellow
        Push-Location (Join-Path $ProjectDir "host")
        go build -o $HostBin .
        Pop-Location
    } else {
        Write-Error "No se encontro el binario '$HostBin' ni Go para construirlo. Instala Go desde https://go.dev/dl/."
        exit 1
    }
}

# --- Directorio de instalación ---
$InstallDir = Join-Path $env:LOCALAPPDATA "wireguardext"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $HostBin (Join-Path $InstallDir "wireguardext-host.exe") -Force
$HostPath = Join-Path $InstallDir "wireguardext-host.exe"

# --- Generar manifest ---
$ManifestTemplate = Join-Path $ScriptDir "$HostName.json"
$ManifestOut = Join-Path $InstallDir "$HostName.json"
(Get-Content $ManifestTemplate) `
    -replace '__HOST_PATH_PLACEHOLDER__', ($HostPath -replace '\\', '\\') `
    -replace '__EXTENSION_ID_PLACEHOLDER__', $ExtensionId |
    Set-Content $ManifestOut

# --- Registrar en Chrome (HKCU, no requiere admin) ---
$chromeKey = "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\$HostName"
New-Item -Path $chromeKey -Force | Out-Null
Set-ItemProperty -Path $chromeKey -Name "(Default)" -Value $ManifestOut

# --- Registrar en Edge ---
$edgeKey = "HKCU:\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\$HostName"
New-Item -Path $edgeKey -Force | Out-Null
Set-ItemProperty -Path $edgeKey -Name "(Default)" -Value $ManifestOut

Write-Host ""
Write-Host "Instalacion completada." -ForegroundColor Green
Write-Host "  Binario:   $HostPath"
Write-Host "  Manifest:  $ManifestOut"
Write-Host "  Registro:  Chrome y Edge (HKCU)"
Write-Host ""
Write-Host "Carga la extension en chrome://extensions (modo desarrollador) y recarga el service worker."
