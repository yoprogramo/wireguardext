// storage.js — Wrapper sobre chrome.storage.local para perfiles VPN y estado.
//
// Dos claves:
//   "profiles" → array de objetos Profile
//   "state"    → { activeProfileId, proxyPort, connected }
//
// Un Profile tiene la forma:
//   { id, name, interface: {privateKey, address, dns, mtu},
//     peer: {publicKey, endpoint, allowedIPs, presharedKey, persistentKeepalive} }

const KEY_PROFILES = "profiles";
const KEY_STATE = "state";

const DEFAULT_STATE = {
  activeProfileId: null,
  proxyPort: null,
  connected: false,
};

/** Genera un UUID v4 sin dependencias. */
function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  // Fallback para contextos sin crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Devuelve una promesa que resuelve al valor almacenado en key (o fallback). */
function get(key, fallback) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] ?? fallback);
    });
  });
}

/** Devuelve una promesa que resuelve al fijar key = value. */
function set(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// --- Perfiles ---

/** Obtiene todos los perfiles. */
export async function getProfiles() {
  return (await get(KEY_PROFILES, [])).slice();
}

/** Obtiene un perfil por id, o null. */
export async function getProfile(id) {
  const profiles = await getProfiles();
  return profiles.find((p) => p.id === id) ?? null;
}

/** Crea un perfil nuevo con id autogenerado. Devuelve el perfil creado. */
export async function addProfile(profile) {
  const profiles = await getProfiles();
  const newProfile = { ...profile, id: uuid() };
  profiles.push(newProfile);
  await set(KEY_PROFILES, profiles);
  return newProfile;
}

/** Actualiza un perfil existente (por id). Devuelve true si se encontró. */
export async function updateProfile(profile) {
  const profiles = await getProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx === -1) return false;
  profiles[idx] = { ...profiles[idx], ...profile, id: profiles[idx].id };
  await set(KEY_PROFILES, profiles);
  return true;
}

/** Elimina un perfil por id. Si era el activo, limpia la selección. */
export async function deleteProfile(id) {
  const profiles = await getProfiles();
  const next = profiles.filter((p) => p.id !== id);
  await set(KEY_PROFILES, next);
  const state = await getState();
  if (state.activeProfileId === id) {
    await setState({ ...state, activeProfileId: null });
  }
}

// --- Estado activo ---

/** Obtiene el estado de conexión actual. */
export async function getState() {
  const state = await get(KEY_STATE, null);
  return { ...DEFAULT_STATE, ...(state ?? {}) };
}

/** Fusiona el estado con los campos proporcionados. */
export async function setState(patch) {
  const current = await getState();
  await set(KEY_STATE, { ...current, ...patch });
}
