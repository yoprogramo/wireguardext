#!/usr/bin/env python3
# smoke-test.py — Verificación de humo del native messaging host.
#
# Compila el host, arranca el binario, le envía mensajes por stdin (protocolo
# Native Messaging: 4 bytes little-endian de longitud + payload JSON) y comprueba
# que las respuestas son las esperadas. No requiere un servidor WireGuard real:
# solo valida el protocolo y los paths de error.
#
# Uso:
#   python3 build/smoke-test.py [ruta/al/binario]
#
# Si no se pasa binario, se compila con `go build` en host/ y se deja en tmp.
#
# Salida: imprime "OK" y termina 0 si todo pasa; imprime el fallo y termina !=0.

import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_binary():
    """Compila el host a un directorio temporal y devuelve la ruta."""
    out = os.path.join(tempfile.mkdtemp(), "wireguardext-host")
    subprocess.run(
        ["go", "build", "-o", out, "."],
        cwd=os.path.join(ROOT, "host"),
        check=True,
    )
    return out


def encode(msg):
    payload = json.dumps(msg).encode("utf-8")
    return struct.pack("<I", len(payload)) + payload


def read_one(proc):
    size_bytes = proc.stdout.read(4)
    if not size_bytes:
        return None
    size = struct.unpack("<I", size_bytes)[0]
    if size == 0:
        return None
    return json.loads(proc.stdout.read(size).decode("utf-8"))


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL {label}")
        print(f"  esperado: {expected}")
        print(f"  actual:   {actual}")
        sys.exit(1)
    print(f"  ok  {label}: {actual}")


def main():
    binary = sys.argv[1] if len(sys.argv) > 1 else build_binary()
    if not os.path.exists(binary):
        print(f"FAIL: no existe el binario {binary}")
        sys.exit(1)

    print(f"Probando host: {binary}")
    proc = subprocess.Popen(
        [binary],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        # 1. ping -> pong
        proc.stdin.write(encode({"command": "ping"}))
        proc.stdin.flush()
        resp = read_one(proc)
        assert resp.get("type") == "pong", f"esperaba pong, got {resp}"
        assert "version" in resp, f"esperaba campo version, got {resp}"
        print(f"  ok  ping -> pong v{resp['version']}")

        # 2. status (sin túnel) -> running false
        proc.stdin.write(encode({"command": "status"}))
        proc.stdin.flush()
        resp = read_one(proc)
        assert resp.get("type") == "status", f"esperaba status, got {resp}"
        assert resp.get("running") in (False, None), f"esperaba running False, got {resp}"
        print(f"  ok  status sin túnel: running={resp.get('running')}")

        # 3. start sin perfil -> error missing_profile
        proc.stdin.write(encode({"command": "start"}))
        proc.stdin.flush()
        resp = read_one(proc)
        assert resp.get("type") == "error", f"esperaba error, got {resp}"
        assert resp.get("code") == "missing_profile", f"esperaba code missing_profile, got {resp}"
        print(f"  ok  start sin perfil -> {resp['code']}")

        # 4. start con perfil inválido -> error start_failed
        proc.stdin.write(
            encode({"command": "start", "profile": {"id": "x", "name": "bad", "interface": {}, "peer": {}}})
        )
        proc.stdin.flush()
        resp = read_one(proc)
        assert resp.get("type") == "error", f"esperaba error, got {resp}"
        assert resp.get("code") == "start_failed", f"esperaba code start_failed, got {resp}"
        print(f"  ok  start perfil inválido -> {resp['code']} ({resp.get('message')})")

        # 5. comando desconocido -> error unknown_command
        proc.stdin.write(encode({"command": "foobar"}))
        proc.stdin.flush()
        resp = read_one(proc)
        assert resp.get("type") == "error", f"esperaba error, got {resp}"
        assert resp.get("code") == "unknown_command", f"esperaba code unknown_command, got {resp}"
        print(f"  ok  comando desconocido -> {resp['code']}")

        # 6. stop sin túnel -> stopped (idempotente)
        proc.stdin.write(encode({"command": "stop"}))
        proc.stdin.flush()
        resp = read_one(proc)
        assert resp.get("type") == "stopped", f"esperaba stopped, got {resp}"
        print(f"  ok  stop sin túnel -> stopped (idempotente)")

    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            print("FAIL: el host no terminó tras cerrar stdin")
            sys.exit(1)

    print("OK: smoke test superado")


if __name__ == "__main__":
    main()
