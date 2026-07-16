// popup.js — Lógica del popup: toggle de conexión y selector de perfil.

import * as storage from "../lib/storage.js";
import { applyI18n, t } from "../lib/i18n.js";

// Traducir las cadenas estáticas del HTML.
applyI18n(document);

const $ = (id) => document.getElementById(id);
const select = $("profile-select");
const btnToggle = $("btn-toggle");
const btnLabel = btnToggle.querySelector(".label");
const badge = $("status-badge");
const meta = $("meta");
const errorBox = $("error");
const hostMissing = $("host-missing");
const btnInstallHost = $("btn-install-host");

// Estado UI local.
let uiState = "disconnected"; // disconnected | connecting | connected | error | host_missing
let currentProfileId = null;

/** Envía un comando al service worker. */
function sendCommand(command, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ command, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        reject(new Error(response?.error ?? "error desconocido"));
      } else {
        resolve(response.data);
      }
    });
  });
}

// --- Render ---

async function render() {
  // Cargar perfiles.
  const profiles = await storage.getProfiles();
  select.innerHTML = "";
  if (profiles.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = t("no_profiles");
    opt.disabled = true;
    select.append(opt);
    btnToggle.disabled = true;
  } else {
    for (const p of profiles) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.append(opt);
    }
    btnToggle.disabled = false;
  }

  // Cargar estado actual desde el SW.
  try {
    const status = await sendCommand("getStatus");
    // Si el host no está instalado / no responde, el SW lo señala.
    if (status?.hostMissing || status?.host === null || status?.host === undefined) {
      showHostMissing();
    } else if (status?.host?.running) {
      currentProfileId = status.state?.activeProfileId;
      uiState = "connected";
      if (currentProfileId) select.value = currentProfileId;
      showMeta(status.host);
    } else {
      uiState = "disconnected";
      hideMeta();
    }
  } catch (e) {
    showError(t("error_no_host", e.message));
    uiState = "error";
  }
  updateUI();
}

function updateUI() {
  badge.className = "badge";
  // Ocultar el bloque de host ausente salvo en su estado.
  hostMissing.classList.toggle("hidden", uiState !== "host_missing");

  switch (uiState) {
    case "connected":
      badge.classList.add("badge-on");
      badge.textContent = t("status_connected");
      btnToggle.classList.remove("connecting");
      btnToggle.classList.add("connected");
      btnToggle.disabled = false;
      btnLabel.textContent = t("btn_disconnect");
      break;
    case "connecting":
      badge.classList.add("badge-connecting");
      badge.textContent = t("status_connecting");
      btnToggle.classList.add("connecting");
      btnToggle.classList.remove("connected");
      btnToggle.disabled = true;
      btnLabel.textContent = t("status_connecting");
      break;
    case "host_missing":
      // El bloque host-missing ya está visible; el botón principal queda oculto.
      badge.classList.add("badge-error");
      badge.textContent = t("status_error");
      btnToggle.disabled = true;
      break;
    case "error":
      badge.classList.add("badge-error");
      badge.textContent = t("status_error");
      btnToggle.classList.remove("connecting", "connected");
      btnToggle.disabled = false;
      btnLabel.textContent = t("btn_retry");
      break;
    default: // disconnected
      badge.classList.add("badge-off");
      badge.textContent = t("status_disconnected");
      btnToggle.classList.remove("connecting", "connected");
      btnToggle.disabled = select.options.length === 0 || select.options[0]?.disabled;
      btnLabel.textContent = t("btn_connect");
  }
}

function showMeta(host) {
  meta.classList.remove("hidden");
  // host.socksPort es numérico; meta_socks incluye el prefijo "SOCKS5: 127.0.0.1:".
  meta.textContent = t("meta_socks", host.socksPort);
}
function hideMeta() {
  meta.classList.add("hidden");
}
function showError(msg) {
  errorBox.classList.remove("hidden");
  errorBox.textContent = msg;
}
function hideError() {
  errorBox.classList.add("hidden");
}

/** Conmuta el popup al estado "host no instalado". */
function showHostMissing() {
  uiState = "host_missing";
  hideMeta();
  hideError();
}

// --- Acciones ---

btnToggle.addEventListener("click", async () => {
  hideError();
  if (uiState === "connected") {
    uiState = "connecting";
    updateUI();
    try {
      await sendCommand("disconnect");
      uiState = "disconnected";
      hideMeta();
    } catch (e) {
      uiState = "error";
      showError(e.message);
    }
  } else {
    const profileId = select.value;
    if (!profileId) return;
    uiState = "connecting";
    updateUI();
    try {
      const result = await sendCommand("connect", { profileId });
      currentProfileId = profileId;
      uiState = "connected";
      showMeta({ socksPort: result.socksPort });
    } catch (e) {
      uiState = "error";
      showError(e.message);
    }
  }
  updateUI();
});

$("btn-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Abre la página de onboarding (instalación del host) en una pestaña nueva.
btnInstallHost.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
});

render();
