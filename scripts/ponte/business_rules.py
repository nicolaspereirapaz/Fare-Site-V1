"""Regras comerciais determinísticas; sem ferramentas do modelo e sem rede."""
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

TIERS = (
    (1, Decimal('6.00'), Decimal('9.00')),
    (9, Decimal('3.50'), Decimal('7.00')),
    (50, Decimal('3.00'), Decimal('6.00')),
    (100, Decimal('2.50'), Decimal('5.00')),
    (250, Decimal('1.80'), Decimal('4.50')),
    (500, Decimal('1.50'), Decimal('4.00')),
    (999, Decimal('1.30'), Decimal('3.50')),
    (None, Decimal('1.00'), Decimal('2.50')),
)


def revelation_quote(size: str, quantity: int) -> dict:
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
        raise ValueError('Quantidade deve ser um inteiro positivo.')
    if size not in ('9x12', '10x15', '13x18', '15x21'):
        raise ValueError('Tamanho fora da tabela pública de revelação; consultar vendedor.')
    column = 1 if size in ('9x12', '10x15') else 2
    row = next(row for row in TIERS if row[0] is None or quantity <= row[0])
    unit = row[column]
    return {'size': size, 'quantity': quantity,
            'unit_cents': int(unit * 100), 'total_cents': int(unit * quantity * 100)}


def shop_status(now: datetime, holidays: set[str], covered_years: set[int]) -> dict:
    """Calendário deve cobrir nacionais+SP+Jundiaí para declarar loja aberta.

    Sem cobertura validada, retorna desconhecido durante expediente normal.
    Feriados são datas ISO locais. Horários no fuso America/Sao_Paulo.
    """
    if now.tzinfo is None:
        raise ValueError('Data e hora devem conter fuso explícito.')
    local = now.astimezone(ZoneInfo('America/Sao_Paulo'))
    day = local.date().isoformat()
    minute = local.hour * 60 + local.minute
    weekday = local.weekday()
    if day in holidays:
        return {'state': 'closed', 'reason': 'holiday', 'local_time': local.isoformat()}
    if weekday == 6:
        return {'state': 'closed', 'reason': 'sunday', 'local_time': local.isoformat()}
    closing = 13 * 60 if weekday == 5 else 18 * 60
    if not (9 * 60 <= minute < closing):
        return {'state': 'closed', 'reason': 'outside_hours', 'local_time': local.isoformat()}
    if local.year not in covered_years:
        return {'state': 'unknown', 'reason': 'holiday_calendar_not_validated', 'local_time': local.isoformat()}
    return {'state': 'open', 'reason': 'business_hours', 'local_time': local.isoformat()}
