package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

// Native Messaging de Chrome usa mensajes con prefijo de longitud:
// 4 bytes little-endian (uint32) con el tamaño en bytes del payload,
// seguidos del payload codificado en UTF-8 JSON.
// Tamaño máximo por mensaje: 1 MiB.

const maxMessageSize = 1 << 20 // 1 MiB, límite de Chrome

// readMessage lee un mensaje de Native Messaging desde r (típicamente os.Stdin).
// Devuelve el mensaje decodificado o error. Si stdin se cierra (EOF), se devuelve
// io.EOF para que el llamador pueda terminar limpiamente.
func readMessage(r io.Reader) (*IncomingMessage, error) {
	var sizeBuf [4]byte
	if _, err := io.ReadFull(r, sizeBuf[:]); err != nil {
		return nil, err // io.EOF u otro error de lectura
	}
	size := binary.LittleEndian.Uint32(sizeBuf[:])
	if size == 0 {
		return nil, fmt.Errorf("mensaje vacío (longitud 0)")
	}
	if size > maxMessageSize {
		return nil, fmt.Errorf("mensaje demasiado grande: %d bytes (máx %d)", size, maxMessageSize)
	}

	buf := make([]byte, size)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}

	var msg IncomingMessage
	if err := json.Unmarshal(buf, &msg); err != nil {
		return nil, fmt.Errorf("JSON inválido: %w", err)
	}
	return &msg, nil
}

// writeMessage serializa msg y lo escribe a w (típicamente os.Stdout)
// con el prefijo de longitud de 4 bytes little-endian.
func writeMessage(w io.Writer, msg OutgoingMessage) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("no se pudo serializar mensaje: %w", err)
	}
	if len(payload) > maxMessageSize {
		return fmt.Errorf("payload serializado demasiado grande: %d bytes", len(payload))
	}

	var sizeBuf [4]byte
	binary.LittleEndian.PutUint32(sizeBuf[:], uint32(len(payload)))

	if _, err := w.Write(sizeBuf[:]); err != nil {
		return err
	}
	if _, err := w.Write(payload); err != nil {
		return err
	}
	return nil
}

// send es un helper para enviar mensajes concisos desde los handlers.
func send(w io.Writer, msg OutgoingMessage) {
	if err := writeMessage(w, msg); err != nil {
		// Si stdout falla, el canal de comunicación está roto; no podemos
		// informar a la extensión. Lo registramos en stderr (visible en logs).
		fmt.Fprintf(io.Discard, "error enviando mensaje: %v\n", err)
	}
}
