"""
Attachments Module — HTTP Range Header Parser

Parses the HTTP Range request header for partial content delivery.
Used by the file download endpoint to support in-browser PDF viewing
(Chrome/Safari PDF viewers issue Range requests).
"""

from typing import Optional


def parse_range_header(range_header: str, total_size: int) -> Optional[tuple[int, int]]:
    """
    Parse an HTTP Range header and return (start, end) byte offsets.

    Handles 'bytes=start-end' and 'bytes=start-' (open-ended) forms.
    Multi-range requests (bytes=0-499,700-899) are not supported and
    return None (caller serves full content with 200 instead of 206).

    Args:
        range_header: Value of the Range header (e.g. "bytes=0-1023").
        total_size: Total file size in bytes.

    Returns:
        (start, end) tuple (both inclusive, 0-indexed), or None if the
        range is invalid, out of bounds, or is a multi-range request.
    """
    if not range_header.startswith("bytes="):
        return None

    ranges_spec = range_header[len("bytes=") :]

    # Reason: multi-range not supported — return None to serve full content
    if "," in ranges_spec:
        return None

    parts = ranges_spec.split("-", 1)
    if len(parts) != 2:
        return None

    try:
        start_str, end_str = parts
        start = int(start_str)
        end = int(end_str) if end_str else total_size - 1
    except ValueError:
        return None

    # Reason: validate range is within file bounds
    if start < 0 or end >= total_size or start > end:
        return None

    return start, end
