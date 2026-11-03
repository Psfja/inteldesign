# 食光机 · 校园余量餐食盲盒

> 交互设计课程 · 课后作业一
> 一份**能真的点、真的下单、真的核销**的 Web + App 双端原型（前端 + 后端 + SQLite 数据库）。

闭餐前一小时，食堂档口把当日没卖完的热菜打包成盲盒，半价左右带走。
学生省下一顿饭钱，这些食物不用进泔水桶，省下的碳排折算成**碳积分**记在个人账户里。

---

## 一、三个入口

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 项目首页 | `/` | 产品说明、页面清单、作业要求对照表 |
| **Web 版（学生端）** | `/web` | 桌面网站，5 个页面 |
| **App 版（手机端）** | `/app` | 手机原型（带手机外壳），7 个页面 |
| Web 版（商家后台） | `/admin` | 档口工作台，6 个页面 |

演示账号：

- 学生 `18800000001`（林小满，已有订单与碳积分）；学生端输入任意 11 位手机号会自动注册
- 商家 `13900000001`（一食堂 · 蒸味档）

## 二、跑起来

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/seed.py --reset   # 建库 + 写入演示数据
.venv/bin/python app.py                    # http://localhost:5000
```

无构建步骤：后端是 Python + Flask，数据库用 Python 自带的 `sqlite3`，前端是原生 ES Module + 手写 CSS。

## 三、页面清单（共 18 页）

**Web 学生端（5）** 首页 · 盲盒广场 · 盲盒详情 · 我的订单 · 碳账户
**App 手机端（7）** 登录 · 首页 · 盲盒详情 · 预订确认 · 我的订单 · 碳账户 · 我的
**商家后台（6）** 登录 · 经营概览 · 盲盒管理 · 新建盲盒 · 订单核销 · 分类与菜品 · 顾客与碳积分

## 四、两个基本功能（完整闭环）

1. **预订 → 核销**：学生浏览盲盒 → 选份数下单 → 库存实时扣减 → 生成 6 位核销码
   → 商家后台输入核销码验证 → 订单置为已核销 → 碳积分与减碳量到账。
2. **碳积分账户**：累计积分 / 等级成长树 / 积分流水 / 校内减碳排行榜 / 积分兑换权益。

## 五、原型交互要素 → 实现位置

| 作业要求 | 落点 | 代码 |
| --- | --- | --- |
| 动态面板 | 详情三态切换、后台看板 日/周/月、新建盲盒三步向导、订单与碳账户 Tab | `static/js/core.js → class Panel` |
| 母版 | 三端顶栏、手机底部标签栏、后台侧边导航、盲盒卡片、核销码卡片、Toast、Modal、空状态 | `Master.define() / Master.render()` |
| 展开折叠节点 | 广场餐段树、后台分类树（可增删改）、后台侧栏二级菜单、帮助中心手风琴 | `bindTree() / bindAccordion()` |
| 导航 | Web 顶部导航与校区切换、App 底部 4 Tab 与返回栈、后台侧栏与面包屑 | 各端 `render()` 路由 |
| 两个基本功能 | 见上一节 | `server/api/student.py`、`server/api/admin.py` |

## 六、目录结构

```
app.py                  启动入口
server/                 后端（Flask）
  api/public.py         校区、分类树、盲盒、帮助中心
  api/student.py        下单、订单、碳积分、兑换、评价
  api/admin.py          看板、盲盒管理、核销、分类树、顾客
  common.py             登录态、碳积分等级、响应格式
  db.py                 连接与自动建库
db/schema.sql           表结构
scripts/seed.py         演示数据
static/css/             tokens / base / web / app / admin
static/js/core.js       模板、路由、动态面板、母版、树、手风琴、Toast、图表
static/js/web.js        Web 学生端页面
static/js/app.js        App 手机端页面
static/js/admin.js      商家后台页面
templates/              4 个页面骨架
docs/                   需求说明、原型说明、数据库设计
```

## 七、文档

- [docs/01-产品需求说明.md](docs/01-产品需求说明.md) — 目标用户、痛点、功能清单、信息架构
- [docs/02-原型说明与交互标注.md](docs/02-原型说明与交互标注.md) — 逐页交互说明与 Axure 概念对照
- [docs/03-数据库设计.md](docs/03-数据库设计.md) — 表结构与字段含义
- [docs/design/frontend-design-SKILL.md](docs/design/frontend-design-SKILL.md) — 本次前端设计所依据的 skill

> 数据均为 `scripts/seed.py` 生成的演示数据，不含真实支付。
