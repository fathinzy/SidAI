"""
Local development server for SmartLorry.

Zero external dependencies (stdlib http.server) so you can run the exact same
routing logic as Lambda without installing a web framework.

    python local_server.py --port 8000
"""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from router import dispatch


class Handler(BaseHTTPRequestHandler):
    def _handle(self, method):
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
        status, headers, out = dispatch(method, parsed.path, query=query, body=body)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if out:
            self.wfile.write(out.encode())

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_OPTIONS(self):
        self._handle("OPTIONS")

    def log_message(self, fmt, *args):
        print(f"[local] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"SmartLorry API running at http://localhost:{args.port}")
    print("Try: http://localhost:%d/api/kpis" % args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
