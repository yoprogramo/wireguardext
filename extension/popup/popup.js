// popup.js — Lógica del popup: toggle de conexión y selector de perfil.

import * as storage from "../lib/storage.js";

const $ = (id) => document.getElementById(id);
const select = $("profile-select");
const btnToggle = $("btn-toggle");
const btnLabel = btnToggle.querySelector(".label");
const badge = $("status-badge");
const meta = $("meta");
const errorBox = $("error");

// Estado UI local.
let uiState = "disconnected"; // disconnected | connecting | connected | error
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
    opt.textContent = "Sin perfiles — configura uno";
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
    if (status?.host?.running) {
      currentProfileId = status.state?.activeProfileId;
      uiState = "connected";
      if (currentProfileId) select.value = currentProfileId;
      showMeta(status.host);
    } else {
      uiState = "disconnected";
      hideMeta();
    }
  } catch (e) {
    uiState = "error";
    showError("No se pudo contactar con el host: " + e.message);
  }
  updateUI();
}

function updateUI() {
  badge.className = "badge";
  switch (uiState) {
    case "connected":
      badge.classList.add("badge-on");
      badge.textContent = "Conectado";
      btnToggle.classList.remove("connecting");
      btnToggle.classList.add("connected");
      btnToggle.disabled = false;
      btnLabel.textContent = "Desconectar";
      break;
    case "connecting":
      badge.classList.add("badge-connecting");
      badge.textContent = "Conectando…";
      btnToggle.classList.add("connecting");
      btnToggle.classList.remove("connected");
      btnToggle.disabled = true;
      btnLabel.textContent = "Conectando…";
      break;
    case "error":
      badge.classList.add("badge-error");
      badge.textContent = "Error";
      btnToggle.classList.remove("connecting", "connected");
      btnToggle.disabled = false;
      btnLabel.textContent = "Reintentar";
      break;
    default: // disconnected
      badge.classList.add("badge-off");
      badge.textContent = "Desconectado";
      btnToggle.classList.remove("connecting", "connected");
      btnToggle.disabled = select.options.length === 0 || select.options[0]?.disabled;
      btnLabel.textContent = "Conectar";
  }
}

function showMeta(host) {
  meta.classList.remove("hidden");
  meta.innerHTML = `SOCKS5: <strong>127.0.0.1:${escapeHtml(host.socksPort)}</strong>`;
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

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
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

render();
