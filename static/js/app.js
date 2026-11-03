/* 食光机 · App 端（手机）
   底部 4 Tab 导航 + 页面栈路由；含动态面板、母版、手风琴展开折叠 */

import {
  Master, Panel, api, accordionHTML, el, empty, esc, fmt, html, modal, qs, qsa, raw,
  toast, confirmBox,
} from "./core.js";

const state = { user: null, campus: "中心校区", boxes: [], cats: [], tab: "home" };

/* ================================================================ 母版 */
Master.define("app-tabbar", () => {
  const tabs = [
    ["home", "首页", '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>'],
    ["orders", "订单", '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>'],
    ["carbon", "碳账户", '<path d="M20 4C10 4 4 9 4 17c0 0 0 3 3 3"/><path d="M4 20c6-9 13-11 16-16"/>'],
    ["me", "我的", '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'],
  ];
  return html`
    <nav class="app-tabbar">
      ${tabs.map(
        ([key, label, d]) => html`
          <button class="tab-item ${state.tab === key ? "is-on" : ""}" data-tab="${key}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                 stroke-linecap="round" stroke-linejoin="round">${raw(d)}</svg>
            <span>${label}</span>
          </button>`
      )}
    </nav>`;
});

Master.define("app-nav", ({ title, back = false, right = "" }) => html`
  <div class="app-nav">
    ${back ? html`<button class="btn-icon" data-back aria-label="返回">‹</button>` : html`<span style="width:34px"></span>`}
    <h2>${title}</h2>
    ${right ? raw(right) : html`<span style="width:34px"></span>`}
  </div>`);

Master.define("app-box-row", (b) => html`
  <button class="app-box" data-open="${b.id}">
    <div class="app-box-cover ${b.remain <= 0 ? "is-out" : ""}">
      ${b.cover_emoji}
      ${b.remain > 0 && b.percent_left <= 25 ? raw(`<span class="tag tag-warn" style="position:absolute;left:4px;top:4px;font-size:10px">剩${b.remain}</span>`) : ""}
    </div>
    <div class="app-box-main">
      <h3>${b.title}</h3>
      <div class="app-box-meta">${b.canteen} · 取餐 ${b.pickup_start}–${b.pickup_end}</div>
      <div class="meter ${fmt.meterClass(b.percent_left)}" style="width:70%"><i style="width:${b.percent_left}%"></i></div>
      <div class="app-box-price">
        <span class="now num">¥${fmt.yuan(b.price)}</span>
        <span class="was">¥${fmt.yuan(b.original_price)}</span>
        ${b.remain <= 0 ? raw(`<span class="tag tag-out">售罄</span>`) : raw(`<span class="tag tag-live">${b.discount}折</span>`)}
      </div>
    </div>
  </button>`);

/* ================================================================ 页面：登录 */
function viewLogin() {
  return {
    html: html`
      <div class="login-wrap">
        <div class="login-logo">🍱</div>
        <h1>食光机</h1>
        <p class="lead">把食堂今天的余量，装进盲盒带回家</p>
        <label class="field">
          <span>手机号</span>
          <input class="input" data-phone placeholder="18800000001" maxlength="11" inputmode="numeric" />
        </label>
        <label class="field">
          <span>校区</span>
          <select class="select" data-campus>
            ${["中心校区", "东校区", "新校区"].map((c) => html`<option>${c}</option>`)}
          </select>
        </label>
        <button class="btn btn-primary btn-block btn-lg" data-do-login style="margin-top:8px">登录 / 注册</button>
        <p class="tiny muted" style="text-align:center;margin-top:14px">
          演示环境，任意 11 位手机号即可登录<br />推荐体验账号 18800000001
        </p>
      </div>`,
    mount(root) {
      const phone = qs("[data-phone]", root);
      phone.value = "18800000001";
      qs("[data-do-login]", root).addEventListener("click", async () => {
        const p = phone.value.trim();
        if (!/^\d{11}$/.test(p)) return toast("请输入 11 位手机号", "is-bad");
        try {
          const r = await api.post("/api/auth/login", {
            phone: p, role: "student", campus: qs("[data-campus]", root).value,
          });
          state.user = r.data.user;
          state.campus = r.data.user.campus || state.campus;
          toast(`欢迎回来，${state.user.name}`, "is-good");
          navigate("/home");
        } catch (err) {
          toast(err.message, "is-bad");
        }
      });
    },
  };
}

