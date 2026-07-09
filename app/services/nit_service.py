from __future__ import annotations


def normalize_nit(raw_nit: str | None) -> str:
    raw = (raw_nit or "").strip().upper()
    compact = raw.replace("-", "").replace("/", "").replace(" ", "")
    if not compact or compact == "CF":
        return "CF"
    return compact


def _expected_check_digit(body: str) -> str:
    weighted_sum = sum((len(body) + 1 - idx) * int(digit) for idx, digit in enumerate(body, start=1))
    check_value = (11 - (weighted_sum % 11)) % 11
    if check_value == 10:
        return "K"
    return str(check_value)


def is_valid_nit(nit: str) -> bool:
    if nit == "CF":
        return True
    if len(nit) < 2 or len(nit) > 13:
        return False
    if any(ch not in "0123456789K" for ch in nit):
        return False
    if nit.count("K") > 1:
        return False
    if "K" in nit and not nit.endswith("K"):
        return False

    body = nit[:-1]
    check_digit = nit[-1]
    if not body or not body.isdigit():
        return False

    return _expected_check_digit(body) == check_digit
