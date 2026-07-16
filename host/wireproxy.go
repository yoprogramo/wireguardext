package main

import (
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
	"net/netip"
	"sync"

	socks5 "github.com/things-go/go-socks5"
	wp "github.com/windtf/wireproxy"
)

// wireproxyManager controla el ciclo de vida de un único túnel wireproxy.
// Solo puede haber uno activo a la vez (decisión de diseño: una VPN activa).
// Es seguro para uso concurrente.
type wireproxyManager struct {
	mu        sync.Mutex
	vt        *wp.VirtualTun // túnel activo, o nil si no hay
	active    *Profile       // perfil en uso, o nil
	socksLn   net.Listener   // listener SOCKS5 (lo creamos nosotros para poder cerrarlo)
	socksPort int            // puerto SOCKS5 en escucha
}

var manager = &wireproxyManager{}

// Start arranca wireproxy con el perfil dado y un listener SOCKS5 en 127.0.0.1.
// socksPort=0 significa "asignar puerto automáticamente". Devuelve el puerto real.
// Si ya hay un túnel activo, se detiene primero (no coexisten dos).
func (m *wireproxyManager) Start(p *Profile, socksPort int) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.vt != nil {
		m.stopLocked()
	}

	conf, err := buildConfiguration(p, socksPort)
	if err != nil {
		return 0, fmt.Errorf("configuración inválida: %w", err)
	}

	// Crear nosotros el listener TCP para poder cerrarlo en Stop (wireproxy
	// usaría ListenAndServe que no expone el listener y llama log.Fatal al fallar).
	if socksPort == 0 {
		socksPort = defaultSocksPort
	}
	addr := fmt.Sprintf("127.0.0.1:%d", socksPort)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return 0, fmt.Errorf("no se pudo abrir SOCKS5 en %s: %w", addr, err)
	}
	realPort := ln.Addr().(*net.TCPAddr).Port

	// Arrancar el túnel WireGuard (userspace, vía wireproxy como librería).
	// LogLevel -1 = sin logs verbose.
	vt, err := wp.StartWireguard(conf, -1)
	if err != nil {
		ln.Close()
		return 0, fmt.Errorf("no se pudo iniciar wireguard: %w", err)
	}

	// Construir el servidor SOCKS5 igual que hace wireproxy internamente,
	// pero sirviendo sobre NUESTRO listener.
	server := buildSocks5Server(p, vt)
	go func() {
		_ = server.Serve(ln) // devuelve error al cerrar el listener; lo ignoramos
	}()

	m.vt = vt
	m.active = p
	m.socksLn = ln
	m.socksPort = realPort
	return realPort, nil
}

// buildSocks5Server replica la configuración que wireproxy aplica en
// Socks5Config.SpawnRoutine, pero sobre un servidor propio que usa el
// netstack del VirtualTun para dial y resolución DNS a través del túnel.
func buildSocks5Server(p *Profile, vt *wp.VirtualTun) *socks5.Server {
	var authMethods []socks5.Authenticator
	// Soporte de credenciales opcional (no se exponen en la UI aún, pero
	// dejamos el hook para el futuro).
	authMethods = append(authMethods, socks5.NoAuthAuthenticator{})
	return socks5.NewServer(
		socks5.WithDial(vt.Tnet.DialContext),
		socks5.WithResolver(vt),
		socks5.WithAuthMethods(authMethods),
	)
}

// Stop detiene el túnel activo, si lo hay. Idempotente.
func (m *wireproxyManager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopLocked()
}

func (m *wireproxyManager) stopLocked() {
	if m.vt == nil {
		return
	}
	// 1. Cerrar el listener SOCKS5 (deja de aceptar conexiones del navegador).
	if m.socksLn != nil {
		m.socksLn.Close()
	}
	// 2. Cerrar el device WireGuard (cierra binds UDP, detiene goroutines).
	if m.vt.Dev != nil {
		m.vt.Dev.Close()
	}
	m.vt = nil
	m.active = nil
	m.socksLn = nil
	m.socksPort = 0
}

// Status devuelve el estado actual del túnel.
func (m *wireproxyManager) Status() (running bool, socksPort int, profileName string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.vt != nil, m.socksPort, profileNameOf(m.active)
}

func profileNameOf(p *Profile) string {
	if p == nil {
		return ""
	}
	return p.Name
}

// defaultSocksPort es el puerto SOCKS5 por defecto si el caller pide auto (0).
const defaultSocksPort = 8869

