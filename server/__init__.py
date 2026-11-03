"""食光机 · 后端服务。"""

from flask import Flask

from .db import close_db, ensure_db


def create_app() -> Flask:
    import os

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = Flask(
        __name__,
        static_folder=os.path.join(root, "static"),
        template_folder=os.path.join(root, "templates"),
        static_url_path="/static",
    )
    app.config["DATABASE"] = os.path.join(root, "data", "foodbox.sqlite3")
    app.secret_key = "foodbox-dev-secret-key"  # 课程作业演示用，非生产密钥
    app.teardown_appcontext(close_db)

    ensure_db(app)

    from .api import register_blueprints
    from .views import register_views

    register_blueprints(app)
    register_views(app)
    return app
