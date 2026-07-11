package main

import (
	"os"
)

// main es el entry point del native messaging host.
//
// El host se comunica con la extensión por stdin/stdout usando el protocolo
// Native Messaging de Chrome (mensajes JSON con prefijo de longitud de 4 bytes).
// Todo logging de diagnóstico va a stderr, que Chrome captura en su log interno.
//
// Ciclo:
//  1. Leer mensaje de stdin (bloqueante).
//  2. Despachar según Command.
//  3. Enviar respuesta(s) a stdout.
//  4. Repetir hasta EOF en stdin (la extensión cerró el port o el navegador cerró).
func main() {
	for {
		msg, err := readMessage(os.Stdin)
		if err != nil {
			// EOF o error de lectura: el host termina. wireproxy, si está activo,
			// se apaga con el proceso.
			return
		}
		handle(msg)
	}
}

// handle despacha un mensaje entrante a su handler.
func handle(msg *IncomingMessage) {
	switch msg.Command {
	case "ping":
		send(os.Stdout, OutgoingMessage{Type: "pong", Version: HostVersion})

	case "start":
		handleStart(msg)

	case "stop":
		manager.Stop()
		send(os.Stdout, OutgoingMessage{Type: "stopped"})

	case "status":
		running, port, name := manager.Status()
		send(os.Stdout, OutgoingMessage{
			Type:        "status",
			Running:     running,
			SocksPort:   port,
			ProfileName: name,
		})

	default:
		send(os.Stdout, OutgoingMessage{
			Type:    "error",
			Code:    "unknown_command",
			Message: "comando desconocido: " + msg.Command,
		})
	}
}

// handleStart arranca wireproxy con el perfil del mensaje y responde.
func handleStart(msg *IncomingMessage) {
	if msg.Profile == nil {
		send(os.Stdout, OutgoingMessage{
			Type:    "error",
			Code:    "missing_profile",
			Message: "el comando start requiere un perfil",
		})
		return
	}

	port, err := manager.Start(msg.Profile, msg.SocksPort)
	if err != nil {
		send(os.Stdout, OutgoingMessage{
			Type:    "error",
			Code:    "start_failed",
			Message: err.Error(),
		})
		return
	}

	send(os.Stdout, OutgoingMessage{
		Type:      "started",
		SocksPort: port,
	})
}
