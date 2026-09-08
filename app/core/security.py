"""Password hashing and JWT encode/decode helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the given plaintext password."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Check a plaintext password against a stored hash.

    Returns False (rather than raising) when the stored value is not a valid
    hash, e.g. the placeholder written into pre-existing rows by the migration.
    """
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        return False


def create_access_token(
    data: Dict[str, Any], expires_delta: timedelta | None = None
) -> str:
    """Encode a signed JWT containing `data` plus standard exp/iat claims."""
    to_encode = dict(data)
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, get_settings().secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and verify a JWT, raising jose.JWTError if it is invalid."""
    return jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])


__all__ = [
    "ALGORITHM",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "JWTError",
    "hash_password",
    "verify_password",
    "create_access_token",
    "decode_access_token",
]
