"""Corrige tamanhos de foto ditos em áudio: "dez por quinze" -> "10x15".

O reconhecimento de voz costuma errar o "quinze" ("quins", "porquins").
Só troca quando o par é um tamanho que a loja trabalha, para não mexer em
frases como "20 por 2 reais".
"""
import re

TAMANHOS = {
    (3, 4), (5, 4), (5, 5), (5, 7), (9, 12), (10, 15), (13, 18), (15, 21), (20, 25), (20, 30), (24, 30), (30, 30),
    (30, 40), (30, 45), (30, 60), (40, 50), (45, 60), (50, 60), (50, 70), (50, 75), (60, 90), (60, 100),
}

# Mais longas primeiro ("vinte e um" antes de "vinte").
NUMEROS = {
    'vinte e um': 21, 'vinte e cinco': 25, 'quarenta e cinco': 45, 'cem': 100,
    'um': 1, 'dois': 2, 'três': 3, 'tres': 3, 'quatro': 4, 'cinco': 5, 'sete': 7, 'nove': 9,
    'dez': 10, 'des': 10, 'doze': 12, 'treze': 13, 'quinze': 15, 'quinz': 15, 'quins': 15, 'quinzi': 15, 'kinze': 15,
    'dezoito': 18, 'vinte': 20, 'trinta': 30, 'quarenta': 40, 'cinquenta': 50, 'sessenta': 60, 'setenta': 70,
    'setenta e cinco': 75, 'noventa': 90,
}
_PALAVRA = '|'.join(sorted((re.escape(k) for k in NUMEROS), key=len, reverse=True))
_NUM = rf'(\d{{1,3}}|{_PALAVRA})'
_PAR = re.compile(rf'\b{_NUM}\s*(?:x|por|\*)\s*{_NUM}\b', re.IGNORECASE)


def _valor(token: str):
    token = token.lower()
    return int(token) if token.isdigit() else NUMEROS.get(token)


def normalizar_tamanhos(texto: str) -> str:
    def troca(match):
        a, b = _valor(match.group(1)), _valor(match.group(2))
        if (a, b) in TAMANHOS:
            return f'{a}x{b}'
        return match.group(0)

    texto = _PAR.sub(troca, texto)
    # "nos tamanhos 10x15" (um tamanho só) -> "no tamanho 10x15"
    return re.sub(r'\bnos tamanhos (\d+x\d+)\b(?!\s*(?:e|,)\s*\d)', r'no tamanho \1', texto)
