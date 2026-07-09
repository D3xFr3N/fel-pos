import base64
import hashlib
import hmac
import os
import time
from dataclasses import dataclass

from app.config import settings


@dataclass
class AccessTokenPayload:
    user_id: int
    role: str
    expires_at: int


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390000)
    return f"{salt.hex()}:{password_hash.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_hex, hash_hex = password_hash.split(":", maxsplit=1)
    except ValueError:
        return False

    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(hash_hex)
    current = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390000)
    return hmac.compare_digest(current, expected)


def create_access_token(user_id: int, role: str) -> str:
    expires_at = int(time.time()) + (settings.access_token_minutes * 60)
    payload = f"{user_id}:{role}:{expires_at}"
    signature = hmac.new(
        settings.security_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    token_raw = f"{payload}:{signature}"
    return base64.urlsafe_b64encode(token_raw.encode("utf-8")).decode("utf-8")


def decode_access_token(token: str) -> AccessTokenPayload | None:
    try:
        padded_token = token + ("=" * (-len(token) % 4))
        token_raw = base64.urlsafe_b64decode(padded_token.encode("utf-8")).decode("utf-8")
        user_id_str, role, expires_at_str, signature = token_raw.split(":", maxsplit=3)
        payload = f"{user_id_str}:{role}:{expires_at_str}"
    except Exception:
        return None

    expected_signature = hmac.new(
        settings.security_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return None

    expires_at = int(expires_at_str)
    if expires_at < int(time.time()):
        return None

    return AccessTokenPayload(user_id=int(user_id_str), role=role, expires_at=expires_at)
