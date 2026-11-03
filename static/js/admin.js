/* 食光机 · 管理后台（Web 商家端）
   侧边导航母版（含可折叠分组）+ 顶栏母版；数据看板动态面板（日 / 周 / 月） */

import {
  Master, Panel, api, comboChart, confirmBox, el, empty, fmt, html, modal, qs, qsa, raw,
  toast, treeHTML, bindTree,
} from "./core.js";

const state = { user: null, route: "overview" };

const NAV = [
  { key: "overview", ico: "📊", label: "经营概览" },
  {
    key: "boxes", ico: "🥡", label: "盲盒管理",
    children: [
      { key: "boxes", ico: "▸", label: "盲盒列表" },
      { key: "boxes-new", ico: "▸", label: "新建盲盒" },
    ],
  },
  { key: "verify", ico: "✅", label: "订单核销" },
  { key: "categories", ico: "🗂️", label: "分类与菜品" },
  { key: "customers", ico: "🌱", label: "顾客与碳积分" },
];

/* ================================================================ 母版 */
Master.define("side", () => {
  const u = state.user;
  const open = state.route.startsWith("boxes") ? "boxes" : "";
  return html`
    <aside class="side">
      <div class="side-brand"><b>食光机</b><em>商家端</em></div>
      ${u
        ? html`<div class="side-user"><b>${u.name}</b><span>${u.campus} · 商家账号</span></div>`
        : ""}
      <nav class="side-nav">
        ${NAV.map((n) =>
          n.children
            ? html`<div class="side-group ${open === n.key ? "is-open" : ""}" data-group="${n.key}">
                <button class="side-link ${state.route.startsWith(n.key) ? "is-on" : ""}" data-go="${n.key}">
                  <span class="ico">${n.ico}</span><span>${n.label}</span>
                  <span class="side-caret">▶</span>
                </button>
                <div class="side-sub">
                  ${n.children.map(
                    (c) => html`<button class="side-link ${state.route === c.key ? "is-on" : ""}" data-go="${c.key}">
                      <span class="ico">${c.ico}</span><span>${c.label}</span></button>`
                  )}
                </div>
              </div>`
            : html`<button class="side-link ${state.route === n.key ? "is-on" : ""}" data-go="${n.key}">
                <span class="ico">${n.ico}</span><span>${n.label}</span></button>`
        )}
      </nav>
      <button class="side-fold" data-logout>退出登录</button>
    </aside>`;
});

Master.define("admin-topbar", (ctx) => html`
  <div class="topbar-admin">
    <div class="crumb">商家后台 / <b>${ctx.title}</b></div>
    <div class="right">
      <span class="muted">${ctx.hint || ""}</span>
      <span class="avatar" style="background:var(--moss)">${state.user?.name.slice(0, 1) || "·"}</span>
    </div>
  </div>`);

/* ================================================================ 页面：登录 */
function viewLogin() {
  return {
    html: html`
      <div class="admin-login">
        <div class="box">
          <h1>食光机 · 商家后台</h1>
          <p class="lead">用档口账号登录，管理盲盒、核销订单</p>
          <label class="field"><span>手机号</span><input class="input" data-phone value="13900000001" maxlength="11" /></label>
          <button class="btn btn-primary btn-block btn-lg" data-login>登录</button>
          <div class="demo-accounts">
            演示账号：<button data-fill>13900000001</button>（一食堂 · 蒸味档）
          </div>
        </div>
      </div>`,
    mount(root) {
      qs("[data-fill]", root).addEventListener("click", () =>
        (qs("[data-phone]", root).value = "13900000001")
      );
      qs("[data-login]", root).addEventListener("click", async () => {
        try {
          const r = await api.post("/api/auth/login", { phone: qs("[data-phone]", root).value.trim(), role: "merchant" });
          state.user = r.data.user;
          toast(`欢迎，${state.user.name}`, "is-good");
          location.hash = "#/overview";
          render();
        } catch (err) {
          toast(err.message, "is-bad");
        }
      });
    },
  };
}

