// service-worker.js — Orquestador principal de la extensión.
//
// Responsabilidades:
//   1. Inicializar la conexión con el host nativo al arrancar.
//   2. Exponer comandos a la UI (popup/options) vía chrome.runtime.onMessage.
//   3. Al reconectar el SW, reconsultar status y reaplicar el proxy si el túnel
//      seguía activo (resiliencia ante muerte del SW de MV3).
//   4. Reenviar notificaciones del host (log) a quien esté suscrito.

import * as storage from "../lib/storage.js";
import * as native from "../lib/native.js";
import { applyProxy, clearProxy } from "../lib/proxy.js";

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  native.init();
});

chrome.runtime.onStartup.addListener(() => {
  native.init();
  // El SW puede haber muerto mientras wireproxy seguía corriendo en el host.
  // Reconsultamos estado y reaplicamos el proxy si procede.
  reconcileAfterStartup();
});

// También al cargar el SW por cualquier motivo (no solo onStartup/onInstalled),
// porque MV3 puede matarlo y revivirlo en cualquier momento.
native.init();
reconcileAfterStartup();

/**
 * Tras revivir el SW, reconcilia el estado persistido (storage) con el estado
 * real del host y la configuración de proxy del navegador. Resuelve las
 * inconsistencias que surgen cuando el SW muere a mitad de una operación.
 *
 * Combinaciones posibles:
 *   storage.connected | host.running | acción
 *   ------------------+--------------+------------------------------------------
 *   true              | true         | OK: reaplicar proxy (por si el SW murió)
 *   true              | false        | el túnel se cayó: limpiar estado + proxy
 *   false             | true         * TÚNEL HUÉRFANO: el usuario se desconectó
 *                                   *   mientras el SW estaba muerto y el stop no
 *                                   *   llegó. Forzar stop y limpiar.
 *   false             | false        | OK: limpiar por seguridad
 */
async function reconcileAfterStartup() {
  // Dar un margen breve para que la conexión nativa se establezca.
  await sleep(500);
  try {
    const st = await native.status().catch(() => null);
    const state = await storage.getState();
    const hostRunning = !!(st && st.running && st.socksPort);

    if (state.connected && hostRunning) {
      // Caso nominal: el usuario quería estar conectado y el túnel vive.
      await applyProxy(st.socksPort);
      await storage.setState({ connected: true, proxyPort: st.socksPort });
    } else if (state.connected && !hostRunning) {
      // El túnel murió (caída del host, reinicio del equipo, etc.).
      await storage.setState({ connected: false, proxyPort: null, activeProfileId: null });
      await clearProxy();
    } else if (!state.connected && hostRunning) {
      // Túnel huérfano: el usuario se desconectó pero el stop no llegó al host.
      console.warn("Detectado túnel huérfano: forzando stop en el host.");
      await native.stop().catch(() => {});
      await clearProxy();
      await storage.setState({ connected: false, proxyPort: null, activeProfileId: null });
    } else {
      // Ambos en false: asegurar que el proxy está limpio.
      await clearProxy();
    }
  } catch (e) {
    // Si el host no responde, dejamos el estado como está.
    console.warn("No se pudo reconciliar el estado al arrancar:", e.message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Comandos desde la UI ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Usamos async: devolvemos true para mantener sendResponse vivo.
  handleCommand(message)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // respuesta asíncrona
});

async function handleCommand(message) {
  switch (message.command) {
    case "connect":
      return connect(message.profileId);

    case "disconnect":
      return disconnect();

    case "getStatus": {
      // Si el host nativo no está instalado, lo señalamos explícitamente para
      // que la UI pueda mostrar el onboarding en vez de un error genérico.
      if (native.isHostMissing()) {
        const state = await storage.getState();
        return { host: null, hostMissing: true, state };
      }
      const st = await native.status().catch(() => null);
      const state = await storage.getState();
      return { host: st, state };
    }

    case "testHost":
      return native.ping();

    default:
      throw new Error("Comando desconocido: " + message.command);
  }
}

/** Conecta a un perfil: arranca wireproxy y aplica el proxy del navegador. */
async function connect(profileId) {
  const profile = await storage.getProfile(profileId);
  if (!profile) throw new Error("Perfil no encontrado");

  // Si ya hay algo conectado, desconectar primero.
  const st = await native.status().catch(() => null);
  if (st?.running) {
    await native.stop().catch(() => {});
  }

  // Arrancar wireproxy en el host.
  const result = await native.start(profile, 0);
  const socksPort = result.socksPort;

  // Aplicar proxy del navegador al SOCKS5 local.
  await applyProxy(socksPort);

  // Guardar estado.
  await storage.setState({
    activeProfileId: profileId,
    proxyPort: socksPort,
    connected: true,
  });

  return { socksPort, profileName: profile.name };
}

/** Desconecta: para wireproxy y limpia el proxy del navegador. */
async function disconnect() {
  await native.stop().catch(() => {});
  await clearProxy();
  await storage.setState({
    connected: false,
    proxyPort: null,
    activeProfileId: null,
  });
}

// Reenviar logs del host a la consola del SW (visible en chrome://extensions).
native.subscribe((msg) => {
  if (msg.type === "log") {
    console.log(`[wireproxy ${msg.level}]`, msg.message);
  } else if (msg.type === "disconnected") {
    console.warn("[host] desconectado");
  } else if (msg.type === "error") {
    console.error("[host] error:", msg.message);
  }
});
