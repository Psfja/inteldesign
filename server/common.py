"""接口通用工具：响应格式、登录态、碳积分等级。"""

from __future__ import annotations

import functools
import random
import string
import time

from flask import jsonify, session

from .db import query_one

# 碳积分等级（按累计积分）
LEVELS = [
    (0, "一粒米", "🌱"),
    (300, "小嫩芽", "🌿"),
    (1000, "青苗", "🌾"),
    (2500, "小树", "🌳"),
    (5000, "大树", "🌲"),
    (9000, "一片林", "🌴"),
]


def ok(data=None, **extra):
    payload = {"ok": True, "data": data if data is not None else {}}
    payload.update(extra)
    return jsonify(payload)


def fail(message: str, status: int = 400, **extra):
    payload = {"ok": False, "message": message}
    payload.update(extra)
    return jsonify(payload), status


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    return query_one("SELECT * FROM users WHERE id = ?", (uid,))


def require_login(role: str | None = None):
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if user is None:
                return fail("请先登录", 401)
            if role and user["role"] != role:
                return fail("当前账号没有该模块的权限", 403)
            return fn(user, *args, **kwargs)

        return wrapper

    return deco


def level_of(points_all: int) -> dict:
    idx = 0
    for i, (threshold, _name, _emoji) in enumerate(LEVELS):
        if points_all >= threshold:
            idx = i
    name, emoji = LEVELS[idx][1], LEVELS[idx][2]
    next_threshold = LEVELS[idx + 1][0] if idx + 1 < len(LEVELS) else None
    if next_threshold is None:
        progress = 1.0
        to_next = 0
    else:
        span = next_threshold - LEVELS[idx][0]
        progress = min(1.0, (points_all - LEVELS[idx][0]) / span)
        to_next = max(0, next_threshold - points_all)
    return {
        "level": idx + 1,
        "name": name,
        "emoji": emoji,
        "progress": round(progress, 3),
        "to_next": to_next,
        "next_name": LEVELS[idx + 1][1] if next_threshold is not None else None,
    }


def yuan(fen: int) -> str:
    """分 → 元，整数不带小数，有零头保留两位。"""
    if fen % 100 == 0:
        return str(fen // 100)
    return f"{fen / 100:.2f}"


def new_pickup_code() -> str:
    return "".join(random.choice(string.digits) for _ in range(6))


def new_order_no(prefix: str = "SG") -> str:
    return prefix + time.strftime("%Y%m%d%H%M%S") + "".join(
        random.choice(string.digits) for _ in range(3)
    )
