"""Canadian sales tax on subscription charges.

Tax is charged by the province of the customer - the place of supply for a
service like a directory listing - which for a business registration is the
province the business is in.

WHAT IS COLLECTED. GST (5%) or, in the harmonized provinces, HST, which
replaces GST there. These apply to a GST/HST registrant supplying services to
Canadian customers, which is what a paid listing is.

WHAT IS NOT, YET. Provincial sales taxes - BC PST, Manitoba RST, Saskatchewan
PST and Quebec QST - are listed below but switched off. Whether each applies to
an online directory subscription depends on how the service is classified
(advertising, software, digital service) and on the seller's registrations,
and that is a question for an accountant, not a guess in code. Turn a province
on by setting `collected=True` once it is confirmed.

Rates as of 2026. Nova Scotia's HST dropped from 15% to 14% on 1 April 2025.

All arithmetic is Decimal and each tax is rounded to the cent on its own, the
way it is printed on the receipt, so the lines always add up to the total.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")


@dataclass(frozen=True)
class TaxRate:
    name: str
    rate: Decimal  # percent: Decimal("13") is 13%
    collected: bool = True


@dataclass(frozen=True)
class TaxLine:
    name: str
    rate: Decimal
    amount: Decimal


@dataclass(frozen=True)
class TaxedAmount:
    subtotal: Decimal
    lines: list[TaxLine]
    tax_total: Decimal
    total: Decimal
    province: str


GST = TaxRate("GST", Decimal("5"))

RATES: dict[str, list[TaxRate]] = {
    "AB": [GST],
    "BC": [GST, TaxRate("PST", Decimal("7"), collected=False)],
    "MB": [GST, TaxRate("RST", Decimal("7"), collected=False)],
    "NB": [TaxRate("HST", Decimal("15"))],
    "NL": [TaxRate("HST", Decimal("15"))],
    "NS": [TaxRate("HST", Decimal("14"))],
    "NT": [GST],
    "NU": [GST],
    "ON": [TaxRate("HST", Decimal("13"))],
    "PE": [TaxRate("HST", Decimal("15"))],
    "QC": [GST, TaxRate("QST", Decimal("9.975"), collected=False)],
    "SK": [GST, TaxRate("PST", Decimal("6"), collected=False)],
    "YT": [GST],
}

PROVINCE_CODES = frozenset(RATES)


class UnknownProvince(ValueError):
    """Raised for a province code that is not one of the thirteen."""


def calculate(subtotal: Decimal, province: str) -> TaxedAmount:
    """Apply the taxes collected in `province` to a pre-tax amount."""
    code = province.strip().upper()
    if code not in RATES:
        raise UnknownProvince(f"Unknown province or territory: {province!r}")

    base = subtotal.quantize(CENT, rounding=ROUND_HALF_UP)
    lines = [
        TaxLine(
            name=tax.name,
            rate=tax.rate,
            amount=(base * tax.rate / Decimal(100)).quantize(CENT, rounding=ROUND_HALF_UP),
        )
        for tax in RATES[code]
        if tax.collected and base > 0
    ]
    tax_total = sum((line.amount for line in lines), Decimal("0.00"))
    return TaxedAmount(
        subtotal=base,
        lines=lines,
        tax_total=tax_total,
        total=base + tax_total,
        province=code,
    )
