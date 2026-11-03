"""管理后台接口：数据看板、盲盒管理、订单核销、分类树、顾客与碳积分。"""

from __future__ import annotations

from datetime import datetime, timedelta

from flask import Blueprint, request

from ..common import fail, ok, require_login
from ..db import execute, get_db, query, query_one

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def scope(user):
    """商家只看自己档口的数据，平台运营看全量。
    返回一个可直接拼进 WHERE 的条件（不含 AND），配套参数单独给出。"""
    if user["role"] == "merchant" and user["canteen_id"]:
        return "c.id = ?", [user["canteen_id"]]
    return "1 = 1", []


def box_scope_where(user):
    if user["role"] == "merchant" and user["canteen_id"]:
        return "b.canteen_id = ?", [user["canteen_id"]]
    return "1 = 1", []


# ---------------------------------------------------------------- 数据看板
@bp.get("/overview")
@require_login("merchant")
def overview(user):
    range_key = request.args.get("range") or "day"
    s_sql, s_args = scope(user)
    now = datetime.now()

    if range_key == "week":
        buckets = [(now - timedelta(weeks=i)) for i in range(4, -1, -1)]
        key_of = lambda d: d.strftime("%Y-%W")
        labels = [d.strftime("%m/%d") + " 周" for d in buckets]
    elif range_key == "month":
        buckets = [(now - timedelta(days=30 * i)) for i in range(5, -1, -1)]
        key_of = lambda d: d.strftime("%Y-%m")
        labels = [d.strftime("%Y/%m") for d in buckets]
    else:
        buckets = [(now - timedelta(days=i)) for i in range(6, -1, -1)]
        key_of = lambda d: d.strftime("%Y-%m-%d")
        labels = [d.strftime("%m/%d") for d in buckets]

    start = buckets[0].strftime("%Y-%m-%d 00:00:00")
    rows = query(
        f"""SELECT o.created_at, o.qty, o.amount, o.carbon_g, o.status
              FROM orders o JOIN boxes b ON b.id = o.box_id
              JOIN canteens c ON c.id = b.canteen_id
             WHERE o.created_at >= ? AND {s_sql}""",
        [start] + s_args,
    )
    series = {key_of(d): {"orders": 0, "qty": 0, "amount": 0, "carbon_g": 0} for d in buckets}
    for r in rows:
        try:
            d = datetime.strptime(r["created_at"], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        k = key_of(d)
        if k in series and r["status"] in ("booked", "done"):
            series[k]["orders"] += 1
            series[k]["qty"] += r["qty"]
            series[k]["amount"] += r["amount"]
        if k in series and r["status"] == "done":
            series[k]["carbon_g"] += r["carbon_g"]

    total_qty = sum(v["qty"] for v in series.values())
    total_amount = sum(v["amount"] for v in series.values())
    total_carbon = sum(v["carbon_g"] for v in series.values())
    order_count = sum(v["orders"] for v in series.values())

    where, w_args = box_scope_where(user)
    stock = query_one(
        f"""SELECT COALESCE(SUM(total),0) t, COALESCE(SUM(remain),0) r, COUNT(*) n
              FROM boxes b WHERE {where}""",
        w_args,
    )
    sold_all = query_one(
        f"""SELECT COUNT(*) c FROM orders o JOIN boxes b ON b.id = o.box_id
             WHERE o.status IN ('booked','done') AND {where}""",
        w_args,
    )["c"]

    return ok(
        {
            "range": range_key,
            "labels": labels,
            "series": {
                "orders": [series[key_of(d)]["orders"] for d in buckets],
                "qty": [series[key_of(d)]["qty"] for d in buckets],
                "amount": [round(series[key_of(d)]["amount"] / 100, 2) for d in buckets],
                "carbon": [round(series[key_of(d)]["carbon_g"] / 1000, 2) for d in buckets],
            },
            "kpi": {
                "orders": order_count,
                "qty": total_qty,
                "amount_yuan": round(total_amount / 100, 2),
                "carbon_kg": round(total_carbon / 1000, 2),
                "sell_through": round((stock["t"] - stock["r"]) / stock["t"] * 100) if stock["t"] else 0,
                "avg_price": round(total_amount / total_qty / 100, 1) if total_qty else 0,
                "box_count": stock["n"],
                "remain": stock["r"],
                "sold_all": sold_all,
            },
            "top_boxes": [
                dict(r)
                for r in query(
                    f"""SELECT b.id, b.title, b.cover_emoji, SUM(o.qty) sold,
                               SUM(o.amount) amount, SUM(o.carbon_g) carbon_g
                          FROM orders o JOIN boxes b ON b.id = o.box_id
                         WHERE o.status IN ('booked','done') AND {where}
                         GROUP BY b.id ORDER BY sold DESC LIMIT 5""",
                    w_args,
                )
            ],
            "recent_verify": [
                dict(r)
                for r in query(
                    f"""SELECT o.order_no, o.verified_at, o.qty, b.title, u.name
                          FROM orders o JOIN boxes b ON b.id = o.box_id
                          JOIN users u ON u.id = o.user_id
                          JOIN canteens c ON c.id = b.canteen_id
                         WHERE o.status = 'done' AND {s_sql}
                         ORDER BY o.verified_at DESC LIMIT 6""",
                    s_args,
                )
            ],
        }
    )


# ---------------------------------------------------------------- 盲盒管理
ADMIN_BOX_SQL = """
    SELECT b.*, c.name AS canteen_name, c.campus,
           cat.name AS category_name, p.name AS parent_category_name
      FROM boxes b
      JOIN canteens c ON c.id = b.canteen_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      LEFT JOIN categories p ON p.id = cat.parent_id
"""


@bp.get("/boxes")
@require_login("merchant")
def admin_boxes(user):
    where, args = box_scope_where(user)
    keyword = request.args.get("keyword", "").strip()
    status = request.args.get("status", "")
    if keyword:
        where += " AND (b.title LIKE ? OR c.name LIKE ?)"
        args += [f"%{keyword}%", f"%{keyword}%"]
    if status:
        where += " AND b.status = ?"
        args.append(status)
    rows = query(ADMIN_BOX_SQL + f" WHERE {where} ORDER BY b.status, b.id DESC", args)
    items = []
    for r in rows:
        d = dict(r)
        d["price_yuan"] = f"{r['price'] / 100:.2f}"
        d["original_price_yuan"] = f"{r['original_price'] / 100:.2f}"
        d["sold"] = max(0, r["total"] - r["remain"])
        d["status_text"] = {
            "draft": "未上架",
            "active": "在售",
            "soldout": "已售罄",
            "offline": "已下架",
        }[r["status"]]
        d["category_path"] = f"{r['parent_category_name'] or ''}/{r['category_name'] or ''}".strip("/")
        items.append(d)
    return ok({"boxes": items})


@bp.post("/boxes")
@require_login("merchant")
def create_box(user):
    b = request.get_json(force=True) or {}
    canteen_id = int(b.get("canteen_id") or (user["canteen_id"] or 1))
    title = (b.get("title") or "").strip()
    if not title:
        return fail("请填写盲盒名称")
    price = int(b.get("price") or 0)
    original = int(b.get("original_price") or 0)
    total = int(b.get("total") or 0)
    if price <= 0 or original <= price or total <= 0:
        return fail("请检查价格与份数：原价需高于盲盒价，份数需大于 0")
    cur = execute(
        """INSERT INTO boxes (canteen_id, category_id, title, subtitle, cover_emoji, price,
                              original_price, total, remain, pickup_start, pickup_end,
                              carbon_g, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'))""",
        (
            canteen_id,
            int(b.get("category_id") or 0) or None,
            title,
            (b.get("subtitle") or "").strip(),
            b.get("cover_emoji") or "🍱",
            price,
            original,
            total,
            total,
            b.get("pickup_start") or "12:30",
            b.get("pickup_end") or "13:30",
            int(b.get("carbon_g") or 500),
            b.get("status") or "active",
        ),
    )
    return ok({"id": cur.lastrowid}, message="盲盒已创建")


@bp.put("/boxes/<int:box_id>")
@require_login("merchant")
def update_box(user, box_id: int):
    b = request.get_json(force=True) or {}
    box = query_one("SELECT * FROM boxes WHERE id = ?", (box_id,))
    if not box:
        return fail("盲盒不存在", 404)
    fields = {k: b[k] for k in
              ("title", "subtitle", "cover_emoji", "price", "original_price", "total",
               "pickup_start", "pickup_end", "carbon_g", "category_id", "status") if k in b}
    if not fields:
        return fail("没有需要更新的字段")
    if "total" in fields:
        delta = int(fields["total"]) - box["total"]
        fields["remain"] = max(0, box["remain"] + delta)
    sets = ", ".join(f"{k} = ?" for k in fields)
    execute(f"UPDATE boxes SET {sets} WHERE id = ?", list(fields.values()) + [box_id])
    return ok({}, message="已保存")


@bp.post("/boxes/<int:box_id>/status")
@require_login("merchant")
def set_box_status(user, box_id: int):
    b = request.get_json(force=True) or {}
    status = b.get("status")
    if status not in ("draft", "active", "soldout", "offline"):
        return fail("状态不合法")
    execute("UPDATE boxes SET status = ? WHERE id = ?", (status, box_id))
    return ok({}, message="状态已更新")


# ---------------------------------------------------------------- 订单核销
@bp.get("/orders")
@require_login("merchant")
def admin_orders(user):
    s_sql, s_args = scope(user)
    status = request.args.get("status") or "all"
    q = request.args.get("q", "").strip()
    where = [s_sql]
    args = list(s_args)
    if status != "all":
        where.append("o.status = ?")
        args.append(status)
    if q:
        where.append("(o.order_no LIKE ? OR o.pickup_code LIKE ? OR u.name LIKE ? OR b.title LIKE ?)")
        args += [f"%{q}%"] * 4
    rows = query(
        f"""SELECT o.*, b.title, b.cover_emoji, c.name AS canteen_name, c.window,
                   u.name AS user_name, u.phone, u.campus
              FROM orders o
              JOIN boxes b ON b.id = o.box_id
              JOIN canteens c ON c.id = b.canteen_id
              JOIN users u ON u.id = o.user_id
             WHERE {' AND '.join(where)} ORDER BY o.id DESC LIMIT 100""",
        args,
    )
    items = [dict(r) for r in rows]
    for it in items:
        it["amount_yuan"] = f"{it['amount'] / 100:.2f}"
        it["status_text"] = {"booked": "待取餐", "done": "已核销", "cancelled": "已取消"}[it["status"]]
    counts = {}
    c_rows = query(
        f"""SELECT o.status, COUNT(*) c FROM orders o
              JOIN boxes b ON b.id = o.box_id JOIN canteens c ON c.id = b.canteen_id
             WHERE {s_sql} GROUP BY o.status""",
        s_args,
    )
    for r in c_rows:
        counts[r["status"]] = r["c"]
    counts["all"] = sum(counts.values())
    return ok({"orders": items, "counts": counts})


@bp.post("/verify")
@require_login("merchant")
def verify(user):
    b = request.get_json(force=True) or {}
    code = (b.get("code") or "").strip()
    if len(code) != 6 or not code.isdigit():
        return fail("请输入 6 位数字核销码")
    s_sql, s_args = scope(user)
    row = query_one(
        f"""SELECT o.*, b.title, b.cover_emoji, b.canteen_id, c.name AS canteen_name,
                   u.name AS user_name
              FROM orders o
              JOIN boxes b ON b.id = o.box_id
              JOIN canteens c ON c.id = b.canteen_id
              JOIN users u ON u.id = o.user_id
             WHERE o.pickup_code = ? AND {s_sql}""",
        [code] + s_args,
    )
    if not row:
        return fail("核销码无效，或不属于当前档口")
    if row["status"] == "done":
        return fail(f"这笔订单已于 {row['verified_at']} 核销过")
    if row["status"] == "cancelled":
        return fail("这笔订单已取消，无法核销")
    db = get_db()
    db.execute(
        "UPDATE orders SET status = 'done', verified_at = datetime('now','localtime') WHERE id = ?",
        (row["id"],),
    )
    db.execute(
        "UPDATE users SET points = points + ?, points_all = points_all + ? WHERE id = ?",
        (row["points"], row["points"], row["user_id"]),
    )
    db.execute(
        """INSERT INTO carbon_logs (user_id, order_id, delta, reason, created_at)
           VALUES (?,?,?,?, datetime('now','localtime'))""",
        (row["user_id"], row["id"], row["points"], f"取餐完成 · {row['title']}"),
    )
    db.commit()
    return ok(
        {
            "order": {
                "order_no": row["order_no"],
                "title": row["title"],
                "cover_emoji": row["cover_emoji"],
                "user_name": row["user_name"],
                "canteen_name": row["canteen_name"],
                "qty": row["qty"],
                "points": row["points"],
                "carbon_g": row["carbon_g"],
            }
        },
        message=f"核销成功，{row['user_name']} 获得 {row['points']} 碳积分",
    )


# ---------------------------------------------------------------- 分类树
@bp.get("/categories")
@require_login("merchant")
def admin_categories(user):
    rows = query(
        """SELECT c.*, (SELECT COUNT(*) FROM boxes b WHERE b.category_id = c.id) AS box_count
             FROM categories c ORDER BY c.sort, c.id"""
    )
    nodes = {r["id"]: dict(r) for r in rows}
    for n in nodes.values():
        n["children"] = []
    roots = []
    for n in nodes.values():
        if n["parent_id"] and n["parent_id"] in nodes:
            nodes[n["parent_id"]]["children"].append(n)
        else:
            roots.append(n)
    return ok({"tree": roots, "flat": [dict(r) for r in rows]})


@bp.post("/categories")
@require_login("merchant")
def create_category(user):
    b = request.get_json(force=True) or {}
    name = (b.get("name") or "").strip()
    if not name:
        return fail("请填写分类名称")
    parent = b.get("parent_id") or None
    if parent and query_one("SELECT id FROM categories WHERE id = ?", (parent,)) is None:
        return fail("父级分类不存在")
    cur = execute(
        "INSERT INTO categories (parent_id, name, sort) VALUES (?,?,?)",
        (parent, name, int(b.get("sort") or 0)),
    )
    return ok({"id": cur.lastrowid}, message="分类已创建")


@bp.put("/categories/<int:cat_id>")
@require_login("merchant")
def update_category(user, cat_id: int):
    b = request.get_json(force=True) or {}
    name = (b.get("name") or "").strip()
    if not name:
        return fail("请填写分类名称")
    execute("UPDATE categories SET name = ? WHERE id = ?", (name, cat_id))
    return ok({}, message="已保存")


@bp.delete("/categories/<int:cat_id>")
@require_login("merchant")
def delete_category(user, cat_id: int):
    row = query_one("SELECT * FROM categories WHERE id = ?", (cat_id,))
    if not row:
        return fail("分类不存在", 404)
    if row["parent_id"] is None:
        return fail("请先删除该餐段下的子分类")
    execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    return ok({}, message="已删除")


# ---------------------------------------------------------------- 顾客与碳积分
@bp.get("/customers")
@require_login("merchant")
def customers(user):
    rows = query(
        """SELECT u.id, u.name, u.campus, u.phone, u.points, u.points_all,
                  COUNT(o.id) AS orders, COALESCE(SUM(o.carbon_g),0) AS carbon_g
             FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'done'
            WHERE u.role = 'student'
            GROUP BY u.id ORDER BY u.points_all DESC LIMIT 50"""
    )
    agg = query_one(
        """SELECT (SELECT COUNT(*) FROM users WHERE role = 'student') AS users,
                  (SELECT COALESCE(SUM(points_all), 0) FROM users WHERE role = 'student') AS points,
                  (SELECT COALESCE(SUM(carbon_g), 0) FROM orders WHERE status = 'done') AS carbon_g"""
    )
    return ok({"customers": [dict(r) for r in rows], "agg": dict(agg)})


# ---------------------------------------------------------------- 档口列表（下拉用）
@bp.get("/canteens")
@require_login("merchant")
def admin_canteens(user):
    if user["role"] == "merchant" and user["canteen_id"]:
        rows = query("SELECT * FROM canteens WHERE id = ?", (user["canteen_id"],))
    else:
        rows = query("SELECT * FROM canteens ORDER BY campus, id")
    return ok({"canteens": [dict(r) for r in rows]})


# ---------------------------------------------------------------- 帮助中心内容（后台复用）
@bp.get("/faq-groups")
@require_login("merchant")
def faq_groups(user):
    rows = query("SELECT group_name, COUNT(*) c FROM faqs GROUP BY group_name")
    return ok({"groups": [dict(r) for r in rows]})
