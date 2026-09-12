"""Temporary recovery-only protection. No database access or startup side effects.

The baseline retains read access but cannot overwrite persistent AAC JSON/history
or cascade-delete students/classes while its older frontend is serving.
"""
import json
import re


class RecoveryGuard:
    def __init__(self, app): self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            method = scope.get("method", "GET").upper()
            path = scope.get("path", "")
            aac_write = method not in ("GET", "HEAD", "OPTIONS") and re.match(r"^/classes/\d+/aac(?:/|$)", path)
            destructive_roster = method == "DELETE" and re.match(r"^/(?:students|classes)(?:/|$)", path)
            if aac_write or destructive_roster:
                body = json.dumps({"detail":"Temporary recovery mode: AAC changes and permanent student/class deletion are paused to preserve progress history."}).encode()
                await send({"type":"http.response.start", "status":503, "headers":[(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type":"http.response.body", "body":body})
                return
        await self.app(scope, receive, send)
