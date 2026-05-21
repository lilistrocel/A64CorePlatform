"""
Attachments Module — Local Filesystem Storage Backend

Stores files on the local filesystem under a configurable base directory.
Path-on-disk scheme:
  {base_dir}/{org_id}/{doc_type}/{doc_id}/{file_id}.{ext}

FileId-based filenames prevent collisions and path traversal attacks because:
1. The filename is a UUID generated server-side — never derived from user input.
2. The path segments (org_id, doc_type, doc_id) are validated before they reach
   this backend (see AttachmentService).

Thread safety: Each async method runs synchronous pathlib/open operations.
In production Uvicorn workers are single-threaded per worker and Motor is
async, so blocking I/O here is safe for v1.  If throughput becomes a concern,
wrap the blocking calls in asyncio.to_thread().
"""

import asyncio
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from .base import StorageBackend


class LocalStorageBackend(StorageBackend):
    """
    StorageBackend implementation using the local filesystem via pathlib.

    Args:
        base_dir: Absolute path to the root directory where all attachments
                  are stored.  The directory is created on first use.
    """

    def __init__(self, base_dir: str) -> None:
        """
        Initialise the backend with a root directory.

        Args:
            base_dir: Absolute path to the storage root.
        """
        self._base = Path(base_dir)

    def _full_path(self, path: str) -> Path:
        """
        Resolve a relative storage path to an absolute filesystem path.

        Security note: We join with Path to avoid any traversal tricks.
        The caller (AttachmentService) guarantees path components are UUID
        strings and doc_type enum values, so traversal is not possible in
        practice, but we validate here as defence-in-depth.

        Args:
            path: Relative storage path (forward-slash separated).

        Returns:
            Absolute Path object.

        Raises:
            ValueError: If the resolved path escapes the base directory
                        (defence-in-depth, should never happen with valid UUIDs).
        """
        resolved = (self._base / path).resolve()
        # Reason: prevent path traversal — resolved path must stay inside base
        if not str(resolved).startswith(str(self._base.resolve())):
            raise ValueError(f"Path traversal attempt detected: {path!r}")
        return resolved

    async def save(self, path: str, data: bytes) -> None:
        """
        Write data to the filesystem, creating parent directories as needed.

        Args:
            path: Relative storage path.
            data: Raw bytes to write.

        Raises:
            OSError: If the write fails.
        """
        full = self._full_path(path)
        # Reason: create intermediate directories atomically
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)

    async def read(self, path: str) -> BinaryIO:
        """
        Read the file and return its content as a seekable BytesIO stream.

        The entire file is loaded into memory.  This is acceptable because
        the 10 MB upload cap keeps individual files small.

        Args:
            path: Relative storage path.

        Returns:
            BytesIO positioned at byte 0.

        Raises:
            FileNotFoundError: If no file exists at the path.
        """
        full = self._full_path(path)
        if not full.exists():
            raise FileNotFoundError(f"Attachment not found on disk: {path}")
        data = full.read_bytes()
        stream = BytesIO(data)
        stream.seek(0)
        return stream

    async def delete(self, path: str) -> None:
        """
        Delete the file from disk.

        Note: In v1, the API layer soft-deletes via MongoDB and never calls
        this at request time.  This is provided for admin tooling and tests.

        Args:
            path: Relative storage path.

        Raises:
            FileNotFoundError: If no file exists at the path.
        """
        full = self._full_path(path)
        if not full.exists():
            raise FileNotFoundError(f"Attachment not found on disk: {path}")
        full.unlink()

    async def exists(self, path: str) -> bool:
        """
        Return True if a file exists at the given path.

        Args:
            path: Relative storage path.

        Returns:
            True if the file exists.
        """
        return self._full_path(path).exists()

    async def get_size(self, path: str) -> int:
        """
        Return the file size in bytes.

        Args:
            path: Relative storage path.

        Returns:
            File size in bytes.

        Raises:
            FileNotFoundError: If no file exists at the path.
        """
        full = self._full_path(path)
        if not full.exists():
            raise FileNotFoundError(f"Attachment not found on disk: {path}")
        return full.stat().st_size