/* ================================================================ 页面：首页 */
async function viewHome() {
  await loadBoxes();
  const avail = state.boxes.filter((b) => b.status === "active" && b.remain > 0);
  const left = avail.reduce((s, b) => s + b.remain, 0);
  const cats = ["全部", ...new Set(state.boxes.map((b) => b.parent_category_name).filter(Boolean))];
  const hour = new Date().getHours();
  const greet = hour < 11 ? "早" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";

  return {
    html: html`
      <div class="home-head">
        <div class="hi">${greet}，<b>${state.user?.name || "同学"}</b></div>
        <div class="loc">📍 ${state.campus} <button class="btn btn-ghost btn-sm" data-switch>切换</button></div>
      </div>
      <div class="home-search" data-search>🔍 搜索盲盒或档口</div>
      <div class="cat-strip">
        ${cats.map((c, i) => html`<button class="cat-pill ${i === 0 ? "is-on" : ""}" data-cat="${c}">${c}</button>`)}
      </div>
      <div class="app-banner">
        <span class="emoji">🥡</span>
        <div>
          <div class="num">${left}</div>
          <p>份余量餐食正在等你带走</p>
        </div>
      </div>
      <div data-list style="margin-top:8px">
        ${avail.length
          ? raw(avail.map((b) => Master.render("app-box-row", b)).join(""))
          : empty("🍽️", "今天这个校区的盲盒都卖完了")}
      </div>
      <div style="padding:16px 20px 8px" class="small muted">已经到底了，明天早点来</div>`,
    mount(root) {
      qsa("[data-cat]", root).forEach((btn) =>
        btn.addEventListener("click", () => {
          qsa("[data-cat]", root).forEach((b) => b.classList.toggle("is-on", b === btn));
          const cat = btn.dataset.cat;
          const list = cat === "全部" ? avail : avail.filter((b) => b.parent_category_name === cat);
          qs("[data-list]", root).innerHTML = list.length
            ? list.map((b) => Master.render("app-box-row", b)).join("")
            : empty("🍽️", "这个餐段暂时没有盲盒");
        })
      );
      qs("[data-switch]", root).addEventListener("click", () =>
        modal({
          title: "切换校区",
          body: html`<select class="select" data-c>
            ${["中心校区", "东校区", "新校区"].map((c) => html`<option ${c === state.campus ? "selected" : ""}>${c}</option>`)}
          </select>`,
          okText: "切换",
          onOk(w) {
            state.campus = w.querySelector("[data-c]").value;
            navigate("/home");
          },
        })
      );
      qs("[data-search]", root).addEventListener("click", () => toast("演示版：试试上面的餐段筛选", ""));
    },
  };
}