/* ================================================================ 页面：经营概览 */
async function viewOverview() {
  const load = (r) => api.get(`/api/admin/overview?range=${r}`);
  const first = await load("day");
  const d = first.data;

  const kpis = (k) => html`
    <div class="kpis">
      <div class="kpi"><div class="label">订单数</div><b class="num">${k.orders}</b><div class="foot">含待取餐与已核销</div></div>
      <div class="kpi"><div class="label">售出份数</div><b class="num">${k.qty}</b><div class="foot">客单价 ¥${k.avg_price}</div></div>
      <div class="kpi is-carbon"><div class="label">减少食物碳排</div><b class="num">${k.carbon_kg}<span class="unit">kg</span></b><div class="foot">按避免浪费估算</div></div>
      <div class="kpi is-hi"><div class="label">余量售出率</div><b class="num">${k.sell_through}<span class="unit">%</span></b><div class="foot">在售 ${k.box_count} 个 · 余 ${k.remain} 份</div></div>
    </div>`;

  const body = (data) => html`
    ${raw(kpis(data.kpi))}
    <div class="two-col">
      <div class="panel-card">
        <header>
          <h3>售出与减碳趋势</h3>
          <div class="right">
            <div class="panel-tabs" data-range>
              <button data-goto="0" aria-selected="${data.range === "day" ? "true" : "false"}">按日</button>
              <button data-goto="1" aria-selected="${data.range === "week" ? "true" : "false"}">按周</button>
              <button data-goto="2" aria-selected="${data.range === "month" ? "true" : "false"}">按月</button>
            </div>
          </div>
        </header>
        <div data-panel data-mode="fade">
          <div data-state>${raw(chartOf(data))}</div>
          <div data-state>${raw(`<div class="empty" style="padding:60px 0">切到「按周」查看近 4 周趋势</div>`)}</div>
          <div data-state>${raw(`<div class="empty" style="padding:60px 0">切到「按月」查看近 6 个月趋势</div>`)}</div>
        </div>
      </div>
      <div class="panel-card">
        <header><h3>卖得最好的盲盒</h3></header>
        ${data.top_boxes.length
          ? raw(
              data.top_boxes
                .map(
                  (b, i) => html`<div class="rank-row">
                    <span class="rank-no">${i + 1}</span>
                    <span class="rank-name">${b.cover_emoji} ${b.title}</span>
                    <span class="rank-num">${b.sold}</span>
                  </div>`
                )
                .join("")
            )
          : raw(empty("🥡", "这个周期还没有订单"))}
      </div>
    </div>
    <div class="panel-card">
      <header><h3>最近核销</h3><span class="muted small">实时</span></header>
      <table class="table">
        <thead><tr><th>订单号</th><th>顾客</th><th>盲盒</th><th>份数</th><th>核销时间</th></tr></thead>
        <tbody>
          ${data.recent_verify.length
            ? raw(
                data.recent_verify
                  .map(
                    (o) => html`<tr>
                      <td class="mono tiny">${o.order_no}</td>
                      <td>${o.name}</td>
                      <td>${o.cover_emoji} ${o.title}</td>
                      <td class="num">${o.qty}</td>
                      <td class="muted small">${o.verified_at}</td>
                    </tr>`
                  )
                  .join("")
              )
            : raw(`<tr><td colspan="5">${empty("✅", "还没有核销记录")}</td></tr>`)}
        </tbody>
      </table>
    </div>`;

  return {
    html: html`
      <div class="page-head">
        <div><h1>经营概览</h1><p>余量餐食卖了多少、救下多少碳，一眼看完</p></div>
        <div class="actions"><button class="btn btn-primary" data-new-box>新建盲盒</button></div>
      </div>
      <div data-overview>${raw(body(d))}</div>`,
    mount(root) {
      const wrap = qs("[data-overview]", root);
      const tabs = ["day", "week", "month"];
      async function switchTo(i) {
        const data = (await load(tabs[i])).data;
        wrap.innerHTML = body(data);
        const p = new Panel(qs("[data-panel]", wrap));
        p.go(i);
        bindRange(wrap, p);
      }
      function bindRange(scope, panel) {
        qs("[data-range]", scope)?.addEventListener("click", (e) => {
          const b = e.target.closest("[data-goto]");
          if (!b) return;
          const i = Number(b.dataset.goto);
          if (i === panel.index) return;
          panel.go(i, b);
          switchTo(i);
        });
      }
      const panel = new Panel(qs("[data-panel]", wrap));
      panel.go(0);
      bindRange(wrap, panel);
      qs("[data-new-box]", root).addEventListener("click", () => (location.hash = "#/boxes-new"));
    },
  };
}

function chartOf(data) {
  return comboChart({
    labels: data.labels,
    bars: data.series.qty,
    line: data.series.carbon,
    barLabel: "售出份数",
    lineLabel: "减碳（千克）",
  });
}

