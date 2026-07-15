from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

_lock = threading.Lock()
_attempts: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(
    key: str,
    *,
    max_attempts: int = 5,
    window_seconds: int = 300,
) -> tuple[bool, int]:
    """Returns (allowed, retry_after_seconds)."""
    now = time.monotonic()
    cutoff = now - window_seconds

    with _lock:
        bucket = _attempts[key]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= max_attempts:
            retry_after = max(1, int(window_seconds - (now - bucket[0])))
            return False, retry_after
        bucket.append(now)
        return True, 0


def reset_rate_limit(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)