/* ================================================================ 页面：详情 */
async function viewDetail({ args }) {
  const b = (await api.get(`/api/boxes/${args.id}`)).data;
  const soldOut = b.remain <= 0 || b.status !== "active";

  return {
    html: html`
      <div class="app-hero-cover">
        ${b.cover_emoji}
        <button class="app-float-back" data-back aria-label="返回">‹</button>
      </div>
      <div class="app-detail-pad">
        <h1 style="font-size:21px;line-height:1.4">${b.title}</h1>
        <p class="muted small" style="margin-top:6px">${b.subtitle}</p>
        <div class="app-price">
          <span class="now num">¥${fmt.yuan(b.price)}</span>
          <span class="was">¥${fmt.yuan(b.original_price)}</span>
          <span class="tag ${soldOut ? "tag-out" : "tag-live"}">${soldOut ? "已售罄" : b.discount + " 折"}</span>
        </div>
        <div class="meter ${fmt.meterClass(b.percent_left)}" style="margin-top:10px"><i style="width:${b.percent_left}%"></i></div>
        <div class="small muted" style="margin-top:6px">已售 ${b.sold}/${b.total} · 余 ${b.remain} 份</div>

        <div class="panel-card" style="margin-top:18px;padding:14px 16px">
          <div class="info-rows" style="margin:0">
            <div class="info-row"><b>档口</b><div>${b.canteen}</div></div>
            <div class="info-row"><b>取餐</b><div>${b.pickup_start} – ${b.pickup_end}</div></div>
            <div class="info-row"><b>减碳</b><div>约 ${b.carbon_g} 克 · ${Math.floor(b.carbon_g / 10)} 积分</div></div>
          </div>
        </div>

        <div class="panel-tabs" style="margin:18px 0 12px;display:flex">
          <button data-goto="0" aria-selected="true">里边有什么</button>
          <button data-goto="1" aria-selected="false">取餐须知</button>
          <button data-goto="2" aria-selected="false">评价 ${b.review_count || ""}</button>
        </div>
        <div data-panel data-mode="slide">
          <div data-state>
            <div class="dish-chips">
              ${b.dishes.length
                ? raw(b.dishes.map((d) => html`<span class="dish-chip">${d.emoji} ${d.name}</span>`).join(""))
                : raw(`<span class="muted small">档口暂未登记菜品</span>`)}
            </div>
            <p class="small muted" style="margin-top:12px;line-height:1.8">${b.canteen_intro || ""}</p>
          </div>
          <div data-state>
            <ul class="small" style="line-height:2">
              <li>取餐时段 ${b.pickup_start} – ${b.pickup_end}</li>
              <li>到 ${b.window || b.canteen} 出示 6 位核销码</li>
              <li>错过时间自动退款，不影响碳积分</li>
              <li>可把核销码截图给同学代取</li>
            </ul>
          </div>
          <div data-state>
            ${b.reviews.length
              ? raw(
                  b.reviews
                    .map(
                      (rv) => html`<div class="review">
                        <div class="review-top"><b>${rv.name}</b><span class="stars">${fmt.stars(rv.rating)}</span></div>
                        <p>${rv.text}</p>
                      </div>`
                    )
                    .join("")
                )
              : raw(empty("💬", "还没有评价"))}
          </div>
        </div>
      </div>

      <div class="app-bottom-bar">
        <div class="stepper">
          <button data-minus>−</button><span data-qty>1</span><button data-plus>+</button>
        </div>
        <button class="btn btn-primary" data-buy ${soldOut ? "disabled" : ""} style="flex:1">
          ${soldOut ? "已售罄" : "立即预订"}
        </button>
      </div>`,
    mount(root) {
      let qty = 1;
      const q = qs("[data-qty]", root);
      root.querySelector("[data-minus]").addEventListener("click", () => (q.textContent = qty = Math.max(1, qty - 1)));
      root.querySelector("[data-plus]").addEventListener("click", () =>
        (q.textContent = qty = Math.min(Math.min(5, b.remain || 1), qty + 1))
      );
      qs("[data-buy]", root).addEventListener("click", () => navigate(`/confirm/${b.id}?qty=${qty}`));
    },
  };
}

