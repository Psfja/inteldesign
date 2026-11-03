-- 食光机 · 数据库结构（SQLite）
-- 金额统一以「分」为单位存整数，避免浮点误差
PRAGMA foreign_keys = ON;

-- 校区
CREATE TABLE IF NOT EXISTS campuses (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,
  sort    INTEGER NOT NULL DEFAULT 0
);

-- 用户：学生（App / Web 学生端）与食堂商家（Web 管理后台）
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('student', 'merchant')),
  campus     TEXT NOT NULL DEFAULT '',
  points     INTEGER NOT NULL DEFAULT 0,        -- 当前可用碳积分
  points_all INTEGER NOT NULL DEFAULT 0,        -- 累计获得碳积分
  canteen_id INTEGER REFERENCES canteens (id),  -- 商家所属档口
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 食堂档口（商家主体）
CREATE TABLE IF NOT EXISTS canteens (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  campus  TEXT NOT NULL,
  window  TEXT NOT NULL DEFAULT '',             -- 档口编号/位置
  intro   TEXT NOT NULL DEFAULT ''
);

-- 菜品分类（树形结构，parent_id 为 NULL 表示一级节点）
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id  INTEGER REFERENCES categories (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0
);

-- 菜品
CREATE TABLE IF NOT EXISTS dishes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  canteen_id  INTEGER NOT NULL REFERENCES canteens (id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🍚'
);

-- 盲盒（余量餐食）
CREATE TABLE IF NOT EXISTS boxes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  canteen_id     INTEGER NOT NULL REFERENCES canteens (id) ON DELETE CASCADE,
  category_id    INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  subtitle       TEXT NOT NULL DEFAULT '',
  cover_emoji    TEXT NOT NULL DEFAULT '🍱',
  price          INTEGER NOT NULL,              -- 盲盒价（分）
  original_price INTEGER NOT NULL,              -- 原价（分）
  total          INTEGER NOT NULL,              -- 总份数
  remain         INTEGER NOT NULL,              -- 剩余份数
  pickup_start   TEXT NOT NULL,                 -- 取餐开始 HH:MM
  pickup_end     TEXT NOT NULL,                 -- 取餐结束 HH:MM
  carbon_g       INTEGER NOT NULL DEFAULT 500,  -- 每份预计减碳（克）
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'soldout', 'offline')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 订单
CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no    TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  box_id      INTEGER NOT NULL REFERENCES boxes (id),
  qty         INTEGER NOT NULL DEFAULT 1,
  amount      INTEGER NOT NULL,                 -- 实付（分）
  status      TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'done', 'cancelled')),
  pickup_code TEXT NOT NULL,                    -- 6 位核销码
  carbon_g    INTEGER NOT NULL DEFAULT 0,
  points      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  verified_at TEXT
);

-- 碳积分流水
CREATE TABLE IF NOT EXISTS carbon_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  order_id   INTEGER REFERENCES orders (id) ON DELETE SET NULL,
  delta      INTEGER NOT NULL,                  -- 正为获得，负为兑换消耗
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 积分兑换权益
CREATE TABLE IF NOT EXISTS rewards (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  emoji   TEXT NOT NULL DEFAULT '🎁',
  points  INTEGER NOT NULL,
  stock   INTEGER NOT NULL DEFAULT 0,
  intro   TEXT NOT NULL DEFAULT ''
);

-- 兑换记录
CREATE TABLE IF NOT EXISTS redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reward_id  INTEGER NOT NULL REFERENCES rewards (id),
  points     INTEGER NOT NULL,
  code       TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 评价
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  box_id     INTEGER NOT NULL REFERENCES boxes (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 帮助中心（分组 + 手风琴展开折叠）
CREATE TABLE IF NOT EXISTS faqs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,
  question TEXT NOT NULL,
  answer   TEXT NOT NULL,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orders_user  ON orders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_box   ON orders (box_id);
CREATE INDEX IF NOT EXISTS idx_boxes_status ON boxes (status, canteen_id);
CREATE INDEX IF NOT EXISTS idx_logs_user    ON carbon_logs (user_id, created_at);
