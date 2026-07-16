// native.js — Comunicación con el native messaging host (com.wireguardext.host).
//
// Expone una API basada en promesas sobre chrome.runtime.connectNative.
// Gestiona:
//   - Reconexión con backoff exponencial.
//   - Cola de comandos mientras se reconecta.
//   - Despacho de respuestas y notificaciones asíncronas (log, started, stopped).
//
// Cada mensaje del host tiene {type, ...}. Los types esperados:
//   pong, started, stopped, status, error, log.
// "started"/"stopped" son respuestas a nuestros comandos start/stop.
// "log" es una notificación asíncrona (no responde a ningún comando).

const HOST_NAME = "com.wireguardext.host";

// Estado interno del módulo.
let port = null;
let connected = false;
let reconnecting = false;
let reconnectAttempts = 0;
// True si connectNative falló inmediatamente: el host nativo no está instalado
// o no está registrado para esta extensión. Permite a la UI distinguir este
// caso de otros errores (túnel caído, perfil inválido, etc.).
let hostMissing = false;

// Lista de callbacks pendientes: uno por comando en vuelo, en orden FIFO.
// Cada entry es { resolve, reject, match }. `match` decide si una respuesta
// del host corresponde a este comando.
const pending = [];
// Suscriptores a notificaciones (log, started no solicitados, etc.).
const listeners = new Set();

/** Conecta (o reconecta) al host nativo. */
function connect() {
  if (port) return;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (e) {
    // connectNative lanza síncronamente cuando el host no existe en el
    // manifest de Native Messaging registrado en el SO.
    hostMissing = true;
    notifyError("No se pudo conectar con el host: " + e.message);
    scheduleReconnect();
    return;
  }

  // Si connectNative no lanzó, pero chrome.runtime.lastError indica que el
  // sistema no encontró el host, chrome-runtime marcará un error aquí mismo.
  if (chrome.runtime.lastError) {
    hostMissing = true;
    const msg = chrome.runtime.lastError.message;
    port = null;
    notifyError("No se pudo conectar con el host: " + msg);
    scheduleReconnect();
    return;
  }

  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(onDisconnect);
  connected = true;
  hostMissing = false;
  reconnecting = false;
  reconnectAttempts = 0;
}

/** Maneja la desconexión del port. */
function onDisconnect() {
  const wasNeverConnected = !connected;
  port = null;
  connected = false;
  // Si nunca llegamos a estar conectados, el host casi seguro no está
  // instalado / registrado (no es una caída de un túnel que funcionaba).
  if (wasNeverConnected && chrome.runtime.lastError) {
    hostMissing = true;
  }
  // Rechazar todos los comandos pendientes: el host se fue.
  const err = new Error("Conexión con el host cerrada");
  for (const entry of pending.splice(0)) {
    entry.reject(err);
  }
  // Notificar a los suscriptores.
  for (const cb of listeners) {
    try {
      cb({ type: "disconnected" });
    } catch (_) {
      /* ignore */
    }
  }
  scheduleReconnect();
}

/** Programa un reintento con backoff exponencial. */
function scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000); // máx 30s
  reconnectAttempts++;
  setTimeout(() => {
    reconnecting = false;
    connect();
  }, delay);
}

/** Procesa un mensaje entrante del host. */
function onMessage(msg) {
  // Respuestas a comandos: started, stopped, pong, status, error.
  // Los emparejamos con la próxima callback pendiente cuyo `match` aplique.
  if (msg.type === "started" || msg.type === "stopped" || msg.type === "pong" || msg.type === "status" || msg.type === "error") {
    // Buscar el primer pending que coincida; si no hay match específico,
    // asumimos FIFO (el más antiguo).
    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i];
      if (entry.match(msg)) {
        pending.splice(i, 1);
        if (msg.type === "error") {
          entry.reject(new Error(msg.message || "error del host"));
        } else {
          entry.resolve(msg);
        }
        return;
      }
    }
    // Error sin comando pendiente: lo notificamos como async.
  }

  // Notificaciones asíncronas (log, started/lost no solicitados, disconnected).
  for (const cb of listeners) {
    try {
      cb(msg);
    } catch (_) {
      /* ignore */
    }
  }
}

function notifyError(message) {
  for (const cb of listeners) {
    try {
      cb({ type: "error", message });
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Envía un comando al host y devuelve una promesa.
 * @param {object} message Mensaje a enviar.
 * @param {(resp: object) => boolean} match Decide si una respuesta corresponde a este comando.
 * @param {number} timeoutMs Timeout en ms (0 = sin timeout).
 * @returns {Promise<object>}
 */
function sendCommand(message, match, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!connected || !port) {
      reject(new Error("No hay conexión con el host nativo"));
      return;
    }
    const entry = { resolve, reject, match };
    pending.push(entry);

    if (timeoutMs > 0) {
      const timer = setTimeout(() => {
        const idx = pending.indexOf(entry);
        if (idx !== -1) pending.splice(idx, 1);
        reject(new Error("Timeout esperando respuesta del host"));
      }, timeoutMs);
      // Limpiar el timer al resolver/rechazar.
      const origResolve = entry.resolve;
      const origReject = entry.reject;
      entry.resolve = (v) => { clearTimeout(timer); origResolve(v); };
      entry.reject = (e) => { clearTimeout(timer); origReject(e); };
    }

    try {
      port.postMessage(message);
    } catch (e) {
      const idx = pending.indexOf(entry);
      if (idx !== -1) pending.splice(idx, 1);
      reject(new Error("No se pudo enviar mensaje: " + e.message));
    }
  });
}

// --- API pública ---

/** Inicializa la conexión con el host. Llamar al arrancar el SW. */
export function init() {
  connect();
}

/** ¿Está conectado al host? */
export function isConnected() {
  return connected;
}

/** ¿Se detectó que el host nativo no está instalado / registrado? */
export function isHostMissing() {
  return hostMissing;
}

/** ping → pong. Healthcheck del host. */
export function ping() {
  return sendCommand({ command: "ping" }, (r) => r.type === "pong");
}

/**
 * Arranca wireproxy con un perfil.
 * @param {object} profile Perfil VPN completo.
 * @param {number} socksPort 0 = puerto por defecto del host.
 * @returns {Promise<{type:'started', socksPort:number}>}
 */
export function start(profile, socksPort = 0) {
  return sendCommand(
    { command: "start", profile, socksPort },
    (r) => r.type === "started" || r.type === "error"
  );
}

/** Detiene wireproxy. */
export function stop() {
  return sendCommand({ command: "stop" }, (r) => r.type === "stopped");
}

/** Consulta el estado del túnel. */
export function status() {
  return sendCommand({ command: "status" }, (r) => r.type === "status");
}

/**
 * Suscribe a notificaciones asíncronas (log, disconnected, error no solicitado).
 * @param {(msg: object) => void} cb
 * @returns {() => void} función para desuscribir.
 */
export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
