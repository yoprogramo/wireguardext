// i18n.js — Inicialización de cadenas traducidas en el DOM.
//
// Uso:
//   1. En el HTML, marca los elementos con `data-i18n="key"` (textContent) o
//      `data-i18n-ph="key"` (placeholder).
//   2. Al cargar la página, llama a `applyI18n(document)`: sustituye los textos
//      por chrome.i18n.getMessage(key).
//   3. Para cadenas dinámicas en JS, usa directamente `chrome.i18n.getMessage`.

/**
 * Sustituye los atributos data-i18n / data-i18n-ph / data-i18n-title del árbol
 * por sus traducciones. Seguro llamar varias veces.
 * @param {ParentNode} root
 */
export function applyI18n(root) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n) || el.textContent;
  }
  for (const el of root.querySelectorAll("[data-i18n-ph]")) {
    el.placeholder = chrome.i18n.getMessage(el.dataset.i18nPh) || el.placeholder;
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.title = chrome.i18n.getMessage(el.dataset.i18nTitle) || el.title;
  }
}

/** Atajo con _PLACEHOLDER_ opcional. */
export function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}
