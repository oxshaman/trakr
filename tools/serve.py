#!/usr/bin/env python3
"""Static dev server for trakr.

Usage: python3 tools/serve.py [port] [host]

It serves the project folder and sends "Cache-Control: no-store" so edits
show up on reload. Pass host 0.0.0.0 to open the app from another device
on the same network.
"""
import functools
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".gs": "text/plain",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "--quiet" not in sys.argv:
            super().log_message(fmt, *args)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 5173
    host = args[1] if len(args) > 1 else "127.0.0.1"
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(Handler, directory=root)
    with http.server.ThreadingHTTPServer((host, port), handler) as httpd:
        print(f"trakr dev server on http://localhost:{port}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
