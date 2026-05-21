"""
Attachments Module — Storage Backend Abstract Interface

Defines the contract every storage backend must fulfil.  All methods are
abstract; implementations live alongside this file (local.py, s3.py, etc.).

Design decisions:
- Paths are always posix-style strings relative to nothing — the backend
  resolves them against its own root.
- `read` returns a BinaryIO so callers can stream large files without
  loading the entire content into memory.
- `save` accepts a bytes payload (callers buffer in memory after the
  10 MB cap check — within the cap this is safe and avoids file-descriptor
  leakage in async code).
"""

import abc
from io import BytesIO
from typing import BinaryIO


class StorageBackend(abc.ABC):
    """
    Abstract base class for attachment storage backends.

    All path arguments are forward-slash separated and must not start with
    a leading slash.  Implementations are responsible for mapping them to
    their underlying storage system.
    """

    @abc.abstractmethod
    async def save(self, path: str, data: bytes) -> None:
        """
        Persist binary data at the given path, creating parent directories
        (or key prefixes) as needed.

        Args:
            path: Storage path relative to the backend root (e.g.
                  "org-uuid/PO/doc-uuid/file-uuid.pdf").
            data: Raw file content to write.

        Raises:
            OSError: If the write fails for any I/O reason.
        """

    @abc.abstractmethod
    async def read(self, path: str) -> BinaryIO:
        """
        Open the stored file and return a seekable binary stream.

        Args:
            path: Storage path relative to the backend root.

        Returns:
            Open, seekable BinaryIO positioned at byte 0.

        Raises:
            FileNotFoundError: If no file exists at the given path.
            OSError: For any other I/O error.
        """

    @abc.abstractmethod
    async def delete(self, path: str) -> None:
        """
        Remove the stored file.

        In v1 attachments are soft-deleted — the API layer never calls this
        at delete time.  It is provided for administrative tooling, future
        hard-delete compaction jobs, and test teardown.

        Args:
            path: Storage path relative to the backend root.

        Raises:
            FileNotFoundError: If no file exists at the given path.
            OSError: For any other I/O error.
        """

    @abc.abstractmethod
    async def exists(self, path: str) -> bool:
        """
        Check whether a file exists at the given path.

        Args:
            path: Storage path relative to the backend root.

        Returns:
            True if the file exists and is accessible, False otherwise.
        """

    @abc.abstractmethod
    async def get_size(self, path: str) -> int:
        """
        Return the size of the stored file in bytes.

        Args:
            path: Storage path relative to the backend root.

        Returns:
            File size in bytes.

        Raises:
            FileNotFoundError: If no file exists at the given path.
        """