/* ================================================================ 页面：预订确认 */
async function viewConfirm({ args, params }) {
  if (!state.user) {
    navigate("/login");
    return { html: "" };
  }
  const b = (await api.get(`/api/boxes/${args.id}`)).data;
  const qty = Math.max(1, Math.min(5, Number(params.get("qty") || 1)));

  return {
    html: html`
      ${raw(Master.render("app-nav", { title: "确认预订", back: true }))}
      <div class="app-pad">
        <div class="me-card" style="margin:0 0 14px">
          <div style="display:flex;gap:12px;align-items:center">
            <div class="app-box-cover" style="flex:0 0 64px;height:64px;font-size:32px">${b.cover_emoji}</div>
            <div>
              <h3 style="font-size:16px">${b.title}</h3>
              <p class="muted small">${b.canteen} · ${b.window}</p>
            </div>
          </div>
        </div>

        <div class="me-card" style="margin:0 0 14px">
          <div class="me-item" style="padding:12px 0">
            <span class="ico">🕒</span><span>取餐时段</span>
            <span class="arrow">${b.pickup_start} – ${b.pickup_end}</span>
          </div>
          <div class="me-item" style="padding:12px 0">
            <span class="ico">🥢</span><span>数量</span>
            <span class="arrow num">${qty} 份</span>
          </div>
          <div class="me-item" style="padding:12px 0">
            <span class="ico">🌱</span><span>预计减碳</span>
            <span class="arrow">${b.carbon_g * qty} 克 · ${Math.floor((b.carbon_g * qty) / 10)} 积分</span>
          </div>
          <div class="me-item" style="padding:12px 0;border-bottom:0">
            <span class="ico">💰</span><span>实付</span>
            <span class="arrow num" style="color:var(--tomato);font-size:20px">¥${fmt.yuan(b.price * qty)}</span>
          </div>
        </div>

        <div class="me-card" style="margin:0 0 14px">
          <div class="small muted" style="line-height:1.8">
            演示环境不产生真实支付。点击「确认支付」后立即生成核销码，
            档口余量同步减少，可在「订单」里查看。
          </div>
        </div>

        <button class="btn btn-primary btn-block btn-lg" data-pay>确认支付 ¥${fmt.yuan(b.price * qty)}</button>
      </div>`,
    mount(root) {
      qs("[data-pay]", root).addEventListener("click", async () => {
        try {
          const r = await api.post("/api/orders", { box_id: b.id, qty });
          toast(r.message, "is-good");
          navigate("/orders");
        } catch (err) {
          toast(err.message, "is-bad");
        }
      });
    },
  };
}

/* ================================================================ 页面：订单 */
async function viewOrders() {
  if (!state.user) return { html: "", mount: () => navigate("/login") };
  const { orders, counts } = (await api.get("/api/orders?status=all")).data;
  const groups = ["booked", "done", "cancelled"].map((k) => orders.filter((o) => o.status === k));

  const card = (o) => html`
    <div class="me-card">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="app-box-cover" style="flex:0 0 54px;height:54px;font-size:26px">${o.cover_emoji}</div>
        <div style="flex:1;min-width:0">
          <h3 style="font-size:15px">${o.title}</h3>
          <p class="muted small">${o.canteen} · ${o.qty} 份 · ¥${o.amount_yuan}</p>
        </div>
        <span class="tag ${o.status === "booked" ? "tag-live" : o.status === "done" ? "" : "tag-out"}">
          ${o.status === "booked" ? "待取餐" : o.status === "done" ? "已取餐" : "已取消"}
        </span>
      </div>
      ${o.status === "booked"
        ? html`<div class="code-wrap" style="margin:12px 0 0">
            <small>向档口出示核销码</small>
            <span class="num mono">${o.pickup_code}</span>
            <small>取餐 ${o.pickup_start} – ${o.pickup_end}</small>
            <div style="display:flex;gap:8px;margin-top:14px">
              <button class="btn btn-ghost btn-sm" style="flex:1" data-cancel="${o.id}">取消订单</button>
            </div>
          </div>`
        : ""}
      ${o.status === "done" ? html`<div class="small" style="margin-top:10px;color:var(--moss)">已获得 ${o.points} 碳积分 · 减碳 ${o.carbon_g} 克</div>` : ""}
    </div>`;

  return {
    html: html`
      ${raw(Master.render("app-nav", { title: "我的订单" }))}
      <div class="app-pad">
        <div class="panel-tabs" style="display:flex;margin-bottom:14px">
          ${raw(["待取餐", "已取餐", "已取消"].map((l, i) => html`<button data-goto="${i}" aria-selected="${i === 0 ? "true" : "false"}" style="flex:1">${l} ${counts[["booked", "done", "cancelled"][i]]}</button>`).join(""))}
        </div>
        <div data-panel data-mode="fade">
          ${raw(
            groups
              .map(
                (list, i) => `<div data-state>${
                  list.length
                    ? list.map(card).join("")
                    : empty(["🧺", "🌱", "🍃"][i], ["还没有待取餐的订单", "完成第一单就能拿到碳积分", "没有取消记录"][i],
                        i === 0 ? html`<button class="btn btn-primary" data-go-home>去挑一个</button>` : "")
                }</div>`
              )
              .join("")
          )}
        </div>
      </div>`,
    mount(root) {
      root.addEventListener("click", async (e) => {
        if (e.target.closest("[data-go-home]")) return navigate("/home");
        const c = e.target.closest("[data-cancel]");
        if (!c) return;
        const yes = await confirmBox({ title: "取消订单？", text: "份数会退回盲盒池，费用原路退回。", okText: "取消订单", danger: true });
        if (!yes) return;
        try {
          const r = await api.post(`/api/orders/${c.dataset.cancel}/cancel`);
          toast(r.message, "is-good");
          navigate("/orders");
        } catch (err) {
          toast(err.message, "is-bad");
        }
      });
    },
  };
}

