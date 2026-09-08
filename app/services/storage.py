"""Object storage for uploaded videos.

This module is the only place in the codebase that knows how bytes are stored.
Everything else deals in opaque string keys. Swapping MinIO for AWS S3 in
ca-central-1, or for Azure Blob behind an S3 gateway, should touch this file
and nothing else - so keep boto3 types out of the public signatures below.

Locally this talks to the `minio` compose service, which speaks the S3 API.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import TYPE_CHECKING, BinaryIO

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_s3.client import S3Client
else:
    S3Client = object

logger = logging.getLogger(__name__)

DEFAULT_PRESIGN_EXPIRY_SECONDS = 3600
DEFAULT_CONTENT_TYPE = "audio/webm"

# Server-side encryption applied to the whole bucket. See ensure_bucket().
_SSE_ALGORITHM = "AES256"

# MinIO ignores regions, but boto3 requires one to sign requests.
_SIGNING_REGION = "us-east-1"


class StorageError(RuntimeError):
    """Raised when an object-storage operation fails."""


def _build_client(endpoint: str) -> S3Client:
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name=_SIGNING_REGION,
        # Path-style addressing: MinIO does not do virtual-host buckets, and
        # neither does a bucket name that is not DNS-safe.
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


@lru_cache
def get_client() -> S3Client:
    """Client for server-side calls (backend and Celery workers)."""
    return _build_client(get_settings().minio_endpoint)


@lru_cache
def get_presign_client() -> S3Client:
    """Client used only to sign URLs handed to a browser.

    A URL signed against the in-cluster endpoint (http://minio:9000) is
    unusable outside Docker: the browser cannot resolve `minio`, and rewriting
    the host afterwards invalidates the signature. So presigned URLs are signed
    against the public endpoint from the start.
    """
    return _build_client(get_settings().presign_endpoint)


def bucket_name() -> str:
    return get_settings().minio_bucket_videos


def ensure_bucket() -> bool:
    """Create the videos bucket if it is not already there.

    Idempotent and safe to call on every startup. Returns True if the bucket is
    usable afterwards, False if storage could not be reached - callers decide
    whether that is fatal.
    """
    client = get_client()
    bucket = bucket_name()
    try:
        client.head_bucket(Bucket=bucket)
        logger.info("storage: bucket %r already exists", bucket)
        enable_bucket_encryption()
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            logger.warning("storage: cannot inspect bucket %r: %s", bucket, exc)
            return False
    except BotoCoreError as exc:
        logger.warning("storage: cannot reach object storage: %s", exc)
        return False

    try:
        client.create_bucket(Bucket=bucket)
        logger.info("storage: created bucket %r", bucket)
        enable_bucket_encryption()
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        # Another worker won the race; that is a success for our purposes.
        if code in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            logger.info("storage: bucket %r created concurrently", bucket)
            enable_bucket_encryption()
            return True
        logger.warning("storage: could not create bucket %r: %s", bucket, exc)
        return False
    except BotoCoreError as exc:
        logger.warning("storage: could not create bucket %r: %s", bucket, exc)
        return False


def enable_bucket_encryption() -> bool:
    """Turn on SSE-S3 for the whole bucket. Idempotent.

    Every object written afterwards is encrypted by the storage backend using a
    key it derives from the KMS master key, so the bytes on disk are opaque and
    nothing in the application has to remember to encrypt.

    Requires MinIO to be started with MINIO_KMS_SECRET_KEY; without it MinIO has
    no key source and rejects this call.
    """
    bucket = bucket_name()
    try:
        get_client().put_bucket_encryption(
            Bucket=bucket,
            ServerSideEncryptionConfiguration={
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": _SSE_ALGORITHM
                        }
                    }
                ]
            },
        )
    except (ClientError, BotoCoreError) as exc:
        logger.error(
            "storage: could not enable encryption on %r - objects would be "
            "written in the clear: %s",
            bucket,
            exc,
        )
        return False

    logger.info("storage: bucket %r encryption set to %s", bucket, _SSE_ALGORITHM)
    return True


def bucket_encryption() -> str | None:
    """Return the bucket's default SSE algorithm, or None if unencrypted."""
    try:
        conf = get_client().get_bucket_encryption(Bucket=bucket_name())
    except (ClientError, BotoCoreError):
        return None
    rules = conf.get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
    if not rules:
        return None
    return rules[0].get("ApplyServerSideEncryptionByDefault", {}).get("SSEAlgorithm")


def upload_video(
    file_bytes: bytes, key: str, content_type: str = DEFAULT_CONTENT_TYPE
) -> str:
    """Store `file_bytes` under `key` and return the key.

    The returned key is what belongs in Submission.video_path - it is the only
    handle the rest of the app needs, and it stays valid across a change of
    storage provider.
    """
    try:
        get_client().put_object(
            Bucket=bucket_name(),
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as exc:
        raise StorageError(f"Failed to upload {key!r}: {exc}") from exc

    logger.info("storage: uploaded %r (%d bytes)", key, len(file_bytes))
    return key


def upload_video_stream(
    fileobj: BinaryIO, key: str, content_type: str = DEFAULT_CONTENT_TYPE
) -> str:
    """Stream an open file object to storage without reading it into memory.

    The bytes-in variant above is fine for small payloads, but a 100 MB video
    would be held in RAM in full. boto3's upload_fileobj reads in chunks and
    switches to a multipart upload automatically. Returns the key.
    """
    try:
        get_client().upload_fileobj(
            Fileobj=fileobj,
            Bucket=bucket_name(),
            Key=key,
            ExtraArgs={"ContentType": content_type},
        )
    except (ClientError, BotoCoreError) as exc:
        raise StorageError(f"Failed to upload {key!r}: {exc}") from exc

    logger.info("storage: streamed upload of %r", key)
    return key


def download_video(key: str) -> bytes:
    """Return the object's bytes, or raise StorageError if it is not there."""
    try:
        response = get_client().get_object(Bucket=bucket_name(), Key=key)
        return response["Body"].read()
    except (ClientError, BotoCoreError) as exc:
        raise StorageError(f"Failed to download {key!r}: {exc}") from exc


def download_video_to_file(key: str, dest_path: str) -> int:
    """Stream an object to a local path and return the bytes written.

    ffmpeg and faster-whisper both want a file path, not a buffer, and a 100 MB
    video should not pass through RAM to get there. boto3 downloads in chunks.
    """
    try:
        with open(dest_path, "wb") as fh:
            get_client().download_fileobj(
                Bucket=bucket_name(), Key=key, Fileobj=fh
            )
    except (ClientError, BotoCoreError) as exc:
        raise StorageError(f"Failed to download {key!r}: {exc}") from exc

    size = os.path.getsize(dest_path)
    logger.info("storage: downloaded %r to %s (%d bytes)", key, dest_path, size)
    return size


def delete_video(key: str) -> bool:
    """Delete the object. Returns True on success, False if the call failed.

    S3 delete is idempotent: deleting a key that does not exist still succeeds,
    so True does not prove the object was there beforehand.
    """
    try:
        get_client().delete_object(Bucket=bucket_name(), Key=key)
    except (ClientError, BotoCoreError) as exc:
        logger.warning("storage: failed to delete %r: %s", key, exc)
        return False

    logger.info("storage: deleted %r", key)
    return True


def video_exists(key: str) -> bool:
    """True if an object exists at `key`."""
    try:
        get_client().head_object(Bucket=bucket_name(), Key=key)
        return True
    except ClientError:
        return False
    except BotoCoreError as exc:
        raise StorageError(f"Failed to stat {key!r}: {exc}") from exc


def generate_presigned_url(
    key: str, expires_in: int = DEFAULT_PRESIGN_EXPIRY_SECONDS
) -> str:
    """Return a time-limited URL a browser can GET directly.

    Signed against the public endpoint so it works outside the Docker network.
    """
    try:
        return get_presign_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket_name(), "Key": key},
            ExpiresIn=expires_in,
        )
    except (ClientError, BotoCoreError) as exc:
        raise StorageError(f"Failed to presign {key!r}: {exc}") from exc


__all__ = [
    "StorageError",
    "bucket_name",
    "ensure_bucket",
    "enable_bucket_encryption",
    "bucket_encryption",
    "upload_video",
    "upload_video_stream",
    "download_video",
    "download_video_to_file",
    "delete_video",
    "video_exists",
    "generate_presigned_url",
]