/* ================================================================ 页面：盲盒管理 */
async function viewBoxes() {
  const r = await api.get("/api/admin/boxes");
  const boxes = r.data.boxes;

  const row = (b) => html`
    <tr data-row="${b.id}">
      <td>${b.cover_emoji}</td>
      <td><b>${b.title}</b><div class="muted tiny">${b.subtitle}</div></td>
      <td>${b.canteen_name}<div class="muted tiny">${b.campus}</div></td>
      <td>${b.category_path || "—"}</td>
      <td class="num">¥${b.price_yuan}<div class="muted tiny">原价 ${b.original_price_yuan}</div></td>
      <td class="num">${b.sold}/${b.total}<div class="muted tiny">余 ${b.remain}</div></td>
      <td>${b.pickup_start}–${b.pickup_end}</td>
      <td><span class="tag ${b.status === "active" ? "" : b.status === "soldout" ? "tag-out" : "tag-warn"}">${b.status_text}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" data-edit="${b.id}">编辑</button>
        <button class="btn ${b.status === "offline" || b.status === "draft" ? "btn-primary" : "btn-danger"} btn-sm" data-toggle="${b.id}" data-status="${b.status}">
          ${b.status === "active" || b.status === "soldout" ? "下架" : "上架"}
        </button>
      </td>
    </tr>`;

  return {
    html: html`
      <div class="page-head">
        <div><h1>盲盒管理</h1><p>共 ${boxes.length} 个盲盒，上下架与改价都在这里</p></div>
        <div class="actions"><button class="btn btn-primary" data-new>＋ 新建盲盒</button></div>
      </div>
      <div class="toolbar">
        <input class="input" data-kw placeholder="搜索盲盒名称或档口" style="min-width:220px" />
        <select class="select" data-status>
          <option value="">全部状态</option>
          <option value="active">在售</option>
          <option value="soldout">已售罄</option>
          <option value="draft">未上架</option>
          <option value="offline">已下架</option>
        </select>
        <span class="grow"></span>
        <span class="muted small" data-count></span>
      </div>
      <div class="tbl-wrap">
        <table class="table">
          <thead><tr>
            <th></th><th>盲盒</th><th>档口</th><th>分类</th><th>售价</th><th>售出 / 总数</th><th>取餐时段</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody data-rows>${raw(boxes.map(row).join(""))}</tbody>
        </table>
      </div>`,
    mount(root) {
      const rowsBox = qs("[data-rows]", root);
      const count = qs("[data-count]", root);
      const apply = () => {
        const kw = qs("[data-kw]", root).value.trim().toLowerCase();
        const st = qs("[data-status]", root).value;
        const list = boxes.filter(
          (b) => (!kw || `${b.title}${b.subtitle}${b.canteen_name}`.toLowerCase().includes(kw)) && (!st || b.status === st)
        );
        rowsBox.innerHTML = list.map(row).join("") || `<tr><td colspan="9">${empty("🥡", "没有符合条件的盲盒")}</td></tr>`;
        count.textContent = `显示 ${list.length} / ${boxes.length}`;
      };
      apply();
      qs("[data-kw]", root).addEventListener("input", apply);
      qs("[data-status]", root).addEventListener("change", apply);
      qs("[data-new]", root).addEventListener("click", () => (location.hash = "#/boxes-new"));

      rowsBox.addEventListener("click", async (e) => {
        const edit = e.target.closest("[data-edit]");
        if (edit) return editBox(boxes.find((b) => b.id === Number(edit.dataset.edit)));
        const tg = e.target.closest("[data-toggle]");
        if (tg) {
          const to = ["active", "soldout"].includes(tg.dataset.status) ? "offline" : "active";
          try {
            const res = await api.post(`/api/admin/boxes/${tg.dataset.toggle}/status`, { status: to });
            toast(res.message, "is-good");
            render();
          } catch (err) {
            toast(err.message, "is-bad");
          }
        }
      });
    },
  };
}