/* ================================================================ 页面：碳账户 */
async function viewCarbon() {
  if (!state.user) return { html: "", mount: () => navigate("/login") };
  const [c, board] = await Promise.all([api.get("/api/carbon"), api.get("/api/carbon/leaderboard")]);
  const me = c.data;
  const lv = me.level;

  return {
    html: html`
      ${raw(Master.render("app-nav", { title: "碳账户" }))}
      <div class="app-pad">
        <div class="code-wrap" style="margin:0 0 14px">
          <small>累计碳积分</small>
          <span class="num">${me.points_all}</span>
          <small>${lv.emoji} ${lv.name} · 第 ${lv.level} 级 · 校内第 ${me.rank} 名</small>
          <div class="meter" style="margin-top:12px;background:rgba(251,248,241,.22)"><i style="width:${Math.round(lv.progress * 100)}%;background:var(--butter)"></i></div>
          <small style="display:block;margin-top:8px">${lv.to_next ? `再 ${lv.to_next} 分升级为${lv.next_name}` : "已达最高等级"}</small>
        </div>

        <div class="me-card">
          <div class="me-stats" style="border-top:0;padding-top:0">
            <div><b class="num">${me.points}</b><span>可用积分</span></div>
            <div><b class="num">${fmt.kg(me.carbon_g)}</b><span>千克减碳</span></div>
            <div><b class="num">${me.saved_meals}</b><span>救下份数</span></div>
          </div>
        </div>

        <div class="panel-tabs" style="display:flex;margin:16px 0 12px">
          <button data-goto="0" aria-selected="true" style="flex:1">积分流水</button>
          <button data-goto="1" aria-selected="false" style="flex:1">减碳榜</button>
          <button data-goto="2" aria-selected="false" style="flex:1">去兑换</button>
        </div>
        <div data-panel data-mode="slide">
          <div data-state>
            <div class="me-card">
              ${me.logs.length
                ? raw(
                    me.logs
                      .map(
                        (l) => html`<div class="log">
                          <span class="delta ${l.delta >= 0 ? "plus" : "minus"}">${l.delta >= 0 ? "+" : ""}${l.delta}</span>
                          <span class="why">${l.reason}</span>
                          <span class="when">${fmt.ago(l.created_at)}</span>
                        </div>`
                      )
                      .join("")
                  )
                : raw(empty("🌱", "还没有积分记录"))}
            </div>
          </div>
          <div data-state>
            <div class="me-card">
              ${raw(
                board.data.board
                  .map(
                    (r) => html`<div class="rank-row ${r.id === board.data.me_id ? "is-me" : ""}">
                      <span class="rank-no">${r.rank}</span>
                      <span class="rank-name">${r.name}<span class="muted tiny"> · ${r.campus}</span></span>
                      <span class="rank-num">${r.points_all}</span>
                    </div>`
                  )
                  .join("")
              )}
            </div>
          </div>
          <div data-state data-rewards>
            ${raw(`<div class="me-card">${empty("🎁", "正在加载权益…")}</div>`)}
          </div>
        </div>
      </div>`,
    async mount(root) {
      const panel = qs("[data-panel]", root).__panel;
      let loaded = false;
      panel.onChange = async (i) => {
        if (i !== 2 || loaded) return;
        loaded = true;
        const r = await api.get("/api/rewards");
        qs("[data-rewards]", root).innerHTML = html`<div class="me-card">${raw(
          r.data.rewards
            .map(
              (w) => html`<div class="reward">
                <div class="reward-emoji">${w.emoji}</div>
                <div class="reward-main"><h4>${w.name}</h4><p>${w.intro} · 剩 ${w.stock}</p></div>
                <button class="btn ${me.points >= w.points && w.stock > 0 ? "btn-butter" : "btn-ghost"} btn-sm"
                  data-redeem="${w.id}" ${me.points < w.points || w.stock <= 0 ? "disabled" : ""}>${w.points} 分</button>
              </div>`
            )
            .join("")
        )}</div>`;
      };
      root.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-redeem]");
        if (!btn) return;
        try {
          const r = await api.post(`/api/rewards/${btn.dataset.redeem}/redeem`);
          toast(r.message, "is-good");
          navigate("/carbon");
        } catch (err) {
          toast(err.message, "is-bad");
        }
      });
    },
  };
}

