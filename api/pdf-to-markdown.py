import hmac
import io
import json
import os
from http.server import BaseHTTPRequestHandler

from markitdown import MarkItDown, StreamInfo

MAX_PDF_BYTES = 25 * 1024 * 1024


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # This route is excluded from the app's Supabase-session middleware
        # (see src/proxy.ts) since it's server-to-server only, not
        # browser-facing. A shared secret stands in for that gate instead —
        # without it, anyone who finds the URL gets free PDF-to-markdown
        # conversion on our compute.
        expected_secret = os.environ.get("PDF_TO_MARKDOWN_SECRET")
        provided_secret = self.headers.get("X-Internal-Secret", "")
        if not expected_secret or not hmac.compare_digest(provided_secret, expected_secret):
            self._send_json(401, {"error": "unauthorized"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            self._send_json(400, {"error": "missing request body"})
            return
        if content_length > MAX_PDF_BYTES:
            self._send_json(413, {"error": f"pdf exceeds the {MAX_PDF_BYTES} byte limit"})
            return

        pdf_bytes = self.rfile.read(content_length)

        try:
            md = MarkItDown()
            result = md.convert_stream(
                io.BytesIO(pdf_bytes),
                stream_info=StreamInfo(extension=".pdf", mimetype="application/pdf"),
            )
        except Exception as err:  # markitdown raises various converter-specific errors
            self._send_json(422, {"error": f"could not convert pdf: {err}"})
            return

        self._send_json(200, {"markdown": result.text_content})

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