function boxForm(b = null) {
  return html`
    <label class="field"><span>盲盒名称</span><input class="input" name="title" value="${b?.title || ""}" placeholder="午市余量盲盒 · 两荤一素" /></label>
    <label class="field"><span>副标题</span><input class="input" name="subtitle" value="${b?.subtitle || ""}" placeholder="土豆牛腩 / 番茄鸡蛋 / 时令青菜随机组合" /></label>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <label class="field"><span>盲盒价（元）</span><input class="input" name="price" type="number" step="0.01" value="${b ? (b.price / 100).toFixed(2) : "6.90"}" /></label>
      <label class="field"><span>原价（元）</span><input class="input" name="original_price" type="number" step="0.01" value="${b ? (b.original_price / 100).toFixed(2) : "15.00"}" /></label>
      <label class="field"><span>份数</span><input class="input" name="total" type="number" value="${b?.total || 20}" /></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <label class="field"><span>取餐开始</span><input class="input" name="pickup_start" value="${b?.pickup_start || "12:30"}" /></label>
      <label class="field"><span>取餐结束</span><input class="input" name="pickup_end" value="${b?.pickup_end || "13:30"}" /></label>
      <label class="field"><span>单份减碳（克）</span><input class="input" name="carbon_g" type="number" value="${b?.carbon_g || 600}" /></label>
    </div>
    <label class="field"><span>封面图标</span>
      <select class="select" name="cover_emoji">
        ${["🍱", "🍛", "🍜", "🍲", "🥟", "🍰", "🥪", "🍗", "🥘", "🍠"]
          .map((e) => html`<option ${b?.cover_emoji === e ? "selected" : ""}>${e}</option>`)}
      </select>
    </label>`;
}

function readForm(wrap) {
  const g = (n) => wrap.querySelector(`[name="${n}"]`).value;
  return {
    title: g("title").trim(),
    subtitle: g("subtitle").trim(),
    price: Math.round(parseFloat(g("price")) * 100),
    original_price: Math.round(parseFloat(g("original_price")) * 100),
    total: parseInt(g("total"), 10),
    pickup_start: g("pickup_start"),
    pickup_end: g("pickup_end"),
    carbon_g: parseInt(g("carbon_g"), 10),
    cover_emoji: g("cover_emoji"),
  };
}

function editBox(b) {
  modal({
    title: "编辑盲盒",
    wide: true,
    body: boxForm(b),
    okText: "保存",
    async onOk(wrap) {
      const data = readForm(wrap);
      if (!data.title) return toast("请填写盲盒名称", "is-bad"), true;
      const r = await api.put(`/api/admin/boxes/${b.id}`, data);
      toast(r.message, "is-good");
      render();
    },
  });
}