/* ================================================================ 页面：我的 */
async function viewMe() {
  if (!state.user) return { html: "", mount: () => navigate("/login") };
  const [faq, mine] = await Promise.all([api.get("/api/faqs"), api.get("/api/my/redemptions")]);
  const u = state.user;

  return {
    html: html`
      ${raw(Master.render("app-nav", { title: "我的" }))}
      <div class="app-pad">
        <div class="me-card">
          <div class="me-head">
            <div class="avatar">${u.name.slice(0, 1)}</div>
            <div>
              <h3>${u.name}</h3>
              <p>${u.campus} · ${u.phone}</p>
            </div>
          </div>
          <div class="me-stats">
            <div><b class="num">${u.points_all}</b><span>累计积分</span></div>
            <div><b class="num">${u.points}</b><span>可用积分</span></div>
            <div><b class="num">${mine.data.items.length}</b><span>我的权益</span></div>
          </div>
        </div>

        <div class="me-list" style="margin-bottom:16px">
          <button class="me-item" data-go="orders"><span class="ico">🧾</span>我的订单<span class="arrow">›</span></button>
          <button class="me-item" data-go="carbon"><span class="ico">🌿</span>碳账户与排行榜<span class="arrow">›</span></button>
          <button class="me-item" data-toggle-mine><span class="ico">🎁</span>我的权益<span class="arrow">${mine.data.items.length} 张 ›</span></button>
        </div>

        <div data-mine-panel class="hide" style="margin-bottom:16px">
          <div class="me-card">
            ${mine.data.items.length
              ? raw(
                  mine.data.items
                    .map(
                      (i) => html`<div class="reward">
                        <div class="reward-emoji">${i.emoji}</div>
                        <div class="reward-main"><h4>${i.name}</h4><p>使用码 ${i.code}</p></div>
                        <span class="tag ${i.used ? "tag-out" : "tag-live"}">${i.used ? "已使用" : "待使用"}</span>
                      </div>`
                    )
                    .join("")
                )
              : raw(empty("🎁", "还没有兑换过"))}
          </div>
        </div>

        <h3 style="font-size:15px;margin:0 4px 10px">帮助中心</h3>
        <div class="me-card" style="padding:4px 16px">
          ${raw(
            faq.data.groups
              .map(
                (g) => html`<div style="padding:12px 0;border-bottom:1px solid var(--line)">
                  <div class="small muted" style="margin-bottom:2px">${g.name}</div>
                  ${raw(accordionHTML(g.items))}
                </div>`
              )
              .join("")
          )}
        </div>

        <button class="btn btn-ghost btn-block" data-logout style="margin-top:20px">退出登录</button>
      </div>`,
    mount(root) {
      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-toggle-mine]")) qs("[data-mine-panel]", root).classList.toggle("hide");
        if (e.target.closest("[data-go='orders']")) navigate("/orders");
        if (e.target.closest("[data-go='carbon']")) navigate("/carbon");
        if (e.target.closest("[data-logout]"))
          api.post("/api/auth/logout").then(() => {
            state.user = null;
            navigate("/login");
          });
      });
    },
  };
}

