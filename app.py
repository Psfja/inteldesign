"""食光机 · 启动入口

    .venv/bin/python app.py            # 默认 http://0.0.0.0:5000
    PORT=8080 .venv/bin/python app.py
"""

import os

from server import create_app

application = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    application.run(host="0.0.0.0", port=port, debug=True)
