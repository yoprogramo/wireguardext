package main

import "net/netip"

// HostVersion es la versión del native messaging host. Se incrementa en cada release.
const HostVersion = "0.1.0"

// NativeMessagingHost es el nombre registrado del host. Debe coincidir con:
//   - el campo "name" del manifest de Native Messaging (com.wireguardext.host.json)
//   - el string pasado a chrome.runtime.connectNative en la extensión
const NativeMessagingHost = "com.wireguardext.host"

// Profile representa una configuración VPN completa tal como la envía la extensión
// y como la consume wireproxy. Es el equivalente en memoria de un .conf de WireGuard.
type Profile struct {
	ID   string `json:"id"`
	Name string `json:"name"`

	Interface InterfaceConfig `json:"interface"`
	Peer      PeerConfig      `json:"peer"`
}

// InterfaceConfig corresponde a la sección [Interface] de wireproxy.
type InterfaceConfig struct {
	// PrivateKey en base64 (32 bytes). Obligatorio.
	PrivateKey string `json:"privateKey"`
	// Address es la IP virtual del túnel con máscara, ej. "10.0.0.2/32".
	Address string `json:"address"`
	// DNS opcional, ej. "1.1.1.1".
	DNS string `json:"dns"`
	// MTU opcional. 0 = usar default de wireproxy (1400).
	MTU int `json:"mtu"`
}

// PeerConfig corresponde a la sección [Peer] de wireproxy.
type PeerConfig struct {
	// PublicKey del peer remoto en base64 (32 bytes). Obligatorio.
	PublicKey string `json:"publicKey"`
	// Endpoint en formato host:puerto (UDP). Obligatorio.
	Endpoint string `json:"endpoint"`
	// AllowedIPs como string CIDR, normalmente "0.0.0.0/0".
	AllowedIPs string `json:"allowedIPs"`
	// PresharedKey opcional en base64.
	PresharedKey string `json:"presharedKey"`
	// PersistentKeepalive opcional en segundos. 0 = desactivado.
	PersistentKeepalive int `json:"persistentKeepalive"`
}

// --- Mensajes del protocolo Native Messaging ---
// Codificación: 4 bytes little-endian con la longitud del payload UTF-8 JSON,
// seguidos del payload. Estándar de Chrome.

// IncomingMessage es cualquier mensaje que el host recibe de la extensión.
// El campo Command determina el tipo de Payload.
type IncomingMessage struct {
	Command string `json:"command"`

	// Payload presente solo en "start".
	Profile   *Profile `json:"profile,omitempty"`
	SocksPort int      `json:"socksPort,omitempty"` // 0 = puerto automático
}

// OutgoingMessage es cualquier mensaje que el host envía a la extensión.
type OutgoingMessage struct {
	Type string `json:"type"`

	// pong
	Version string `json:"version,omitempty"`

	// started / status
	SocksPort   int    `json:"socksPort,omitempty"`
	Running     bool   `json:"running,omitempty"`
	ProfileName string `json:"profileName,omitempty"`

	// error
	Message string `json:"message,omitempty"`
	Code    string `json:"code,omitempty"`

	// log
	Level string `json:"level,omitempty"`
}

// --- Helpers de conversión Profile -> tipos de wireproxy ---

// toWireguardDeviceAddresses parsea Address ("10.0.0.2/32") en una lista de
// direcciones netip.Addr (la parte de red se descarta para CreateNetTUN).
func (p *Profile) toWireguardDeviceAddresses() ([]netip.Addr, error) {
	prefix, err := netip.ParsePrefix(p.Interface.Address)
	if err != nil {
		return nil, err
	}
	return []netip.Addr{prefix.Addr()}, nil
}
