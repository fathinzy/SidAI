"""
Vercel Python serverless function for the Lorriq / SmartLorry demo.

This reuses the exact same framework-agnostic router (`router.dispatch`) that the
AWS Lambda handler and the local dev server use, so behaviour is identical across
all three environments. It lets the whole app (frontend + API) run on a single
Vercel deployment with no AWS required for demos.

Data + backend source are bundled under this `api/` directory by
`scripts/stage_vercel.py` so the read-only Vercel filesystem can serve them.
Point the service at the bundled data via the DATA_DIR / MODELS_DIR env vars,
which are set in vercel.json.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# The backend source (router.py, service.py, features.py, ...) is bundled next to
# this file under api/_backend so Vercel packages it with the function.
_HERE = os.path.dirname(__file__)
_BACKEND = os.path.join(_HERE, "_backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# Default the data/model locations to the bundled copies unless already set.
os.environ.setdefault("DATA_DIR", os.path.join(_BACKEND, "data"))
os.environ.setdefault("MODELS_DIR", os.path.join(_BACKEND, "models"))

from router import dispatch  # noqa: E402  (import after sys.path setup)


class handler(BaseHTTPRequestHandler):
    """Vercel invokes this per request. We translate the HTTP request into a
    call to the shared router and write the router's response back out."""

    def _run(self, method):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        body = {}
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            raw = self.rfile.read(length)
            try:
                body = json.loads(raw)
            except (ValueError, TypeError):
                body = {}

        try:
            status, headers, out = dispatch(method, parsed.path, query=query, body=body)
        except Exception as e:  # noqa: BLE001 - never 500 silently in a demo
            status = 500
            headers = {"Content-Type": "application/json",
                       "Access-Control-Allow-Origin": "*"}
            out = json.dumps({"error": f"{type(e).__name__}: {e}"})

        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if out:
            self.wfile.write(out.encode())

    def do_GET(self):
        self._run("GET")

    def do_POST(self):
        self._run("POST")

    def do_OPTIONS(self):
        self._run("OPTIONS")
