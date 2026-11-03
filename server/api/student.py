"""学生端接口：下单、订单、核销码、碳积分、兑换、评价。"""

from __future__ import annotations

from flask import Blueprint, request

from ..common import (
    fail,
    level_of,
    new_order_no,
    new_pickup_code,
    ok,
    require_login,
)
from ..db import execute, get_db, query, query_one

bp = Blueprint("student", __name__, url_prefix="/api")

ORDER_SQL = """
    SELECT o.*, b.title, b.subtitle, b.cover_emoji, b.price, b.pickup_start, b.pickup_end,
           c.name AS canteen_name, c.campus, c.window AS canteen_window
      FROM orders o
      JOIN boxes b ON b.id = o.box_id
      JOIN canteens c ON c.id = b.canteen_id
"""


def order_json(row) -> dict:
    return {
        "id": row["id"],
        "order_no": row["order_no"],
        "box_id": row["box_id"],
        "title": row["title"],
        "subtitle": row["subtitle"],
        "cover_emoji": row["cover_emoji"],
        "canteen": row["canteen_name"],
        "campus": row["campus"],
        "window": row["canteen_window"],
        "pickup_start": row["pickup_start"],
        "pickup_end": row["pickup_end"],
        "qty": row["qty"],
        "amount": row["amount"],
        "amount_yuan": f"{row['amount'] / 100:.2f}",
        "status": row["status"],
        "pickup_code": row["pickup_code"],
        "carbon_g": row["carbon_g"],
        "points": row["points"],
        "created_at": row["created_at"],
        "verified_at": row["verified_at"],
    }


@bp.post("/orders")
@require_login("student")
def create_order(user):
    body = request.get_json(force=True) or {}
    box_id = int(body.get("box_id") or 0)
    qty = int(body.get("qty") or 1)
    if qty < 1 or qty > 5:
        return fail("一次最多预订 5 份")
    box = query_one("SELECT * FROM boxes WHERE id = ?", (box_id,))
    if not box:
        return fail("盲盒不存在", 404)
    if box["status"] != "active" or box["remain"] <= 0:
        return fail("这个盲盒已经卖完啦，看看别的？")
    if qty > box["remain"]:
        return fail(f"仅剩 {box['remain']} 份，请调整数量")
    amount = box["price"] * qty
    carbon = box["carbon_g"] * qty
    points = carbon // 10
    db = get_db()
    cur = db.execute(
        """INSERT INTO orders (order_no, user_id, box_id, qty, amount, status,
                               pickup_code, carbon_g, points, created_at)
           VALUES (?,?,?,?,?, 'booked', ?,?,?, datetime('now','localtime'))""",
        (new_order_no(), user["id"], box_id, qty, amount, new_pickup_code(), carbon, points),
    )
    db.execute(
        "UPDATE boxes SET remain = remain - ?, status = CASE WHEN remain - ? <= 0 THEN 'soldout' ELSE status END WHERE id = ?",
        (qty, qty, box_id),
    )
    db.commit()
    row = query_one(ORDER_SQL + " WHERE o.id = ?", (cur.lastrowid,))
    return ok({"order": order_json(row)}, message="预订成功，记得按时取餐")


@bp.get("/orders")
@require_login("student")
def my_orders(user):
    status = request.args.get("status") or "all"
    where, params = ["o.user_id = ?"], [user["id"]]
    if status != "all":
        where.append("o.status = ?")
        params.append(status)
    rows = query(
        ORDER_SQL + " WHERE " + " AND ".join(where) + " ORDER BY o.id DESC", params
    )
    counts = {
        r["status"]: r["c"]
        for r in query(
            "SELECT status, COUNT(*) c FROM orders WHERE user_id = ? GROUP BY status", (user["id"],)
        )
    }
    return ok(
        {
            "orders": [order_json(r) for r in rows],
            "counts": {"all": sum(counts.values()), "booked": counts.get("booked", 0),
                       "done": counts.get("done", 0), "cancelled": counts.get("cancelled", 0)},
        }
    )


@bp.get("/orders/<int:order_id>")
@require_login()
def order_detail(user, order_id: int):
    row = query_one(ORDER_SQL + " WHERE o.id = ? AND o.user_id = ?", (order_id, user["id"]))
    if not row:
        return fail("订单不存在", 404)
    data = order_json(row)
    data["review"] = query_one("SELECT rating, text FROM reviews WHERE order_id = ?", (order_id,))
    return ok({"order": data})


@bp.post("/orders/<int:order_id>/cancel")
@require_login("student")
def cancel_order(user, order_id: int):
    row = query_one("SELECT * FROM orders WHERE id = ? AND user_id = ?", (order_id, user["id"]))
    if not row:
        return fail("订单不存在", 404)
    if row["status"] != "booked":
        return fail("只有待取餐的订单可以取消")
    db = get_db()
    db.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", (order_id,))
    db.execute(
        "UPDATE boxes SET remain = remain + ?, status = CASE WHEN status = 'soldout' AND remain + ? > 0 THEN 'active' ELSE status END WHERE id = ?",
        (row["qty"], row["qty"], row["box_id"]),
    )
    db.commit()
    return ok({}, message="已取消，费用将原路退回")


