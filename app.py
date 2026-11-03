"""食光机 · 启动入口

    .venv/bin/python app.py                 # http://localhost:5000
    .venv/bin/python app.py --port 5050     # 换端口
    PORT=8080 .venv/bin/python app.py       # 用环境变量也行

提示：macOS 的「隔空播放接收器」经常占用 5000 端口，
启动时若报 Address already in use，加 --port 5050 即可。
"""

import argparse
import os

from server import create_app

application = create_app()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="启动食光机")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", 5000)),
        help="监听端口，默认 5000",
    )
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，默认 0.0.0.0")
    parser.add_argument("--no-debug", action="store_true", help="关闭调试模式与自动重载")
    args = parser.parse_args()
    application.run(host=args.host, port=args.port, debug=not args.no_debug)
