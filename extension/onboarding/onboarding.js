// onboarding.js — Página de ayuda para instalar el componente host nativo.
//
// Detecta el SO del usuario para mostrar los comandos correctos, rellena el
// ID de extensión y ofrece un botón para comprobar si el host ya responde.

import { applyI18n, t } from "../lib/i18n.js";

applyI18n(document);

// --- Enlace a las releases ---
const RELEASES_URL = "https://github.com/yoprogramo/wireguardext/releases/latest";
document.getElementById("releases-link").href = RELEASES_URL;

// --- Rellenar descripciones según el SO detectado ---
// navigator.platform está deprecated pero sigue disponible; userAgentData es
// la alternativa moderna. Probamos ambas para robustez.
function detectOS() {
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform.toLowerCase();
  }
  return (navigator.platform || "").toLowerCase();
}

const os = detectOS();
const isWindows = os.includes("win");
const isMac = os.includes("mac");

const step2Desc = document.getElementById("step2-desc");
const step3Desc = document.getElementById("step3-desc");

if (isWindows) {
  step2Desc.textContent = t("onboarding_step2_desc_windows");
  step3Desc.textContent = t("onboarding_step3_desc_windows");
} else if (isMac) {
  step2Desc.textContent = t("onboarding_step2_desc_mac");
  step3Desc.textContent = t("onboarding_step3_desc_linux_mac");
} else {
  // Linux y cualquier otro: instrucciones Unix.
  step2Desc.textContent = t("onboarding_step2_desc_linux");
  step3Desc.textContent = t("onboarding_step3_desc_linux_mac");
}

// --- ID de extensión ---
// chrome.runtime.id contiene el ID de esta extensión (32 chars a-p en Chrome).
const extIdInput = document.getElementById("ext-id");
extIdInput.value = chrome.runtime.id || "";

// --- Botón de comprobación ---
const btnCheck = document.getElementById("btn-check");
const statusMsg = document.getElementById("status-msg");

function sendCommand(command) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ command }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        reject(new Error(response?.error ?? "error"));
      } else {
        resolve(response.data);
      }
    });
  });
}

btnCheck.addEventListener("click", async () => {
  statusMsg.className = "status checking";
  statusMsg.textContent = t("onboarding_status_checking");
  try {
    const status = await sendCommand("getStatus");
    if (status?.hostMissing || !status?.host) {
      statusMsg.className = "status missing";
      statusMsg.textContent = t("onboarding_status_missing");
    } else {
      statusMsg.className = "status ok";
      statusMsg.textContent = t("onboarding_status_ok");
    }
  } catch (e) {
    statusMsg.className = "status missing";
    statusMsg.textContent = t("onboarding_status_missing");
  }
});
