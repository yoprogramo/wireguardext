package main

import (
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

	allowedStr := p.Peer.AllowedIPs
	if allowedStr == "" {
		allowedStr = "0.0.0.0/0"
	}
	allowedPrefix, err := netip.ParsePrefix(allowedStr)
	if err != nil {
		return nil, fmt.Errorf("AllowedIPs inválido %q: %w", allowedStr, err)
	}

	peer := wp.PeerConfig{
		PublicKey:    p.Peer.PublicKey,
		PreSharedKey: p.Peer.PresharedKey,
		Endpoint:     strPtr(p.Peer.Endpoint),
		KeepAlive:    p.Peer.PersistentKeepalive,
		AllowedIPs:   []netip.Prefix{allowedPrefix},
	}

	deviceConf := &wp.DeviceConfig{
		SecretKey: p.Interface.PrivateKey,
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
