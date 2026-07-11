// proxy.js — Control del proxy del navegador vía chrome.proxy.settings.
//
// Usamos "fixed_servers" con esquema "socks5" para que la resolución DNS se haga
// a través del túnel (evita fugas de DNS). Cuando se desconecta, volvemos a "direct".

/**
 * Configura el proxy del navegador para que enrute todo por un SOCKS5 local.
 * @param {number} port Puerto donde wireproxy escucha SOCKS5 (127.0.0.1).
 * @returns {Promise<void>}
 */
export function applyProxy(port) {
  return new Promise((resolve, reject) => {
    const value = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "socks5",
          host: "127.0.0.1",
          port: port,
        },
        // bypassList vacío = todo pasa por el proxy, incluido localhost
        // (wireproxy escucha en 127.0.0.1, no hay riesgo de bucle porque
        // el proxy mismo es el listener, no una URL).
        bypassList: [],
      },
    };
    chrome.proxy.settings.set({ value, scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Desactiva el proxy: el navegador vuelve a conexión directa.
 * @returns {Promise<void>}
 */
export function clearProxy() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: { mode: "direct" }, scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Devuelve la configuración de proxy actual.
 * @returns {Promise<{mode: string, rules?: object}>}
 */
export function getProxy() {
  return new Promise((resolve) => {
    chrome.proxy.settings.get({}, (details) => {
      resolve(details.value ?? { mode: "system" });
    });
  });
}

/**
 * Listener para errores de proxy. Útil para diagnóstico.
 * @param {(details: object) => void} cb
 */
export function onProxyError(cb) {
  chrome.proxy.onProxyError.addListener(cb);
}