/* ================================================================ 路由与启动 */
const routes = [
  { path: "/login", view: viewLogin, tab: null },
  { path: "/home", view: viewHome, tab: "home" },
  { path: "/box/:id", view: viewDetail, tab: "home" },
  { path: "/confirm/:id", view: viewConfirm, tab: "home" },
  { path: "/orders", view: viewOrders, tab: "orders" },
  { path: "/carbon", view: viewCarbon, tab: "carbon" },
  { path: "/me", view: viewMe, tab: "me" },
];

const outlet = qs("#outlet");
const tabbar = qs("#tabbar");
const statusbar = qs("#statusbar");

function navigate(to) {
  location.hash = "#" + to;
}

function setClock() {
  if (!statusbar) return;
  const d = new Date();
  statusbar.querySelector("[data-clock]").textContent =
    `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
setInterval(setClock, 20000);

async function render() {
  const rawHash = location.hash.replace(/^#/, "") || "/login";
  const [path, qs2] = rawHash.split("?");
  const params = new URLSearchParams(qs2 || "");
  let hit = null;
  for (const r of routes) {
    const names = [];
    const pattern = r.path.replace(/:([A-Za-z0-9_]+)/g, (_, n) => (names.push(n), "([^/]+)"));
    const m = new RegExp("^" + pattern + "$").exec(path || "/");
    if (m) {
      const args = {};
      names.forEach((n, i) => (args[n] = decodeURIComponent(m[i + 1])));
      hit = { route: r, args };
      break;
    }
  }
  if (!hit) {
    navigate("/home");
    return;
  }
  const needLogin = hit.route.path !== "/login";
  if (needLogin && !state.user) {
    navigate("/login");
    return;
  }

  const showTab = !!hit.route.tab;
  tabbar.classList.toggle("hide", !showTab);
  if (showTab) {
    state.tab = hit.route.tab;
    tabbar.innerHTML = Master.render("app-tabbar");
  }

  outlet.innerHTML = `<div style="padding:20px"><div class="skeleton" style="height:60vh"></div></div>`;
  let res;
  try {
    res = await hit.route.view({ args: hit.args, params });
  } catch (err) {
    res = { html: empty("😵", err.message || "加载失败") };
  }
  outlet.innerHTML = typeof res === "string" ? res : res.html || "";
  outlet.className = "app-body app-page";
  outlet.querySelectorAll("[data-panel]").forEach((p) => (p.__panel = new Panel(p)));
  outlet.querySelectorAll("[data-acc]").forEach(bindAcc);
  res?.mount?.(outlet);
  outlet.scrollTop = 0;
}

function bindAcc(root) {
  if (root.dataset.accBound) return;
  root.dataset.accBound = "1";
  root.addEventListener("click", (e) => {
    const h = e.target.closest(".acc-head");
    if (h) h.closest(".acc-item").classList.toggle("is-open");
  });
}

async function loadBoxes() {
  const r = await api.get(`/api/boxes?campus=${encodeURIComponent(state.campus)}`);
  state.boxes = r.data.boxes;
}

document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) return navigate("/box/" + open.dataset.open);
  const back = e.target.closest("[data-back]");
  if (back) return history.back();
  const tab = e.target.closest("[data-tab]");
  if (tab) return navigate("/" + tab.dataset.tab);
});

window.addEventListener("hashchange", render);

(async function boot() {
  const me = await api.get("/api/auth/me");
  if (me.data.user) {
    state.user = me.data.user;
    state.campus = me.data.user.campus || state.campus;
  }
  setClock();
  if (!location.hash || location.hash === "#") location.hash = state.user ? "#/home" : "#/login";
  await render();
})();