// buildConfiguration construye la estructura Configuration de wireproxy a partir
// de un Profile, en memoria, sin escribir ficheros.
func buildConfiguration(p *Profile, socksPort int) (*wp.Configuration, error) {
	if p == nil {
		return nil, fmt.Errorf("perfil vacío")
	}

	// --- Interface (DeviceConfig) ---
	if p.Interface.PrivateKey == "" {
		return nil, fmt.Errorf("falta PrivateKey")
	}
	if p.Interface.Address == "" {
		return nil, fmt.Errorf("falta Address")
	}

	// Las claves del .conf (y de nuestra UI) vienen en base64, pero la
	// interfaz IPC UAPI de WireGuard espera hex (private_key=… en
	// wireproxy.CreateIPCRequest). Hay que convertir, igual que hace
	// wireproxy al leer un .conf (config.go::encodeBase64ToHex).
	secretHex, err := base64KeyToHex(p.Interface.PrivateKey, "PrivateKey")
	if err != nil {
		return nil, err
	}

	addrs, err := p.toWireguardDeviceAddresses()
	if err != nil {
		return nil, fmt.Errorf("Address inválida %q: %w", p.Interface.Address, err)
	}

	mtu := p.Interface.MTU
	if mtu == 0 {
		mtu = 1400 // default de wireproxy
	}

	var dnsAddrs []netip.Addr
	if p.Interface.DNS != "" {
		dns, err := netip.ParseAddr(p.Interface.DNS)
		if err != nil {
			return nil, fmt.Errorf("DNS inválido %q: %w", p.Interface.DNS, err)
		}
		dnsAddrs = []netip.Addr{dns}
	}

	// --- Peer ---
	if p.Peer.PublicKey == "" {
		return nil, fmt.Errorf("falta PublicKey del peer")
	}
	if p.Peer.Endpoint == "" {
		return nil, fmt.Errorf("falta Endpoint del peer")
	}

	publicHex, err := base64KeyToHex(p.Peer.PublicKey, "PublicKey")
	if err != nil {
		return nil, err
	}
	// PreSharedKey es opcional; si no viene, wireproxy exige el valor
	// "todo ceros" en hex (lo normaliza en config.go::ParsePeer).
	presharedHex := "0000000000000000000000000000000000000000000000000000000000000000"
	if p.Peer.PresharedKey != "" {
		presharedHex, err = base64KeyToHex(p.Peer.PresharedKey, "PreSharedKey")
		if err != nil {
			return nil, err
		}
	}

	allowedStr := p.Peer.AllowedIPs
	if allowedStr == "" {
		allowedStr = "0.0.0.0/0"
	}
	allowedPrefix, err := netip.ParsePrefix(allowedStr)
	if err != nil {
		return nil, fmt.Errorf("AllowedIPs inválido %q: %w", allowedStr, err)
	}

	// El endpoint puede ser "host:puerto" con host como IP o como nombre DNS.
	// wireguard-go (vía IpcSet) solo acepta "IP:puerto", así que resolvemos
	// el hostname aquí. Es lo mismo que hace wireproxy al leer un .conf
	// (config.go::resolveIPPAndPort). La resolución es puntual, en el momento
	// de conectar; no se cachea ni se renueva (WireGuard ya refresca la
	// dirección del endpoint conforme habla con el peer).
	endpoint, err := resolveHostPort(p.Peer.Endpoint)
	if err != nil {
		return nil, fmt.Errorf("Endpoint %q no se pudo resolver: %w", p.Peer.Endpoint, err)
	}

	peer := wp.PeerConfig{
		PublicKey:    publicHex,
		PreSharedKey: presharedHex,
		Endpoint:     strPtr(endpoint),
		KeepAlive:    p.Peer.PersistentKeepalive,
		AllowedIPs:   []netip.Prefix{allowedPrefix},
	}

	deviceConf := &wp.DeviceConfig{
		SecretKey: secretHex,
		Endpoint:  addrs,
		Peers:     []wp.PeerConfig{peer},
		DNS:       dnsAddrs,
		MTU:       mtu,
	}

	// No usamos Routines de wireproxy (las gestionamos nosotros para poder cerrar).
	// Necesitamos un ResolveConfig válido para StartWireguard.
	resolve := &wp.ResolveConfig{ResolveStrategy: "ipv4"}

	return &wp.Configuration{
		Device:   deviceConf,
		Routines: nil,
		Resolve:  resolve,
	}, nil
}

func strPtr(s string) *string { return &s }

// base64KeyToHex decodifica una clave WireGuard en base64 (44 caracteres, 32
// bytes) y la devuelve en hexadecimal, que es el formato que exige la IPC UAPI
// de WireGuard. fieldName solo se usa para el mensaje de error.
func base64KeyToHex(b64, fieldName string) (string, error) {
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", fmt.Errorf("%s no es base64 válido: %w", fieldName, err)
	}
	if len(decoded) != 32 {
		return "", fmt.Errorf("%s debe tener 32 bytes tras decodificar base64 (tiene %d)", fieldName, len(decoded))
	}
	return hex.EncodeToString(decoded), nil
}

// resolveHostPort normaliza un endpoint "host:puerto" a "IP:puerto",
// resolviendo el hostname vía DNS si fuera necesario.
//
// wireguard-go solo acepta IPs en el endpoint del peer (no nombres), por lo
// que todo endpoint con hostname debe resolverse antes de pasárselo.
//
// Comportamiento:
//   - Si host ya es una IP (v4 o v6), se devuelve sin cambios.
//   - Si es un nombre DNS, se resuelve a una IP con net.ResolveIPAddr.
//   - Se admite la sintaxis [ipv6]:puerto.
//
// Equivalente a wireproxy config.go::resolveIPPAndPort.
func resolveHostPort(addr string) (string, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", err
	}
	// Caso rápido: si ya es una IP literal, JoinHostPort lo deja igual.
	if net.ParseIP(host) != nil {
		return net.JoinHostPort(host, port), nil
	}
	// Resolver el nombre DNS.
	ipAddr, err := net.ResolveIPAddr("ip", host)
	if err != nil {
		return "", err
	}
	return net.JoinHostPort(ipAddr.String(), port), nil
}