/* ------------------------------------------------ 新建盲盒（动态面板三步） */
async function viewBoxNew() {
  const [canteens, cats] = await Promise.all([api.get("/api/admin/canteens"), api.get("/api/admin/categories")]);
  const subs = cats.data.flat.filter((c) => c.parent_id);

  return {
    html: html`
      <div class="page-head">
        <div><h1>新建盲盒</h1><p>三步：填信息、定时段、确认发布</p></div>
        <div class="actions"><button class="btn btn-ghost" data-cancel>返回列表</button></div>
      </div>

      <div class="panel-card" style="max-width:720px">
        <div class="panel-tabs" style="margin-bottom:18px" data-steps>
          <button data-goto="0" aria-selected="true">1 · 基本信息</button>
          <button data-goto="1" aria-selected="false">2 · 库存与时段</button>
          <button data-goto="2" aria-selected="false">3 · 确认发布</button>
        </div>

        <div data-panel data-mode="slide">
          <div data-state>
            <label class="field"><span>所属档口</span>
              <select class="select" name="canteen_id">
                ${canteens.data.canteens.map((c) => html`<option value="${c.id}">${c.name}（${c.campus}）</option>`)}
              </select>
            </label>
            <label class="field"><span>盲盒名称</span><input class="input" name="title" placeholder="午市余量盲盒 · 两荤一素" /></label>
            <label class="field"><span>副标题</span><input class="input" name="subtitle" placeholder="土豆牛腩 / 番茄鸡蛋 / 时令青菜随机组合" /></label>
            <label class="field"><span>封面图标</span>
              <select class="select" name="cover_emoji">
                ${["🍱", "🍛", "🍜", "🍲", "🥟", "🍰", "🥪", "🍗", "🥘", "🍠"].map((e) => html`<option>${e}</option>`)}
              </select>
            </label>
            <label class="field"><span>分类</span>
              <select class="select" name="category_id">
                ${subs.map((c) => html`<option value="${c.id}">${cats.data.flat.find((p) => p.id === c.parent_id)?.name} / ${c.name}</option>`)}
              </select>
            </label>
            <div style="text-align:right"><button class="btn btn-primary" data-next="1">下一步</button></div>
          </div>

          <div data-state>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
              <label class="field"><span>盲盒价（元）</span><input class="input" name="price" type="number" step="0.01" value="6.90" /></label>
              <label class="field"><span>原价（元）</span><input class="input" name="original_price" type="number" step="0.01" value="15.00" /></label>
              <label class="field"><span>份数</span><input class="input" name="total" type="number" value="20" /></label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
              <label class="field"><span>取餐开始</span><input class="input" name="pickup_start" value="12:30" /></label>
              <label class="field"><span>取餐结束</span><input class="input" name="pickup_end" value="13:30" /></label>
              <label class="field"><span>单份减碳（克）</span><input class="input" name="carbon_g" type="number" value="600" /></label>
            </div>
            <label class="field"><span>发布状态</span>
              <select class="select" name="status">
                <option value="active">立即上架</option>
                <option value="draft">存为草稿</option>
              </select>
            </label>
            <div style="display:flex;justify-content:space-between">
              <button class="btn btn-ghost" data-next="0">上一步</button>
              <button class="btn btn-primary" data-next="2">下一步</button>
            </div>
          </div>

          <div data-state>
            <div data-preview></div>
            <div style="display:flex;justify-content:space-between;margin-top:18px">
              <button class="btn btn-ghost" data-next="1">上一步</button>
              <button class="btn btn-primary" data-submit>确认发布</button>
            </div>
          </div>
        </div>
      </div>`,
    mount(root) {
      const panel = qs("[data-panel]", root).__panel;
      const read = () => {
        const g = (n) => root.querySelector(`[name="${n}"]`)?.value;
        return {
          canteen_id: Number(g("canteen_id")),
          category_id: Number(g("category_id")) || null,
          cover_emoji: g("cover_emoji"),
          title: (g("title") || "").trim(),
          subtitle: (g("subtitle") || "").trim(),
          price: Math.round(parseFloat(g("price") || 0) * 100),
          original_price: Math.round(parseFloat(g("original_price") || 0) * 100),
          total: parseInt(g("total") || "0", 10),
          pickup_start: g("pickup_start"),
          pickup_end: g("pickup_end"),
          carbon_g: parseInt(g("carbon_g") || "0", 10),
          status: g("status"),
        };
      };
      const preview = () => {
        const v = read();
        const canteen = canteens.data.canteens.find((c) => c.id === v.canteen_id);
        qs("[data-preview]", root).innerHTML = html`
          <div class="card" style="padding:20px">
            <div style="display:flex;gap:18px;align-items:center">
              <div style="width:88px;height:88px;border-radius:12px;display:grid;place-items:center;font-size:44px;background:linear-gradient(160deg,#f4efe3,#e9e2d1)">${v.cover_emoji}</div>
              <div>
                <h3 style="font-size:18px">${v.title || "（未命名盲盒）"}</h3>
                <p class="muted small">${canteen?.name} · ${canteen?.campus}</p>
                <p class="small muted">${v.subtitle}</p>
              </div>
              <div style="margin-left:auto;text-align:right">
                <div class="num" style="font-size:30px;color:var(--tomato)">¥${fmt.yuan(v.price)}</div>
                <div class="muted tiny">原价 ¥${fmt.yuan(v.original_price)} · ${v.total} 份</div>
              </div>
            </div>
            <div class="info-rows" style="margin-bottom:0">
              <div class="info-row"><b>取餐</b><div>${v.pickup_start} – ${v.pickup_end}</div></div>
              <div class="info-row"><b>减碳</b><div>${v.carbon_g} 克 / 份</div></div>
              <div class="info-row"><b>状态</b><div>${v.status === "active" ? "立即上架" : "存为草稿"}</div></div>
            </div>
          </div>`;
      };
      panel.onChange = (i) => i === 2 && preview();
      root.addEventListener("click", async (e) => {
        const next = e.target.closest("[data-next]");
        if (next) panel.go(Number(next.dataset.next), next);
        if (e.target.closest("[data-cancel]")) location.hash = "#/boxes";
        if (e.target.closest("[data-submit]")) {
          const v = read();
          if (!v.title) return toast("请填写盲盒名称", "is-bad"), panel.go(0);
          try {
            const r = await api.post("/api/admin/boxes", v);
            toast(r.message, "is-good");
            location.hash = "#/boxes";
          } catch (err) {
            toast(err.message, "is-bad");
          }
        }
      });
    },
  };
}

