"""Transcrição de áudio para o painel de Atendimento (local, gratuita: faster-whisper no próprio PC).

Serviço HTTP em 127.0.0.1 (porta 8652), mesmo token do serviço da IA (painel_ia.token, cabeçalho X-Fare-Token).
  POST /transcrever  corpo = o arquivo de áudio (ogg/opus do WhatsApp, webm, mp3...)  ->  {text, seconds, model}
  GET  /saude        ->  {ok, model, loaded}
Roda com o Python do Hermes (hermes-agent/venv), que já tem o faster-whisper.
O modelo começa a carregar quando o serviço liga (leva ~1 min) e sai da memória após 2 h sem uso.
"""
from __future__ import annotations

import hmac
import json
import os
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from painel_rede import client_allowed, serve_on_network  # noqa: E402
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from voz_tamanhos import normalizar_tamanhos  # noqa: E402  "dez por quinze" -> "10x15"

HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get('FARE_VOZ_PORT', '8652'))
MODEL = os.environ.get('FARE_VOZ_MODEL', 'large-v3-turbo')
IDLE_UNLOAD = int(os.environ.get('FARE_VOZ_IDLE_MIN', '120')) * 60
MAX_BYTES = 25 * 1024 * 1024
# Vocabulário da loja: ajuda o modelo a acertar tamanhos e termos (testado com áudios de exemplo).
PROMPT = (
    'Transcrição em português brasileiro, com ortografia, pontuação e vocabulário do Brasil. '
    'Cliente da Fare Foto pedindo revelação de fotos nos tamanhos 10x15 (dez por quinze), 13x18, 15x21 (quinze por vinte e um), '
    '20x25, 20x30, 30x40, foto 3x4 (três por quatro), polaroid, papel brilho ou fosco, orçamento, Pix, retirada.'
)
TOKEN = (HERE / 'painel_ia.token').read_text(encoding='utf-8').strip()

_lock = threading.Lock()
_model = None
_last_use = 0.0


def get_model():
    global _model, _last_use
    _last_use = time.time()
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(MODEL, device='cpu', compute_type='int8')
    return _model


def unload_when_idle():
    global _model
    while True:
        time.sleep(60)
        with _lock:
            if _model is not None and time.time() - _last_use > IDLE_UNLOAD:
                _model = None


def ler_audio(path: str):
    """Áudio (ogg/opus, mp3, webm...) -> float32 mono 16 kHz, lido direto com o PyAV.
    O faster-whisper 1.2.1 passa metadata_errors ao av.open, que o PyAV 19 removeu (TypeError);
    lendo aqui, a voz roda com as versões mais novas das bibliotecas."""
    import av
    import numpy as np
    resampler = av.audio.resampler.AudioResampler(format='s16', layout='mono', rate=16000)
    partes = []
    with av.open(path, mode='r') as container:
        try:
            for frame in container.decode(audio=0):
                for saida in resampler.resample(frame):
                    partes.append(saida.to_ndarray().reshape(-1))
        except av.error.InvalidDataError:
            pass  # final corrompido (comum em áudio do WhatsApp): usa o que deu para ler
        for saida in resampler.resample(None):
            partes.append(saida.to_ndarray().reshape(-1))
    if not partes:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(partes).astype(np.float32) / 32768.0


def transcribe(path: str) -> str:
    with _lock:  # um áudio por vez: o modelo usa a CPU toda
        segments, _info = get_model().transcribe(ler_audio(path), language='pt', initial_prompt=PROMPT, vad_filter=True)
        return normalizar_tamanhos(' '.join(segment.text.strip() for segment in segments).strip())


class Handler(BaseHTTPRequestHandler):
    server_version = 'FarePainelVoz/1'

    def log_message(self, fmt, *args):  # sem conteúdo de cliente no log
        sys.stderr.write('%s %s\n' % (time.strftime('%H:%M:%S'), fmt % args))

    def send(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        # Só o próprio PC e o servidor do site (painel_rede.json), e com o token.
        return client_allowed(self) and hmac.compare_digest(self.headers.get('X-Fare-Token', ''), TOKEN)

    def do_GET(self):
        if self.path != '/saude':
            return self.send(404, {'error': 'NOT_FOUND'})
        if not self.authorized():
            return self.send(401, {'error': 'AUTH'})
        self.send(200, {'ok': True, 'model': MODEL, 'loaded': _model is not None})

    def do_POST(self):
        if self.path != '/transcrever':
            return self.send(404, {'error': 'NOT_FOUND'})
        if not self.authorized():
            return self.send(401, {'error': 'AUTH'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BYTES:
            return self.send(413, {'error': 'TAMANHO'})
        data = self.rfile.read(length)
        started = time.time()
        handle, path = tempfile.mkstemp(suffix='.audio')
        try:
            with os.fdopen(handle, 'wb') as file:
                file.write(data)
            text = transcribe(path)
        except Exception as error:
            sys.stderr.write('erro: %s\n' % type(error).__name__)
            return self.send(502, {'error': 'TRANSCRICAO', 'message': type(error).__name__})
        finally:
            try:
                os.remove(path)
            except OSError:
                pass
        self.send(200, {'text': text, 'seconds': round(time.time() - started, 1), 'model': MODEL})


def preload():
    with _lock:
        get_model()
    print('Modelo de transcrição carregado.', flush=True)


def main():
    threading.Thread(target=unload_when_idle, daemon=True).start()
    threading.Thread(target=preload, daemon=True).start()
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Transcrição do painel em http://127.0.0.1:{PORT} (modelo {MODEL}, local)', flush=True)
    serve_on_network(ThreadingHTTPServer, Handler, PORT)
    server.serve_forever()


if __name__ == '__main__':
    main()
