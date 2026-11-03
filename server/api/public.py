"""公开接口：校区、分类树、盲盒、帮助中心、评价。"""

from __future__ import annotations

from flask import Blueprint, request

from ..common import ok, fail
from ..db import query, query_one

bp = Blueprint("public", __name__, url_prefix="/api")


def box_row_to_json(row, with_canteen: bool = True) -> dict:
    item = dict(row)
    item["price_yuan"] = f"{row['price'] / 100:.2f}"
    item["original_price_yuan"] = f"{row['original_price'] / 100:.2f}"
    item["sold"] = max(0, row["total"] - row["remain"])
    item["discount"] = round(row["price"] / row["original_price"] * 10, 1) if row["original_price"] else 10
    item["percent_left"] = round(row["remain"] / row["total"] * 100) if row["total"] else 0
    item["status_text"] = {
        "draft": "未上架",
        "active": "在售",
        "soldout": "已售罄",
        "offline": "已下架",
    }[row["status"]]
    if with_canteen:
        item["canteen"] = row["canteen_name"]
        item["campus"] = row["campus"]
        item["window"] = row["window"]
    return item


BOX_SQL = """
    SELECT b.*, c.name AS canteen_name, c.campus, c.window,
           cat.name AS category_name, p.name AS parent_category_name
      FROM boxes b
      JOIN canteens c ON c.id = b.canteen_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      LEFT JOIN categories p ON p.id = cat.parent_id
"""


@bp.get("/meta")
def meta():
    campuses = [dict(r) for r in query("SELECT * FROM campuses ORDER BY sort")]
    return ok({"campuses": campuses})


@bp.get("/categories")
def categories():
    rows = query("SELECT * FROM categories ORDER BY sort, id")
    nodes = {r["id"]: {**dict(r), "children": [], "count": 0} for r in rows}
    counts = query(
        """SELECT p.id AS top_id, c.id AS sub_id,
                  (SELECT COUNT(*) FROM boxes b WHERE b.category_id = c.id) AS c
             FROM categories c LEFT JOIN categories p ON p.id = c.parent_id"""
    )
    for c in counts:
        if c["sub_id"] in nodes:
            nodes[c["sub_id"]]["count"] = c["c"]
    roots = []
    for node in nodes.values():
        if node["parent_id"] and node["parent_id"] in nodes:
            nodes[node["parent_id"]]["children"].append(node)
        else:
            roots.append(node)
    return ok({"tree": roots})


@bp.get("/canteens")
def canteens():
    return ok(
        {
            "canteens": [
                dict(r) for r in query("SELECT * FROM canteens ORDER BY campus, id")
            ]
        }
    )


@bp.get("/boxes")
def boxes():
    args = request.args
    where, params = ["b.status IN ('active','soldout')"], []
    if args.get("campus"):
        where.append("c.campus = ?")
        params.append(args["campus"])
    if args.get("top"):
        where.append("p.name = ?")
        params.append(args["top"])
    if args.get("sub"):
        where.append("cat.name = ?")
        params.append(args["sub"])
    if args.get("keyword"):
        where.append("(b.title LIKE ? OR b.subtitle LIKE ? OR c.name LIKE ?)")
        kw = f"%{args['keyword']}%"
        params += [kw, kw, kw]
    if args.get("only_available") == "1":
        where.append("b.status = 'active' AND b.remain > 0")
    sort = {
        "price": "b.price ASC",
        "left": "b.remain DESC",
        "new": "b.id DESC",
    }.get(args.get("sort", ""), "CASE WHEN b.remain > 0 THEN 0 ELSE 1 END, b.id ASC")
    sql = BOX_SQL + " WHERE " + " AND ".join(where) + " ORDER BY " + sort
    rows = query(sql, params)
    return ok({"boxes": [box_row_to_json(r) for r in rows]})


@bp.get("/boxes/<int:box_id>")
def box_detail(box_id: int):
    row = query_one(BOX_SQL + " WHERE b.id = ?", (box_id,))
    if not row:
        return fail("盲盒不存在", 404)
    data = box_row_to_json(row)
    data["canteen_intro"] = query_one(
        "SELECT intro FROM canteens WHERE id = ?", (row["canteen_id"],)
    )["intro"]
    data["dishes"] = [
        dict(r)
        for r in query(
            """SELECT d.name, d.emoji FROM dishes d
                WHERE d.canteen_id = ? AND (d.category_id = ? OR d.category_id IN
                      (SELECT id FROM categories WHERE parent_id =
                         (SELECT parent_id FROM categories WHERE id = ?)))
                ORDER BY d.id LIMIT 8""",
            (row["canteen_id"], row["category_id"] or 0, row["category_id"] or 0),
        )
    ]
    data["category_path"] = f"{row['parent_category_name'] or ''} / {row['category_name'] or ''}".strip(" /")
    data["reviews"] = [
        dict(r)
        for r in query(
            """SELECT r.rating, r.text, r.created_at, u.name, u.campus
                 FROM reviews r JOIN users u ON u.id = r.user_id
                WHERE r.box_id = ? ORDER BY r.created_at DESC LIMIT 6""",
            (box_id,),
        )
    ]
    agg = query_one(
        "SELECT COUNT(*) c, AVG(rating) a FROM reviews WHERE box_id = ?", (box_id,)
    )
    data["review_count"] = agg["c"]
    data["rating"] = round(agg["a"], 1) if agg["a"] else None
    return ok(data)


@bp.get("/faqs")
def faqs():
    rows = query("SELECT * FROM faqs ORDER BY sort, id")
    groups: dict[str, list] = {}
    for r in rows:
        groups.setdefault(r["group_name"], []).append(
            {"id": r["id"], "q": r["question"], "a": r["answer"]}
        )
    return ok({"groups": [{"name": k, "items": v} for k, v in groups.items()]})