/* ================================================================ 页面：核销 */
async function viewVerify() {
  const { orders, counts } = (await api.get("/api/admin/orders")).data;

  const row = (o) => html`
    <tr data-row="${o.id}">
      <td class="mono tiny">${o.order_no}</td>
      <td class="mono">${o.pickup_code}</td>
      <td>${o.cover_emoji} ${o.title}</td>
      <td>${o.user_name}<div class="muted tiny">${o.phone} · ${o.campus}</div></td>
      <td class="num">${o.qty}</td>
      <td class="num">¥${o.amount_yuan}</td>
      <td><span class="tag ${o.status === "done" ? "" : o.status === "booked" ? "tag-live" : "tag-out"}">${o.status_text}</span></td>
      <td class="muted small">${o.created_at}</td>
      <td><button class="btn btn-ghost btn-sm" data-detail="${o.id}">详情</button></td>
    </tr>`;

  return {
    html: html`
      <div class="page-head">
        <div><h1>订单核销</h1><p>输入顾客出示的 6 位核销码，或直接在下方列表操作</p></div>
      </div>
      <div class="verify-box">
        <div class="panel-card">
          <header><h3>扫码核销</h3></header>
          <div class="verify-input">
            <input class="input" data-code maxlength="6" placeholder="······" inputmode="numeric" />
            <button class="btn btn-primary" data-verify style="height:54px;padding:0 22px">核销</button>
          </div>
          <div data-result></div>
          <p class="tiny muted" style="margin-top:12px">提示：待取餐订单的核销码可在学生端 App「我的订单」里查看。</p>
        </div>
        <div class="panel-card">
          <header><h3>今日订单构成</h3></header>
          <table class="table">
            <tbody>
              <tr><td>待取餐</td><td class="num"><b>${counts.booked || 0}</b></td></tr>
              <tr><td>已核销</td><td class="num"><b>${counts.done || 0}</b></td></tr>
              <tr><td>已取消</td><td class="num"><b>${counts.cancelled || 0}</b></td></tr>
              <tr><td>合计</td><td class="num"><b>${counts.all || 0}</b></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel-card" style="margin-top:16px">
        <header>
          <h3>订单列表</h3>
          <div class="right">
            <div class="panel-tabs" data-order-tabs>
              <button data-goto="0" aria-selected="true">全部 ${counts.all || 0}</button>
              <button data-goto="1" aria-selected="false">待取餐 ${counts.booked || 0}</button>
              <button data-goto="2" aria-selected="false">已核销 ${counts.done || 0}</button>
            </div>
          </div>
        </header>
        <div data-panel data-mode="fade">
          ${raw(
            [orders, orders.filter((o) => o.status === "booked"), orders.filter((o) => o.status === "done")]
              .map(
                (list) => `<div data-state>
                  <table class="table">
                    <thead><tr><th>订单号</th><th>核销码</th><th>盲盒</th><th>顾客</th><th>份数</th><th>金额</th><th>状态</th><th>下单时间</th><th></th></tr></thead>
                    <tbody>${list.map(row).join("") || `<tr><td colspan="9">${empty("🧾", "没有订单")}</td></tr>`}</tbody>
                  </table>
                </div>`
              )
              .join("")
          )}
        </div>
      </div>`,
    mount(root) {
      const input = qs("[data-code]", root);
      const result = qs("[data-result]", root);
      const doVerify = async () => {
        const code = input.value.trim();
        if (!/^\d{6}$/.test(code)) return toast("请输入 6 位数字核销码", "is-bad");
        try {
          const r = await api.post("/api/admin/verify", { code });
          const o = r.data.order;
          result.innerHTML = html`<div class="verify-result">
            <h4>✅ ${o.title} × ${o.qty}</h4>
            <p>${o.user_name} 的订单已核销，获得 ${o.points} 碳积分，减碳 ${o.carbon_g} 克。${r.message}</p>
          </div>`;
          input.value = "";
          toast(r.message, "is-good");
          render();
        } catch (err) {
          result.innerHTML = html`<div class="verify-result is-bad"><h4>无法核销</h4><p>${err.message}</p></div>`;
        }
      };
      qs("[data-verify]", root).addEventListener("click", doVerify);
      input.addEventListener("keydown", (e) => e.key === "Enter" && doVerify());

      const panel = qs("[data-panel]", root).__panel;
      qs("[data-order-tabs]", root).addEventListener("click", (e) => {
        const b = e.target.closest("[data-goto]");
        if (b) panel.go(Number(b.dataset.goto), b);
      });

      root.addEventListener("click", (e) => {
        const d = e.target.closest("[data-detail]");
        if (!d) return;
        const o = orders.find((x) => x.id === Number(d.dataset.detail));
        modal({
          title: "订单详情",
          body: html`<dl class="kv" style="font-size:14px;line-height:2">
            <dt>订单号</dt><dd class="mono">${o.order_no}</dd>
            <dt>核销码</dt><dd class="mono">${o.pickup_code}</dd>
            <dt>盲盒</dt><dd>${o.cover_emoji} ${o.title}</dd>
            <dt>顾客</dt><dd>${o.user_name}（${o.phone}）</dd>
            <dt>份数 / 金额</dt><dd>${o.qty} 份 · ¥${o.amount_yuan}</dd>
            <dt>状态</dt><dd>${o.status_text}</dd>
            <dt>下单时间</dt><dd>${o.created_at}</dd>
            <dt>核销时间</dt><dd>${o.verified_at || "—"}</dd>
          </dl>`,
          okText: "关闭",
          cancelText: "",
        });
      });
    },
  };
}

