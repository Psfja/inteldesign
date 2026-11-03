"""登录 / 注册（演示账号，手机号即身份）。"""

from __future__ import annotations

from flask import Blueprint, request, session

from ..common import current_user, fail, ok
from ..db import execute, query_one

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def user_json(row):
    return {
        "id": row["id"],
        "phone": row["phone"],
        "name": row["name"],
        "role": row["role"],
        "campus": row["campus"],
        "points": row["points"],
        "points_all": row["points_all"],
        "canteen_id": row["canteen_id"],
    }


@bp.get("/me")
def me():
    user = current_user()
    if not user:
        return ok({"user": None})
    data = user_json(user)
    if user["role"] == "merchant" and user["canteen_id"]:
        c = query_one("SELECT name, campus FROM canteens WHERE id = ?", (user["canteen_id"],))
        data["canteen_name"] = c["name"] if c else None
    return ok({"user": data})


@bp.post("/login")
def login():
    body = request.get_json(force=True) or {}
    phone = (body.get("phone") or "").strip()
    role = body.get("role") or "student"
    if len(phone) != 11 or not phone.isdigit():
        return fail("请输入 11 位手机号")
    row = query_one("SELECT * FROM users WHERE phone = ?", (phone,))
    if row and row["role"] != role:
        return fail(
            f"该手机号已注册为{'学生' if row['role'] == 'student' else '商家'}账号，请切换入口登录"
        )
    if not row:
        name = body.get("name") or (f"同学{phone[-4:]}" if role == "student" else "新档口")
        campus = body.get("campus") or "中心校区"
        cur = execute(
            "INSERT INTO users (phone, name, role, campus) VALUES (?,?,?,?)",
            (phone, name, role, campus),
        )
        row = query_one("SELECT * FROM users WHERE id = ?", (cur.lastrowid,))
    session["uid"] = row["id"]
    return ok({"user": user_json(row)})


@bp.post("/logout")
def logout():
    session.pop("uid", None)
    return ok({})