@bp.get("/carbon")
@require_login()
def carbon(user):
    logs = [
        dict(r)
        for r in query(
            """SELECT * FROM carbon_logs WHERE user_id = ?
               ORDER BY id DESC LIMIT 20""",
            (user["id"],),
        )
    ]
    rank_row = query_one(
        """SELECT COUNT(*) + 1 AS rk FROM users
            WHERE role = 'student' AND points_all > ?""",
        (user["points_all"],),
    )
    return ok(
        {
            "points": user["points"],
            "points_all": user["points_all"],
            "level": level_of(user["points_all"]),
            "rank": rank_row["rk"],
            "logs": logs,
            "carbon_g": query_one(
                """SELECT COALESCE(SUM(carbon_g),0) g FROM orders
                    WHERE user_id = ? AND status = 'done'""",
                (user["id"],),
            )["g"],
            "saved_meals": query_one(
                "SELECT COUNT(*) c FROM orders WHERE user_id = ? AND status = 'done'", (user["id"],)
            )["c"],
        }
    )


@bp.get("/carbon/leaderboard")
@require_login()
def leaderboard(user):
    rows = [
        dict(r)
        for r in query(
            """SELECT u.id, u.name, u.campus, u.points_all,
                      COALESCE(SUM(o.carbon_g),0) AS carbon_g
                 FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'done'
                WHERE u.role = 'student'
                GROUP BY u.id ORDER BY u.points_all DESC LIMIT 20"""
        )
    ]
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return ok({"board": rows, "me_id": user["id"]})


@bp.get("/rewards")
def rewards():
    return ok({"rewards": [dict(r) for r in query("SELECT * FROM rewards ORDER BY points")]})


@bp.post("/rewards/<int:reward_id>/redeem")
@require_login("student")
def redeem(user, reward_id: int):
    reward = query_one("SELECT * FROM rewards WHERE id = ?", (reward_id,))
    if not reward:
        return fail("权益不存在", 404)
    if reward["stock"] <= 0:
        return fail("这个权益已经被换完啦")
    if user["points"] < reward["points"]:
        return fail(f"还差 {reward['points'] - user['points']} 积分")
    db = get_db()
    db.execute(
        """INSERT INTO redemptions (user_id, reward_id, points, code, created_at)
           VALUES (?,?,?,?, datetime('now','localtime'))""",
        (user["id"], reward_id, reward["points"], new_order_no("EX")),
    )
    db.execute("UPDATE rewards SET stock = stock - 1 WHERE id = ?", (reward_id,))
    db.execute(
        "UPDATE users SET points = points - ? WHERE id = ?", (reward["points"], user["id"])
    )
    db.execute(
        """INSERT INTO carbon_logs (user_id, delta, reason, created_at)
           VALUES (?,?,?, datetime('now','localtime'))""",
        (user["id"], -reward["points"], f"兑换 {reward['name']}"),
    )
    db.commit()
    return ok({}, message=f"已兑换「{reward['name']}」，去我的权益里查看")


@bp.get("/my/redemptions")
@require_login()
def my_redemptions(user):
    rows = query(
        """SELECT r.*, w.name, w.emoji, w.intro
             FROM redemptions r JOIN rewards w ON w.id = r.reward_id
            WHERE r.user_id = ? ORDER BY r.id DESC""",
        (user["id"],),
    )
    return ok({"items": [dict(r) for r in rows]})


@bp.post("/reviews")
@require_login("student")
def add_review(user):
    body = request.get_json(force=True) or {}
    order_id = int(body.get("order_id") or 0)
    rating = int(body.get("rating") or 5)
    text = (body.get("text") or "").strip()[:200]
    order = query_one("SELECT * FROM orders WHERE id = ? AND user_id = ?", (order_id, user["id"]))
    if not order:
        return fail("订单不存在", 404)
    if order["status"] != "done":
        return fail("取餐完成后才能评价")
    if query_one("SELECT id FROM reviews WHERE order_id = ?", (order_id,)):
        return fail("这笔订单已经评价过了")
    execute(
        """INSERT INTO reviews (order_id, box_id, user_id, rating, text, created_at)
           VALUES (?,?,?,?,?, datetime('now','localtime'))""",
        (order_id, order["box_id"], user["id"], rating, text),
    )
    return ok({}, message="评价已提交")


@bp.get("/my/summary")
@require_login("student")
def summary(user):
    booked = query_one(
        "SELECT COUNT(*) c FROM orders WHERE user_id = ? AND status = 'booked'", (user["id"],)
    )["c"]
    done = query_one(
        "SELECT COUNT(*) c FROM orders WHERE user_id = ? AND status = 'done'", (user["id"],)
    )["c"]
    carbon = query_one(
        "SELECT COALESCE(SUM(carbon_g),0) g FROM orders WHERE user_id = ? AND status = 'done'",
        (user["id"],),
    )["g"]
    return ok({"booked": booked, "done": done, "carbon_g": carbon, "level": level_of(user["points_all"])})
