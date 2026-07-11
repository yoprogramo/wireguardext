// validate.js — Validación de los campos de un perfil WireGuard.
//
// Las claves de WireGuard son base64 estándar de 32 bytes (44 chars con padding).
// Devuelve un objeto {valid: bool, errors: {campo: mensaje}}.

/** Valida que una cadena sea base64 de 32 bytes (clave WireGuard válida). */
export function isValidKey(key) {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  // base64 estándar de 32 bytes = 44 caracteres terminados en '='
  if (!/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) return false;
  return true;
}

/** Valida un endpoint "host:puerto" (host = IP o dominio, puerto 1-65535). */
export function isValidEndpoint(endpoint) {
  if (typeof endpoint !== "string") return false;
  const trimmed = endpoint.trim();
  // Acepta [ipv6]:puerto, ipv4:puerto o dominio:puerto
  const m = trimmed.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/);
  if (!m) return false;
  const port = Number(m[3]);
  return port >= 1 && port <= 65535;
}

/** Valida una máscara CIDR "ip/prefijo". */
export function isValidCIDR(cidr) {
  if (typeof cidr !== "string") return false;
  const trimmed = cidr.trim();
  const slash = trimmed.lastIndexOf("/");
  if (slash === -1) return false;
  const ip = trimmed.slice(0, slash);
  const prefix = Number(trimmed.slice(slash + 1));
  if (!Number.isInteger(prefix)) return false;
  // IPv4: prefijo 0-32, IPv6: 0-128
  if (ip.includes(":")) return prefix >= 0 && prefix <= 128;
  return isValidIPv4(ip) && prefix >= 0 && prefix <= 32;
}

function isValidIPv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

/**
 * Valida un perfil completo.
 * @param {object} profile
 * @returns {{valid: boolean, errors: Record<string, string>}}
 */
export function validateProfile(profile) {
  const errors = {};
  if (!profile) {
    return { valid: false, errors: { _: "Perfil vacío" } };
  }

  if (!profile.name || !profile.name.trim()) {
    errors.name = "El nombre es obligatorio";
  }

  // Interface
  const iface = profile.interface ?? {};
  if (!isValidKey(iface.privateKey)) {
    errors.privateKey = "Clave privada inválida (debe ser base64 de 32 bytes)";
  }
  if (!isValidCIDR(iface.address)) {
    errors.address = "Address inválido (ej. 10.0.0.2/32)";
  }
  if (iface.dns && iface.dns.trim() !== "") {
    // DNS puede ser IP o IP:puerto; aceptamos IP simple
    const dnsHost = iface.dns.split(":")[0];
    if (!isValidIPv4(dnsHost) && !dnsHost.includes(":")) {
      errors.dns = "DNS inválido (debe ser una IP)";
    }
  }
  if (iface.mtu && (iface.mtu < 576 || iface.mtu > 65535)) {
    errors.mtu = "MTU debe estar entre 576 y 65535";
  }

  // Peer
  const peer = profile.peer ?? {};
  if (!isValidKey(peer.publicKey)) {
    errors.publicKey = "Clave pública inválida (debe ser base64 de 32 bytes)";
  }
  if (!isValidEndpoint(peer.endpoint)) {
    errors.endpoint = "Endpoint inválido (formato host:puerto)";
  }
  if (peer.allowedIPs && peer.allowedIPs.trim() !== "" && !isValidCIDR(peer.allowedIPs)) {
    errors.allowedIPs = "AllowedIPs inválido (ej. 0.0.0.0/0)";
  }
  if (peer.presharedKey && peer.presharedKey.trim() !== "" && !isValidKey(peer.presharedKey)) {
    errors.presharedKey = "PresharedKey inválida (base64 de 32 bytes)";
  }
  if (peer.persistentKeepalive && (peer.persistentKeepalive < 0 || peer.persistentKeepalive > 65535)) {
    errors.persistentKeepalive = "Keepalive debe estar entre 0 y 65535";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