/* ================================================================ 页面：分类树 */
async function viewCategories() {
  const r = await api.get("/api/admin/categories");
  const tree = r.data.tree;

  const actions = (n) => html`
    <span class="acts" data-no-toggle>
      <button data-add-child="${n.id}">加子项</button>
      <button data-rename="${n.id}" data-name="${n.name}">改名</button>
      ${n.parent_id ? html`<button data-del="${n.id}" data-name="${n.name}">删除</button>` : ""}
    </span>`;

  return {
    html: html`
      <div class="page-head">
        <div><h1>分类与菜品</h1><p>餐段 → 品类的两级分类，点击左侧箭头展开折叠</p></div>
        <div class="actions"><button class="btn btn-primary" data-add-top>＋ 新建餐段</button></div>
      </div>
      <div class="panel-card tree-panel">
        <div data-tree style="font-size:15px">${raw(treeHTML(tree, { renderActions: actions }))}</div>
        <p class="tiny muted" style="margin-top:16px">
          分类里的数字是当前挂在该分类下的盲盒数量。删除子分类时，挂靠的盲盒会自动变为「未分类」。
        </p>
      </div>`,
    mount(root) {
      const treeEl = qs("[data-tree]", root);
      bindTree(treeEl);
      treeEl.querySelectorAll(".tree-node").forEach((n) => n.classList.add("is-open"));

      const reload = async () => {
        const rr = await api.get("/api/admin/categories");
        treeEl.innerHTML = treeHTML(rr.data.tree, { renderActions: actions });
        bindTree(treeEl);
        treeEl.querySelectorAll(".tree-node").forEach((n) => n.classList.add("is-open"));
      };

      qs("[data-add-top]", root).addEventListener("click", () =>
        modal({
          title: "新建餐段",
          body: html`<label class="field"><span>名称</span><input class="input" data-name placeholder="如：下午茶" /></label>`,
          onOk: async (w) => {
            const name = w.querySelector("[data-name]").value.trim();
            if (!name) return toast("请填写名称", "is-bad"), true;
            const res = await api.post("/api/admin/categories", { name, parent_id: null });
            toast(res.message, "is-good");
            reload();
          },
        })
      );

      treeEl.addEventListener("click", async (e) => {
        const add = e.target.closest("[data-add-child]");
        if (add)
          return modal({
            title: "新增子分类",
            body: html`<label class="field"><span>名称</span><input class="input" data-name placeholder="如：盖浇饭" /></label>`,
            onOk: async (w) => {
              const name = w.querySelector("[data-name]").value.trim();
              if (!name) return toast("请填写名称", "is-bad"), true;
              const res = await api.post("/api/admin/categories", { name, parent_id: Number(add.dataset.addChild) });
              toast(res.message, "is-good");
              reload();
            },
          });

        const ren = e.target.closest("[data-rename]");
        if (ren)
          return modal({
            title: "重命名",
            body: html`<label class="field"><span>名称</span><input class="input" data-name value="${ren.dataset.name}" /></label>`,
            onOk: async (w) => {
              const name = w.querySelector("[data-name]").value.trim();
              if (!name) return toast("请填写名称", "is-bad"), true;
              const res = await api.put(`/api/admin/categories/${ren.dataset.rename}`, { name });
              toast(res.message, "is-good");
              reload();
            },
          });

        const del = e.target.closest("[data-del]");
        if (del) {
          const yes = await confirmBox({
            title: `删除「${del.dataset.name}」？`,
            text: "该子分类下的盲盒会变为未分类，分类本身不会删除盲盒。",
            okText: "删除",
            danger: true,
          });
          if (!yes) return;
          try {
            const res = await api.del(`/api/admin/categories/${del.dataset.del}`);
            toast(res.message, "is-good");
            reload();
          } catch (err) {
            toast(err.message, "is-bad");
          }
        }
      });
    },
  };
}

