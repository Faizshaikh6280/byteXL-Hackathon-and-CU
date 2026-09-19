"""
RFC 6238 Time-Based One-Time Password (TOTP) Multi-Factor Authentication.
Includes:
- Standard RFC 6238 / RFC 4226 HMAC-SHA1 TOTP generation and verification
- Drift compensation (±1 step / ±30 seconds)
- Authenticated AES-256-GCM encryption of secrets at rest
- Cryptographically secure one-time backup recovery codes
"""

import os
import time
import hmac
import hashlib
import struct
import base64
import secrets
from typing import List, Tuple, Optional
from app.core.config import settings
from app.core.storage import storage_service

class TOTPService:
    STEP_SECONDS = 30
    DIGITS = 6

    @staticmethod
    def generate_secret(byte_length: int = 20) -> str:
        """Generates a random Base32-encoded TOTP secret (default 160 bits)."""
        raw_bytes = secrets.token_bytes(byte_length)
        return base64.b32encode(raw_bytes).decode("ascii").rstrip("=")

    @classmethod
    def generate_totp_code(cls, secret_base32: str, timestamp: Optional[float] = None) -> str:
        """Generates a standard 6-digit TOTP code for a given timestamp."""
        if timestamp is None:
            timestamp = time.time()
        
        # Pad base32 string if needed
        padding_needed = (8 - (len(secret_base32) % 8)) % 8
        padded_secret = secret_base32 + ("=" * padding_needed)
        key = base64.b32decode(padded_secret, casefold=True)

        counter = int(timestamp // cls.STEP_SECONDS)
        msg = struct.pack(">Q", counter)
        h = hmac.new(key, msg, hashlib.sha1).digest()

        # Dynamic truncation (RFC 4226 Section 5.4)
        offset = h[19] & 0x0F
        code_bin = (
            ((h[offset] & 0x7F) << 24) |
            ((h[offset + 1] & 0xFF) << 16) |
            ((h[offset + 2] & 0xFF) << 8) |
            (h[offset + 3] & 0xFF)
        )
        code = code_bin % (10 ** cls.DIGITS)
        return f"{code:0{cls.DIGITS}d}"

    @classmethod
    def verify_totp_code(
        cls, secret_base32: str, code: str, window_tolerance: int = 1, timestamp: Optional[float] = None
    ) -> bool:
        """
        Verifies a user-provided 6-digit code against the secret.
        Allows ±window_tolerance steps for clock skew (default 1 = ±30s).
        """
        if not code or len(code.strip()) != cls.DIGITS or not code.strip().isdigit():
            return False
        
        cleaned_code = code.strip()
        if timestamp is None:
            timestamp = time.time()

        for step_offset in range(-window_tolerance, window_tolerance + 1):
            check_time = timestamp + (step_offset * cls.STEP_SECONDS)
            expected = cls.generate_totp_code(secret_base32, timestamp=check_time)
            if hmac.compare_digest(cleaned_code, expected):
                return True
        return False

    @staticmethod
    def get_provisioning_uri(secret_base32: str, account_name: str, issuer: str = "TRACE Investigation") -> str:
        """Returns standard otpauth:// URL for authenticator apps (Google Authenticator, etc.)."""
        from urllib.parse import quote
        safe_account = quote(account_name)
        safe_issuer = quote(issuer)
        return f"otpauth://totp/{safe_issuer}:{safe_account}?secret={secret_base32}&issuer={safe_issuer}&algorithm=SHA1&digits=6&period=30"

    @staticmethod
    def encrypt_secret(secret_base32: str) -> str:
        """Encrypts TOTP secret with authenticated AES-256-GCM using application master key."""
        encrypted_bytes, _ = storage_service.encrypt_data(secret_base32.encode("utf-8"))
        return base64.b64encode(encrypted_bytes).decode("ascii")

    @staticmethod
    def decrypt_secret(encrypted_secret_b64: str) -> str:
        """Decrypts TOTP secret from ciphertext."""
        encrypted_bytes = base64.b64decode(encrypted_secret_b64.encode("ascii"))
        decrypted_bytes = storage_service.decrypt_data(encrypted_bytes)
        return decrypted_bytes.decode("utf-8")

    @staticmethod
    def generate_backup_codes(count: int = 8) -> Tuple[List[str], List[str]]:
        """
        Generates one-time backup recovery codes.
        Returns:
            plain_codes: list of 10-character recovery codes shown to user once
            hashed_codes: list of SHA-256 hashes to store securely in database
        """
        plain_codes = []
        hashed_codes = []
        for _ in range(count):
            token = secrets.token_hex(5).upper()  # 10 chars
            formatted = f"{token[:5]}-{token[5:]}"
            plain_codes.append(formatted)
            hashed = hashlib.sha256(formatted.encode("utf-8")).hexdigest()
            hashed_codes.append(hashed)
        return plain_codes, hashed_codes

    @staticmethod
    def verify_backup_code(plain_code: str, hashed_codes: List[str]) -> Tuple[bool, List[str]]:
        """
        Verifies and burns a one-time recovery backup code.
        Returns (is_valid, remaining_hashed_codes).
        """
        clean = plain_code.strip().upper()
        target_hash = hashlib.sha256(clean.encode("utf-8")).hexdigest()
        for idx, h in enumerate(hashed_codes):
            if hmac.compare_digest(h, target_hash):
                # Consume this code
                remaining = [c for i, c in enumerate(hashed_codes) if i != idx]
                return True, remaining
        return False, hashed_codes


totp_service = TOTPService()
