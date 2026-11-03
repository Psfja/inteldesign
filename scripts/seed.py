"""初始化数据库并写入演示数据。

用法：
    .venv/bin/python scripts/seed.py           # 若数据库不存在则建库并写入种子数据
    .venv/bin/python scripts/seed.py --reset   # 删掉旧库重建
"""

from __future__ import annotations

import os
import random
import sqlite3
import sys
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "foodbox.sqlite3")
SCHEMA_PATH = os.path.join(ROOT, "db", "schema.sql")

random.seed(20261103)


def fresh_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(open(SCHEMA_PATH, encoding="utf-8").read())
    return conn


def main(reset: bool = False) -> None:
    if os.path.exists(DB_PATH) and not reset:
        print(f"数据库已存在：{DB_PATH}（如需重建请加 --reset）")
        return

    conn = fresh_conn()
    cur = conn.cursor()

    # ---------- 校区 ----------
    campuses = ["中心校区", "东校区", "新校区"]
    for i, name in enumerate(campuses):
        cur.execute("INSERT INTO campuses (name, sort) VALUES (?, ?)", (name, i))

    # ---------- 档口 ----------
    canteens = [
        ("一食堂 · 蒸味档", "中心校区", "A 区 1-3 号窗", "现蒸现炒，家常口味，闭餐前一小时余量最多。"),
        ("一食堂 · 面工坊", "中心校区", "A 区 8-10 号窗", "手工拉面与汤面，每日现打面剂。"),
        ("二食堂 · 清真窗口", "东校区", "B 区 2 号窗", "牛羊肉套餐与拌面，独立操作间。"),
        ("三食堂 · 烧腊铺", "新校区", "C 区 6 号窗", "广式烧腊饭，下午常有余量。"),
        ("咖啡小站 · 西点柜", "新校区", "图书馆一层", "面包、三明治与当日现烤点心。"),
    ]
    for name, campus, window, intro in canteens:
        cur.execute(
            "INSERT INTO canteens (name, campus, window, intro) VALUES (?, ?, ?, ?)",
            (name, campus, window, intro),
        )

    # ---------- 分类树 ----------
    # 一级：餐段；二级：品类
    tree = {
        "早餐": ["主食", "汤粥", "点心"],
        "午餐": ["盖浇饭", "面食", "轻食"],
        "晚餐": ["盖浇饭", "面食", "小炒"],
        "夜宵": ["烤物", "甜品"],
    }
    cat_ids: dict[str, int] = {}
    for top_i, (top, subs) in enumerate(tree.items()):
        cur.execute("INSERT INTO categories (parent_id, name, sort) VALUES (NULL, ?, ?)", (top, top_i))
        top_id = cur.lastrowid
        for sub_i, sub in enumerate(subs):
            cur.execute(
                "INSERT INTO categories (parent_id, name, sort) VALUES (?, ?, ?)", (top_id, sub, sub_i)
            )
            cat_ids[f"{top}/{sub}"] = cur.lastrowid

    # ---------- 菜品 ----------
    dishes = [
        (1, "早餐/主食", "鲜肉大包", "🥟"),
        (1, "早餐/汤粥", "南瓜小米粥", "🥣"),
        (1, "早餐/点心", "流沙包", "🥐"),
        (1, "午餐/盖浇饭", "土豆牛腩饭", "🍛"),
        (1, "午餐/盖浇饭", "番茄鸡蛋饭", "🍅"),
        (1, "晚餐/小炒", "青椒肉丝", "🫑"),
        (2, "午餐/面食", "牛肉拉面", "🍜"),
        (2, "晚餐/面食", "番茄鸡蛋面", "🍲"),
        (2, "早餐/汤粥", "豆浆", "🥛"),
        (3, "午餐/盖浇饭", "大盘鸡拌面", "🍗"),
        (3, "晚餐/小炒", "孜然羊肉", "🥩"),
        (4, "午餐/盖浇饭", "蜜汁叉烧饭", "🍖"),
        (4, "晚餐/盖浇饭", "烧鸭饭", "🦆"),
        (5, "早餐/点心", "可颂", "🥐"),
        (5, "夜宵/甜品", "草莓蛋糕切块", "🍰"),
        (5, "夜宵/烤物", "芝士焗红薯", "🍠"),
        (5, "午餐/轻食", "金枪鱼三明治", "🥪"),
    ]
    for canteen_id, cat, name, emoji in dishes:
        cur.execute(
            "INSERT INTO dishes (canteen_id, category_id, name, emoji) VALUES (?, ?, ?, ?)",
            (canteen_id, cat_ids[cat], name, emoji),
        )

    # ---------- 盲盒 ----------
    boxes = [
        # canteen, category, title, subtitle, emoji, price, original, total, remain,
        # start, end, carbon_g, status
        (1, "午餐/盖浇饭", "午市余量盲盒 · 两荤一素", "土豆牛腩 / 番茄鸡蛋 / 时令青菜随机组合", "🍛", 690, 1500, 40, 12, "12:30", "13:30", 620, "active"),
        (1, "晚餐/小炒", "晚市余量盲盒 · 一荤一素", "青椒肉丝 / 红烧豆腐 / 时令青菜", "🥘", 590, 1200, 30, 3, "18:30", "19:30", 560, "active"),
        (1, "早餐/主食", "早市面点盲盒", "鲜肉大包 2 个 + 豆浆 1 杯", "🥟", 450, 900, 25, 0, "07:30", "09:00", 380, "soldout"),
        (2, "午餐/面食", "面工坊 · 汤面盲盒", "牛肉拉面 / 番茄鸡蛋面二选一，赠卤蛋", "🍜", 780, 1600, 20, 7, "12:40", "13:40", 640, "active"),
        (2, "晚餐/面食", "收摊前 · 面食清仓盒", "当日剩余面食任意搭配，份量实在", "🍲", 480, 1400, 15, 11, "19:00", "20:00", 700, "active"),
        (3, "午餐/盖浇饭", "清真窗口 · 午市余量盒", "大盘鸡拌面 / 牛肉盖饭随机", "🍗", 880, 1800, 18, 5, "12:30", "13:30", 660, "active"),
        (3, "晚餐/小炒", "清真窗口 · 晚市余量盒", "孜然羊肉 / 土豆烧牛肉 + 米饭", "🥩", 990, 2000, 12, 2, "18:20", "19:20", 720, "active"),
        (4, "午餐/盖浇饭", "烧腊铺 · 叉烧烧鸭双拼盒", "蜜汁叉烧 / 烧鸭饭，赠例汤", "🍖", 1280, 2600, 16, 9, "12:30", "13:30", 800, "active"),
        (4, "晚餐/盖浇饭", "烧腊铺 · 晚市清烧腊盒", "当日剩余烧腊，含米饭与青菜", "🦆", 1080, 2400, 10, 0, "18:30", "19:30", 780, "soldout"),
        (5, "夜宵/甜品", "西点柜 · 当日现烤甜品盒", "蛋糕切块 / 可颂 / 蛋挞随机 3 件", "🍰", 990, 2200, 20, 14, "20:30", "21:30", 420, "active"),
        (5, "夜宵/烤物", "夜宵档 · 暖胃烤物盒", "芝士焗红薯 / 烤玉米 / 烤肠随机", "🍠", 690, 1500, 24, 6, "21:00", "22:00", 460, "active"),
        (5, "午餐/轻食", "轻食三明治清仓盒", "金枪鱼 / 鸡胸三明治随机 1-2 份", "🥪", 590, 1300, 14, 4, "13:00", "14:00", 340, "active"),
        (2, "早餐/汤粥", "早市暖胃粥盒", "南瓜小米粥 / 豆浆随机搭配", "🥣", 390, 800, 30, 18, "07:30", "09:00", 320, "draft"),
        (3, "午餐/面食", "新窗口试运营 · 拌面盒", "新档口试运营，限量尝鲜价", "🍝", 660, 1400, 20, 20, "12:30", "13:30", 600, "offline"),
    ]
    for row in boxes:
        cur.execute(
            """INSERT INTO boxes
               (canteen_id, category_id, title, subtitle, cover_emoji, price, original_price,
                total, remain, pickup_start, pickup_end, carbon_g, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (row[0], cat_ids[row[1]], row[2], row[3], row[4], row[5], row[6], row[7], row[8],
             row[9], row[10], row[11], row[12]),
        )

    # ---------- 用户 ----------
    students = [
        ("18800000001", "林小满", "中心校区"),
        ("18800000002", "周野", "东校区"),
        ("18800000003", "阿依娜", "新校区"),
        ("18800000004", "陈树", "中心校区"),
        ("18800000005", "许知夏", "新校区"),
    ]
    for phone, name, campus in students:
        cur.execute(
            "INSERT INTO users (phone, name, role, campus) VALUES (?, ?, 'student', ?)",
            (phone, name, campus),
        )
    # 商家账号（运营一食堂 · 蒸味档）
    cur.execute(
        "INSERT INTO users (phone, name, role, campus, canteen_id) VALUES (?, ?, 'merchant', ?, ?)",
        ("13900000001", "一食堂 · 蒸味档", "中心校区", 1),
    )
    cur.execute(
        "INSERT INTO users (phone, name, role, campus, canteen_id) VALUES (?, ?, 'merchant', ?, ?)",
        ("13900000002", "平台运营", "中心校区", None),
    )

    # ---------- 历史订单（近 30 天，用于数据看板与碳账户） ----------
    box_rows = cur.execute(
        "SELECT id, price, carbon_g, total FROM boxes WHERE status IN ('active','soldout')"
    ).fetchall()
    now = datetime.now()
    order_seq = 0
    for days_ago in range(29, -1, -1):
        day = now - timedelta(days=days_ago)
        # 周末单量少一点，工作日多一点
        n = random.randint(3, 7) if day.weekday() < 5 else random.randint(2, 4)
        for _ in range(n):
            box = random.choice(box_rows)
            user_id = random.randint(1, 5)
            qty = random.choice([1, 1, 1, 2])
            created = day.replace(
                hour=random.randint(10, 20), minute=random.randint(0, 59), second=random.randint(0, 59)
            )
            # 7 天以前的订单基本都已完成；近期有部分待取餐 / 已取消
            if days_ago > 3:
                status = "done"
            else:
                status = random.choices(["done", "booked", "cancelled"], weights=[5, 4, 1])[0]
            order_seq += 1
            carbon_g = box["carbon_g"] * qty
            points = carbon_g // 10
            order_no = f"SG{created.strftime('%Y%m%d')}{order_seq:04d}"
            verified = (created + timedelta(minutes=random.randint(20, 90))).strftime(
                "%Y-%m-%d %H:%M:%S"
            ) if status == "done" else None
            cur.execute(
                """INSERT INTO orders (order_no, user_id, box_id, qty, amount, status,
                                       pickup_code, carbon_g, points, created_at, verified_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    order_no,
                    user_id,
                    box["id"],
                    qty,
                    box["price"] * qty,
                    status,
                    f"{random.randint(100000, 999999)}",
                    carbon_g,
                    points,
                    created.strftime("%Y-%m-%d %H:%M:%S"),
                    verified,
                ),
            )
            order_id = cur.lastrowid
            if status == "done":
                cur.execute(
                    """INSERT INTO carbon_logs (user_id, order_id, delta, reason, created_at)
                       VALUES (?,?,?,?,?)""",
                    (user_id, order_id, points, "取餐完成 · 减碳奖励", verified),
                )
                cur.execute(
                    "UPDATE users SET points = points + ?, points_all = points_all + ? WHERE id = ?",
                    (points, points, user_id),
                )
                # 部分订单带评价
                if random.random() < 0.45:
                    cur.execute(
                        """INSERT INTO reviews (order_id, box_id, user_id, rating, text, created_at)
                           VALUES (?,?,?,?,?,?)""",
                        (
                            order_id,
                            box["id"],
                            user_id,
                            random.choices([5, 4, 3], weights=[6, 3, 1])[0],
                            random.choice(
                                [
                                    "份量比想象中足，还热着，值。",
                                    "打包盒很严实，回宿舍一点没漏。",
                                    "随机到的菜挺合口味，下次还来。",
                                    "出餐很快，扫码直接拿走。",
                                    "比单点便宜一半，对钱包很友好。",
                                ]
                            ),
                            verified,
                        ),
                    )

    # 「我」的账号补两笔待取餐订单，保证首次登录就有内容
    me = 1
    for box_id in (1, 4):
        box = conn.execute("SELECT price, carbon_g FROM boxes WHERE id = ?", (box_id,)).fetchone()
        created = (now - timedelta(hours=random.randint(1, 6))).strftime("%Y-%m-%d %H:%M:%S")
        order_seq += 1
        cur.execute(
            """INSERT INTO orders (order_no, user_id, box_id, qty, amount, status,
                                   pickup_code, carbon_g, points, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                f"SG{datetime.now().strftime('%Y%m%d')}{order_seq:04d}",
                me,
                box_id,
                1,
                box["price"],
                "booked",
                f"{random.randint(100000, 999999)}",
                box["carbon_g"],
                box["carbon_g"] // 10,
                created,
            ),
        )

    # ---------- 兑换权益 ----------
    rewards = [
        ("食堂 5 元无门槛券", "🎟️", 300, 200, "任意档口可用，不与盲盒价叠加。"),
        ("现磨豆浆兑换券", "🥛", 180, 120, "一食堂面工坊早市兑换。"),
        ("限定版帆布餐袋", "👜", 900, 30, "自带餐袋，再减 20 克碳。"),
        ("校园文创 · 环保餐具套装", "🥢", 1500, 15, "含竹筷、勺与收纳盒。"),
        ("「光盘之星」电子勋章", "🏅", 600, 9999, "点亮个人主页，永久展示。"),
    ]
    for name, emoji, points, stock, intro in rewards:
        cur.execute(
            "INSERT INTO rewards (name, emoji, points, stock, intro) VALUES (?,?,?,?,?)",
            (name, emoji, points, stock, intro),
        )

    # ---------- 帮助中心 ----------
    faqs = [
        ("关于盲盒", "盲盒里到底是什么？", "每个盲盒都由档口在闭餐前把当日余量菜品打包，内容在标题里标注了品类范围（如「两荤一素」）。你拿到的是当日现做的完整一份正餐，不是临期食品。"),
        ("关于盲盒", "会不会拿到我不爱吃的？", "下单前可在详情页查看该档口的「常出现菜品」列表。若遇到过敏食材，请在取餐时告知窗口，可现场更换等价菜品。"),
        ("取餐", "怎么取餐？", "下单后订单里会生成 6 位核销码。在取餐时段内到对应档口，把核销码给工作人员扫码，或自己在订单页点「出示核销码」即可。"),
        ("取餐", "错过了取餐时间怎么办？", "取餐时段结束后订单自动失效，费用原路退回，碳积分不会扣除，但也不会产生本次减碳记录。建议开启取餐前 15 分钟提醒。"),
        ("碳积分", "碳积分怎么算？", "每份盲盒按避免浪费的食物重量估算减碳量，约每 10 克折算 1 积分，完成取餐后自动到账。"),
        ("碳积分", "积分有什么用？", "可在碳账户页兑换食堂代金券、餐具、文创等权益，兑换后立即生成使用码。"),
        ("账号", "如何切换校区？", "在首页顶部的校区切换器里选择。不同校区的档口与盲盒相互独立。"),
        ("账号", "可以给同学代取吗？", "可以。在订单页点「转赠」，把核销码分享给同学，对方出示同一核销码即可取餐。"),
    ]
    for i, (group_name, q, a) in enumerate(faqs):
        cur.execute(
            "INSERT INTO faqs (group_name, question, answer, sort) VALUES (?,?,?,?)",
            (group_name, q, a, i),
        )

    conn.commit()
    counts = {
        name: conn.execute(f"SELECT COUNT(*) c FROM {name}").fetchone()["c"]
        for name in ["campuses", "canteens", "categories", "dishes", "boxes", "users", "orders", "carbon_logs", "rewards", "faqs", "reviews"]
    }
    conn.close()
    print(f"已生成数据库：{DB_PATH}")
    print("数据量：" + "，".join(f"{k} {v}" for k, v in counts.items()))


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
