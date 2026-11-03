from flask import Blueprint

from . import admin, auth, public, student

bp = Blueprint("api", __name__)


def register_blueprints(app):
    app.register_blueprint(auth.bp)
    app.register_blueprint(public.bp)
    app.register_blueprint(student.bp)
    app.register_blueprint(admin.bp)
