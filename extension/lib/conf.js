// conf.js — Importar y exportar perfiles desde/a archivos .conf de WireGuard.
//
// Formato .conf (INI con secciones [Interface] y [Peer]):
//   [Interface]
//   PrivateKey = <base64>
//   Address = 10.0.0.2/32
//   DNS = 1.1.1.1
//   MTU = 1280
//
//   [Peer]
//   PublicKey = <base64>
//   Endpoint = vpn.midominio.com:51820
//   AllowedIPs = 0.0.0.0/0
//   PresharedKey = <base64>
//   PersistentKeepalive = 25
//
// Si hay varios [Peer], se generan varios perfiles (todos comparten la misma
// interfaz). Las claves de wg-quick no relevantes (Table, PostUp, ListenPort...)
// se ignoran silenciosamente.

import { validateProfile } from "./validate.js";

/**
 * Parsea el contenido de un .conf de WireGuard.
 * @param {string} text Contenido del archivo.
 * @returns {object[]} Array de perfiles (1 por cada [Peer]). Si no hay [Peer],
 *                     devuelve un perfil con peer vacío.
 */
export function parseWireGuardConf(text) {
  const { interface: iface, peers } = tokenize(text);

  const baseInterface = {
    privateKey: iface.PrivateKey ?? "",
    address: firstIPv4(iface.Address) ?? iface.Address ?? "",
    dns: firstDNS(iface.DNS) ?? "",
    mtu: toInt(iface.MTU) || 0,
  };

  // Si no hay ningún [Peer], devolvemos un perfil con peer en blanco para que
  // el usuario lo rellene.
  if (peers.length === 0) {
    return [
      {
        name: "",
        interface: baseInterface,
        peer: { publicKey: "", endpoint: "", allowedIPs: "0.0.0.0/0", presharedKey: "", persistentKeepalive: 0 },
      },
    ];
  }

  return peers.map((peer, i) => ({
    name: "",
    interface: baseInterface,
    peer: {
      publicKey: peer.PublicKey ?? "",
      endpoint: peer.Endpoint ?? "",
      allowedIPs: peer.AllowedIPs ?? "0.0.0.0/0",
      presharedKey: peer.PresharedKey ?? "",
      persistentKeepalive: toInt(peer.PersistentKeepalive) || 0,
    },
  }));
}

/**
 * Tokeniza el texto en secciones {interface, peers}.
 * @param {string} text
 */
function tokenize(text) {
  const lines = text.split(/\r?\n/);
  let current = null; // "interface" | "peer" | null
  const iface = {};
  const peers = [];
  let peer = null;

  for (const raw of lines) {
    let line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;

    // Sección [Interface] / [Peer]
    const section = line.match(/^\[(.+)\]$/);
    if (section) {
      const name = section[1].toLowerCase();
      if (name === "interface") {
        current = "interface";
      } else if (name === "peer") {
        if (peer) peers.push(peer);
        peer = {};
        current = "peer";
      } else {
        current = null; // sección desconocida
      }
      continue;
    }

    // Clave = valor
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (current === "interface") {
      iface[key] = value;
    } else if (current === "peer") {
      peer[key] = value;
    }
  }
  if (peer) peers.push(peer);

  return { interface: iface, peers };
}

/**
 * Convierte un perfil a texto .conf de WireGuard.
 * @param {object} profile
 * @returns {string}
 */
export function profileToConf(profile) {
  const i = profile.interface ?? {};
  const p = profile.peer ?? {};
  const out = ["[Interface]"];
  if (i.privateKey) out.push(`PrivateKey = ${i.privateKey}`);
  if (i.address) out.push(`Address = ${i.address}`);
  if (i.dns) out.push(`DNS = ${i.dns}`);
  if (i.mtu) out.push(`MTU = ${i.mtu}`);
  out.push("");
  out.push("[Peer]");
  if (p.publicKey) out.push(`PublicKey = ${p.publicKey}`);
  if (p.endpoint) out.push(`Endpoint = ${p.endpoint}`);
  if (p.allowedIPs) out.push(`AllowedIPs = ${p.allowedIPs}`);
  if (p.presharedKey) out.push(`PresharedKey = ${p.presharedKey}`);
  if (p.persistentKeepalive) out.push(`PersistentKeepalive = ${p.persistentKeepalive}`);
  out.push("");
  return out.join("\n");
}

/**
 * Importa archivos .conf: parsea, valida y devuelve resultados por archivo.
 * No modifica el storage; el llamador decide qué guardar.
 * @param {File[]} files
 * @returns {Promise<{file: string, profile?: object, error?: string}[]>}
 */
export async function importConfFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const profiles = parseWireGuardConf(text);
      const baseName = file.name.replace(/\.conf$/i, "");

      // Un .conf puede producir varios perfiles (múltiples [Peer]).
      for (const profile of profiles) {
        // Nombre por defecto: el del fichero (con sufijo si hay varios peers).
        if (!profile.name) {
          profile.name = profiles.length > 1 ? `${baseName} (${profiles.indexOf(profile) + 1})` : baseName;
        }
        const { valid, errors } = validateProfile(profile);
        if (!valid) {
          results.push({ file: file.name, error: formatErrors(errors) });
          continue;
        }
        delete profile.id;
        results.push({ file: file.name, profile });
      }
    } catch (e) {
      results.push({ file: file.name, error: e.message });
    }
  }
  return results;
}

// --- Helpers ---

/** De "10.0.0.2/32, fd00::2/128" toma el primer IPv4 (o el primero si no hay v4). */
function firstIPv4(address) {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim());
  return parts.find((p) => !p.includes(":")) ?? parts[0] ?? null;
}

/** De "1.1.1.1, 8.8.8.8" toma el primer DNS (ignora puertos tipo 1.1.1.1:53). */
function firstDNS(dns) {
  if (!dns) return null;
  return dns.split(",")[0].trim();
}

function toInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : 0;
}

function formatErrors(errors) {
  return Object.values(errors).join("; ");
}
