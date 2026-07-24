from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import subprocess


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        payload = {
            "status": "ok",
            "runtime": "openface-remote-gpu",
            "gpus": [line.strip() for line in query.stdout.splitlines() if line.strip()],
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        return


ThreadingHTTPServer(("0.0.0.0", 7860), Handler).serve_forever()
