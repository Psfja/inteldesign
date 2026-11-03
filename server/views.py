"""页面路由：产品首页、学生 Web 端、App 端、管理后台。"""

from __future__ import annotations

from flask import render_template


def register_views(app):
    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/web")
    def web():
        return render_template("web.html")

    @app.get("/app")
    def app_page():
        return render_template("app.html")

    @app.get("/admin")
    def admin():
        return render_template("admin.html")