/* ================================================================ 页面：顾客 */
async function viewCustomers() {
  const r = await api.get("/api/admin/customers");
  const { customers, agg } = r.data;
  return {
    html: html`
      <div class="page-head">
        <div><h1>顾客与碳积分</h1><p>${agg.users} 位同学累计获得 ${agg.points} 积分，减碳 ${fmt.kg(agg.carbon_g)} 千克</p></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">注册学生</div><b class="num">${agg.users}</b></div>
        <div class="kpi is-carbon"><div class="label">累计减碳</div><b class="num">${fmt.kg(agg.carbon_g)}<span class="unit">kg</span></b></div>
        <div class="kpi is-hi"><div class="label">发放碳积分</div><b class="num">${agg.points}</b></div>
        <div class="kpi"><div class="label">人均减碳</div><b class="num">${agg.users ? fmt.kg(agg.carbon_g / agg.users) : 0}<span class="unit">kg</span></b></div>
      </div>
      <div class="tbl-wrap">
        <table class="table">
          <thead><tr><th>排名</th><th>同学</th><th>校区</th><th>完成订单</th><th>减碳（克）</th><th>累计积分</th><th>可用积分</th></tr></thead>
          <tbody>
            ${customers.map(
              (c, i) => html`<tr>
                  <td class="num">${i + 1}</td>
                  <td><b>${c.name}</b><div class="muted tiny">${c.phone}</div></td>
                  <td>${c.campus}</td>
                  <td class="num">${c.orders}</td>
                  <td class="num">${c.carbon_g}</td>
                  <td class="num"><b>${c.points_all}</b></td>
                  <td class="num">${c.points}</td>
              </tr>`
            )}
          </tbody>
        </table>
      </div>`,
  };
}

/* ================================================================ 路由 */
const routes = [
  { path: "/login", view: viewLogin, title: "登录" },
  { path: "/overview", view: viewOverview, title: "经营概览", hint: "数据每 5 分钟汇总一次" },
  { path: "/boxes", view: viewBoxes, title: "盲盒管理" },
  { path: "/boxes-new", view: viewBoxNew, title: "新建盲盒" },
  { path: "/verify", view: viewVerify, title: "订单核销" },
  { path: "/categories", view: viewCategories, title: "分类与菜品" },
  { path: "/customers", view: viewCustomers, title: "顾客与碳积分" },
];

async function render() {
  const hash = location.hash.replace(/^#/, "") || "/overview";
  const [path] = hash.split("?");
  const hit = routes.find((r) => r.path === path) || routes[1];
  const app = qs("#app");

  // 未登录：整屏只渲染登录框，不显示侧边导航
  if (!state.user) {
    app.className = "";
    app.innerHTML = "";
    const res = await viewLogin();
    app.appendChild(el(typeof res === "string" ? res : res.html));
    res.mount?.(app);
    return;
  }

  state.route = hit.key || path.replace("/", "");
  renderChrome(hit.title);
  const outlet = qs("#outlet");
  outlet.innerHTML = `<div class="page"><div class="skeleton" style="height:60vh"></div></div>`;
  let res;
  try {
    res = await hit.view({ params: new URLSearchParams() });
  } catch (err) {
    res = { html: empty("😵", err.message || "页面加载失败") };
  }
  outlet.innerHTML = `<div class="page">${typeof res === "string" ? res : res.html}</div>`;
  outlet.querySelectorAll("[data-panel]").forEach((p) => (p.__panel = new Panel(p)));
  outlet.querySelectorAll("[data-tree]").forEach((t) => bindTree(t));
  res?.mount?.(outlet);
  window.scrollTo({ top: 0 });
}

function renderChrome(title = "") {
  const app = qs("#app");
  app.className = "admin";
  app.innerHTML = html`
    ${raw(Master.render("side"))}
    <div class="main">
      ${raw(Master.render("admin-topbar", { title: title || "经营概览" }))}
      <div id="outlet"></div>
    </div>`;
}

qs("#app").addEventListener("click", (e) => {
  const group = e.target.closest("[data-group]");
  const link = e.target.closest("[data-go]");
  if (link && group && link.dataset.go === group.dataset.group) {
    e.stopPropagation();
    group.classList.toggle("is-open");
    return;
  }
  if (link) location.hash = "#/" + link.dataset.go;
  if (e.target.closest("[data-logout]"))
    api.post("/api/auth/logout").then(() => {
      state.user = null;
      location.hash = "#/login";
      render();
    });
  if (e.target.closest("[data-go='overview']")) location.hash = "#/overview";
});

window.addEventListener("hashchange", render);

(async function boot() {
  const me = await api.get("/api/auth/me");
  state.user = me.data.user;
  if (!location.hash) location.hash = state.user ? "#/overview" : "#/login";
  await render();
})();
