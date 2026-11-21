"""Rede dos serviços do painel (IA e transcrição): além do próprio PC, ouvem no endereço do Tailscale
para o site na Azure, mas só aceitam os IPs permitidos (o servidor do site).

Config em painel_rede.json (ao lado deste arquivo): {"rede": "100.111.15.19", "permitidos": ["100.75.165.119"]}.
Sem o arquivo: só o próprio PC, como antes.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOCAL = {'127.0.0.1', '::1'}


def _config():
    try:
        return json.loads((HERE / 'painel_rede.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


CONFIG = _config()
ALLOWED = LOCAL | {str(ip) for ip in CONFIG.get('permitidos', [])}


def client_allowed(handler) -> bool:
    return handler.client_address[0] in ALLOWED


def serve_on_network(server_class, handler_class, port: int, log=print):
    """Abre o mesmo serviço também no endereço da rede (se configurado), numa thread."""
    host = CONFIG.get('rede')
    if not host:
        return None
    try:
        server = server_class((host, port), handler_class)
    except OSError as error:
        log(f'[rede] não consegui abrir em {host}:{port}: {error}', flush=True)
        return None
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log(f'[rede] também em http://{host}:{port} (só {", ".join(sorted(ALLOWED - LOCAL)) or "ninguém"})', flush=True)
    return server
