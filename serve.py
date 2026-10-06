"""Local preview server. Run: python3 serve.py"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

if __name__ == '__main__':
    print('Open http://localhost:8000 — press Ctrl+C to stop.')
    ThreadingHTTPServer(('127.0.0.1', 8000), partial(Handler, directory=str(Path(__file__).parent))).serve_forever()
