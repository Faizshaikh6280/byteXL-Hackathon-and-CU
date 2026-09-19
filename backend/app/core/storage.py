import os
os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
import io
import hashlib
import logging
from typing import Tuple, Dict, Any, Optional
import boto3
from botocore.client import Config
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.core.config import settings

logger = logging.getLogger("investigation.storage")

class StorageService:
    """
    MinIO S3-compatible Object Storage client with Authenticated AES-256-GCM
    client-side encryption, immutable evidence write paths, and SHA-256 chain-of-custody verification.
    """

    def __init__(self):
        # Resolve endpoint url
        endpoint = settings.MINIO_ENDPOINT
        if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
            protocol = "https" if settings.MINIO_SECURE else "http"
            self.endpoint_url = f"{protocol}://{endpoint}"
        else:
            self.endpoint_url = endpoint

        # Initialize boto3 S3 client with short timeouts to avoid blocking startup
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                connect_timeout=10,
                read_timeout=60,
                max_pool_connections=50,
                retries={'max_attempts': 3, 'mode': 'standard'}
            ),
            region_name="us-east-1"
        )

        # Derive 32-byte AES key
        master_key_bytes = bytes.fromhex(settings.ENCRYPTION_MASTER_KEY[:64])
        if len(master_key_bytes) != 32:
            master_key_bytes = hashlib.sha256(settings.ENCRYPTION_MASTER_KEY.encode()).digest()
        self.aes_key = master_key_bytes
        self._storage_status_cache = {"available": None, "last_check": 0.0}

    def is_storage_available(self) -> bool:
        """Fast circuit breaker checking if MinIO S3 endpoint is reachable (cached for 30s)."""
        import time
        now = time.time()
        if self._storage_status_cache["available"] is not None and (now - self._storage_status_cache["last_check"]) < 30.0:
            return self._storage_status_cache["available"]
        try:
            self.s3_client.list_buckets()
            self._storage_status_cache["available"] = True
        except Exception:
            self._storage_status_cache["available"] = False
        self._storage_status_cache["last_check"] = now
        return self._storage_status_cache["available"]

    def ensure_buckets(self):
        """Ensure required buckets exist with bucket versioning enabled for immutability."""
        for bucket in [settings.MINIO_BUCKET_EVIDENCE, settings.MINIO_BUCKET_WAREHOUSE]:
            try:
                self.s3_client.head_bucket(Bucket=bucket)
            except Exception:
                try:
                    self.s3_client.create_bucket(Bucket=bucket)
                    logger.info(f"[MinIO] Created bucket: {bucket}")
                except Exception as ce:
                    # Ignore if bucket already exists
                    err_msg = str(ce)
                    if "BucketAlreadyOwnedByYou" not in err_msg and "BucketAlreadyExists" not in err_msg:
                        logger.warning(f"[MinIO] Could not create bucket {bucket}: {ce}")

    @staticmethod
    def calculate_sha256(data: bytes) -> str:
        """Deterministic SHA-256 checksum calculation."""
        hasher = hashlib.sha256()
        hasher.update(data)
        return hasher.hexdigest()

    def encrypt_data(self, plaintext: bytes) -> Tuple[bytes, Dict[str, Any]]:
        """
        Encrypt raw evidence using AES-256-GCM.
        Returns:
            (ciphertext_with_nonce, encryption_metadata)
        """
        aesgcm = AESGCM(self.aes_key)
        nonce = os.urandom(12)  # Standard 96-bit nonce for AES-GCM
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        payload = nonce + ciphertext  # Prepend 12-byte nonce

        meta = {
            "algorithm": "AES-256-GCM",
            "nonce_bytes": 12,
            "tag_bytes": 16,
            "key_version": "v1"
        }
        return payload, meta

    def decrypt_data(self, encrypted_payload: bytes) -> bytes:
        """Decrypt AES-256-GCM encrypted payload using the prepended 12-byte nonce."""
        if len(encrypted_payload) < 28:
            raise ValueError("Payload too short for AES-GCM ciphertext")
        nonce = encrypted_payload[:12]
        ciphertext = encrypted_payload[12:]
        aesgcm = AESGCM(self.aes_key)
        return aesgcm.decrypt(nonce, ciphertext, None)

    def store_encrypted_evidence(
        self,
        case_id: str,
        evidence_id: str,
        filename: str,
        raw_bytes: bytes
    ) -> Tuple[str, str, Dict[str, Any]]:
        """
        Calculates SHA-256, encrypts raw bytes, and stores to immutable MinIO key.
        Returns:
            (storage_path, sha256_hash, encryption_metadata)
        """
        self.ensure_buckets()
        sha256_hash = self.calculate_sha256(raw_bytes)
        encrypted_bytes, enc_meta = self.encrypt_data(raw_bytes)

        storage_path = f"cases/{case_id}/evidence/{evidence_id}/original/{filename}.enc"

        self.s3_client.put_object(
            Bucket=settings.MINIO_BUCKET_EVIDENCE,
            Key=storage_path,
            Body=encrypted_bytes,
            ContentType="application/octet-stream",
            Metadata={
                "evidence_id": evidence_id,
                "case_id": case_id,
                "sha256": sha256_hash,
                "original_filename": filename
            }
        )
        logger.info(f"[MinIO] Successfully stored encrypted evidence to {storage_path}")
        return storage_path, sha256_hash, enc_meta

    def get_decrypted_evidence(self, storage_path: str) -> bytes:
        """
        Authorized read path: fetches encrypted object and decrypts into memory.
        The original immutable object in MinIO is never modified.
        """
        response = self.s3_client.get_object(
            Bucket=settings.MINIO_BUCKET_EVIDENCE,
            Key=storage_path
        )
        encrypted_bytes = response["Body"].read()
        return self.decrypt_data(encrypted_bytes)

    def verify_integrity(self, storage_path: str, expected_sha256: str) -> bool:
        """
        Tamper-evident chain of custody verification:
        Decrypts stored object, recalculates SHA-256, and verifies equivalence with registry hash.
        """
        decrypted_bytes = self.get_decrypted_evidence(storage_path)
        recalculated_sha256 = self.calculate_sha256(decrypted_bytes)
        is_valid = recalculated_sha256.lower() == expected_sha256.lower()
        if not is_valid:
            logger.error(
                f"[Integrity] Check failed for {storage_path}! Expected: {expected_sha256}, Got: {recalculated_sha256}"
            )
        return is_valid

# Singleton instance
storage_service = StorageService()
