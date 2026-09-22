#!/usr/bin/env python3
"""
Dev server for BroSplit. Use this instead of `python3 -m http.server`.

`http.server` sends no Cache-Control at all — only Last-Modified. With no cache
directive browsers apply heuristic freshness and will serve a stale module
without revalidating. That produced a real failure on 09/22/26: a fresh app.js
loaded against a cached store.js, so a function that existed on disk was
undefined in the browser.

Every response here is no-store, so a plain reload always gets current code.

    python3 serve.py [port]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '304' not in fmt % args:
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print(f'BroSplit dev server — http://localhost:{port}  (no-store, reload always fresh)')
    try:
        ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')
