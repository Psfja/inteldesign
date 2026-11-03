/* 食光机 · 学生 Web 端
   页面：首页 / 盲盒广场 / 盲盒详情 / 我的订单 / 碳账户 */

import {
  Master, Panel, api, accordionHTML, bindTree, confirmBox, el, empty, esc, fmt,
  html, modal, qs, qsa, raw, toast, treeHTML,
} from "./core.js";

const state = { user: null, campus: "", boxes: [], tree: [], meta: { campuses: [] } };

/* ================================================================ 母版定义 */
Master.define("web-topbar", () => {
  const u = state.user;
  const links = [
    ["/", "首页"],
    ["/square", "盲盒广场"],
    ["/orders", "我的订单"],
    ["/carbon", "碳账户"],
  ];
  return html`
    <header class="topbar">
      <div class="topbar-in">
        <a class="brand" href="#/" data-nav>
          <b>食光机</b>
          <span>校园余量餐食</span>
        </a>
        <nav class="nav">
          ${links.map(
            ([href, label]) =>
              html`<a href="#${href}" data-nav data-href="${href}">${label}</a>`
          )}
        </nav>
        <div class="topbar-right">
          <select class="campus-pick" data-campus aria-label="切换校区">
            ${state.meta.campuses.map(
              (c) => html`<option value="${c.name}" ${c.name === state.campus ? "selected" : ""}>${c.name}</option>`
            )}
          </select>
          ${u
            ? html`<span class="who"><span class="avatar">${u.name.slice(0, 1)}</span>${u.name}
                 <button class="btn btn-ghost btn-sm" data-logout>退出</button></span>`
            : html`<button class="btn btn-primary btn-sm" data-login>登录</button>`}
        </div>
      </div>
    </header>`;
});

Master.define("web-footer", () => html`
  <footer style="border-top:1px solid var(--line);margin-top:60px;padding:24px 0 0;color:var(--muted);font-size:13px">
    <div style="max-width:1180px;margin:0 auto;padding:0 28px;display:flex;gap:18px;flex-wrap:wrap">
      <span>食光机 · 校园余量餐食盲盒</span>
      <span>交互设计课程作业 · Web 端原型</span>
      <span style="margin-left:auto">数据为演示用种子数据</span>
    </div>
  </footer>`);

/* 盲盒卡片母版：首页、广场两处共用同一份结构 */
Master.define("box-card", (b) => html`
  <button class="box-card" data-open="${b.id}">
    <div class="box-cover ${b.remain <= 0 ? "is-out" : ""}">
      ${b.cover_emoji}
      <span class="tag ${b.remain <= 0 ? "tag-out" : b.percent_left <= 25 ? "tag-warn" : "tag-live"}">
        ${b.remain <= 0 ? "已售罄" : b.percent_left <= 25 ? `仅剩 ${b.remain} 份` : `${b.discount} 折`}
      </span>
    </div>
    <div class="box-body">
      <h3>${b.title}</h3>
      <div class="box-meta">
        <span>${b.canteen} · ${b.window || b.campus}</span>
        <span>取餐 ${b.pickup_start} – ${b.pickup_end}</span>
      </div>
      <div class="box-left">
        <span class="meter ${fmt.meterClass(b.percent_left)}"><i style="width:${b.percent_left}%"></i></span>
        <span>余 ${b.remain}/${b.total}</span>
      </div>
      <div class="box-price">
        <span class="now num"><i>¥</i>${fmt.yuan(b.price)}</span>
        <span class="was">¥${fmt.yuan(b.original_price)}</span>
      </div>
    </div>
  </button>`);

Master.define("code-card", (o) => html`
  <div class="code-card">
    <div>
      <small>取餐核销码 · 向档口出示</small>
      <div class="num mono">${o.pickup_code}</div>
    </div>
    <div style="text-align:right">
      <small>取餐时段</small>
      <div class="num" style="font-size:22px">${o.pickup_start} – ${o.pickup_end}</div>
    </div>
  </div>`);

/* 成长树：碳账户的记忆点，随等级长高 */
function treeSVG(level, progress) {
  const l = Math.max(1, Math.min(6, level));
  const blobs = [
    [100, 96, 34], [72, 118, 26], [128, 116, 27], [100, 66, 24], [80, 82, 19], [122, 84, 18],
  ].slice(0, 1 + l);
  const fruit = l >= 4;
  return html`<svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="碳积分成长树，当前第 ${l} 级">
    <ellipse cx="100" cy="176" rx="46" ry="8" fill="#24503c" opacity=".14"/>
    <path d="M100 178 L100 108" stroke="#6b4f2a" stroke-width="9" stroke-linecap="round"/>
    ${l >= 3 ? raw(`<path d="M100 140 L74 120 M100 132 L126 116" stroke="#6b4f2a" stroke-width="6" stroke-linecap="round"/>`) : ""}
    ${blobs.map(
      ([cx, cy, r], i) =>
        html`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i === 0 ? "#2f6b4f" : i % 2 ? "#3a7d5b" : "#24503c"}" opacity="${0.92 - i * 0.04}"/>`
    )}
    ${fruit
      ? raw(`<circle cx="86" cy="92" r="5" fill="#f2c230"/><circle cx="118" cy="76" r="4.5" fill="#f2c230"/><circle cx="104" cy="126" r="4" fill="#f2c230"/>`)
      : ""}
    <rect x="52" y="180" width="${Math.round(96 * progress)}" height="4" rx="2" fill="#f2c230"/>
    <rect x="52" y="180" width="96" height="4" rx="2" fill="none" stroke="rgba(242,194,48,.35)"/>
  </svg>`;
}

/* ================================================================ 视图：首页 */
async function viewHome() {
  if (!state.boxes.length) await loadBoxes();
  const avail = state.boxes.filter((b) => b.status === "active" && b.remain > 0);
  const totalLeft = avail.reduce((s, b) => s + b.remain, 0);
  const avgDiscount = avail.length
    ? (avail.reduce((s, b) => s + b.discount, 0) / avail.length).toFixed(1)
    : "0";
  const carbon = avail.reduce((s, b) => s + b.remain * b.carbon_g, 0);
  const faq = await api.get("/api/faqs");

  return {
    html: html`
      <section class="hero">
        <div>
          <h1>把食堂今天的<span class="mark-line">余量</span>，<br />装进盲盒带回家。</h1>
          <p class="hero-sub">
            闭餐前一小时，档口把当日没卖完的热菜打包成盲盒，半价左右带走。
            你省下一顿饭钱，这些食物也不用进泔水桶。
          </p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" data-goto-square>看看今天有什么</button>
            <button class="btn btn-ghost btn-lg" data-scroll-how>它怎么运作</button>
          </div>
        </div>
        <div class="hero-facts">
          <div class="hero-fact">
            <b class="num">${totalLeft}</b><span>份 · ${state.campus}今日余量</span>
          </div>
          <div class="hero-fact">
            <b class="num">${avgDiscount}</b><span>折 · 平均到手价</span>
          </div>
          <div class="hero-fact is-carbon">
            <b class="num">${fmt.kg(carbon)}</b><span>千克 · 今天可被救下的碳排</span>
          </div>
        </div>
      </section>

      <div class="sec-head" id="today">
        <h2>今日盲盒</h2>
        <p>按当前校区「${state.campus}」筛选，取餐时间到了就得快一点</p>
        <button class="more" data-goto-square>全部 ${state.boxes.length} 个</button>
      </div>
      ${avail.length
        ? html`<div class="box-grid">${avail.slice(0, 6).map((b) => raw(Master.render("box-card", b)))}</div>`
        : empty("🍽️", "这个校区今天的盲盒都卖完了", html`<button class="btn btn-ghost" data-goto-square>换个校区看看</button>`)}

      <div class="sec-head" id="how"><h2>它怎么运作</h2></div>
      <div class="box-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="card" style="padding:20px">
          <div class="num" style="font-size:28px;color:var(--moss)">选</div>
          <h3 style="margin:8px 0 6px;font-size:16px">挑一个档口的盲盒</h3>
          <p class="muted small">卡片上写清了品类范围、取餐时段和剩余份数，不用猜。</p>
        </div>
        <div class="card" style="padding:20px">
          <div class="num" style="font-size:28px;color:var(--moss)">订</div>
          <h3 style="margin:8px 0 6px;font-size:16px">在线预订并支付</h3>
          <p class="muted small">下单即锁份，生成 6 位核销码，档口那边同步减少余量。</p>
        </div>
        <div class="card" style="padding:20px">
          <div class="num" style="font-size:28px;color:var(--moss)">取</div>
          <h3 style="margin:8px 0 6px;font-size:16px">按时到窗口扫码</h3>
          <p class="muted small">核销完成，减碳量与碳积分立刻到账，可在碳账户里查看。</p>
        </div>
      </div>

      <div class="sec-head" id="faq"><h2>常见问题</h2><p>点开看看</p></div>
      <div style="max-width:760px">${raw(accordionHTML(faq.data.groups.flatMap((g) => g.items.slice(0, 2).map((i) => ({ q: i.q, a: i.a })))))}</div>
    `,
    mount(root) {
      root.querySelector("[data-goto-square]")?.addEventListener("click", () => (location.hash = "#/square"));
      root.querySelector("[data-scroll-how]")?.addEventListener("click", () =>
        document.getElementById("how")?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    },
  };
}

/* ================================================================ 视图：广场 */
async function viewSquare({ params }) {
  await loadBoxes();
  await loadTree();
  const stateFilter = { top: params.get("top") || "", sub: "", keyword: "", sort: "", only: false };

  function filter() {
    return state.boxes.filter((b) => {
      if (stateFilter.top && b.parent_category_name !== stateFilter.top) return false;
      if (stateFilter.sub && b.category_name !== stateFilter.sub) return false;
      if (stateFilter.only && !(b.status === "active" && b.remain > 0)) return false;
      if (stateFilter.keyword) {
        const k = stateFilter.keyword.toLowerCase();
        if (!`${b.title}${b.subtitle}${b.canteen}`.toLowerCase().includes(k)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (stateFilter.sort === "price") return a.price - b.price;
      if (stateFilter.sort === "left") return b.remain - a.remain;
      return (b.status === "active" && b.remain > 0 ? 1 : 0) - (a.status === "active" && a.remain > 0 ? 1 : 0);
    });
  }

  function gridHTML() {
    const list = filter();
    if (!list.length) return empty("🔍", "没有符合条件的盲盒", html`<button class="btn btn-ghost" data-reset>清空筛选</button>`);
    return html`<div class="box-grid">${list.map((b) => raw(Master.render("box-card", b)))}</div>`;
  }

  return {
    html: html`
      <div class="square">
        <aside class="filters">
          <div class="filter-block">
            <h4>按餐段</h4>
            <div data-tree data-single="1">${raw(treeHTML(state.tree))}</div>
          </div>
          <div class="filter-block">
            <h4>其它</h4>
            <div class="chips">
              <button class="chip" aria-pressed="false" data-only>只看有货</button>
              <button class="chip" aria-pressed="false" data-sort="price">价格低到高</button>
              <button class="chip" aria-pressed="false" data-sort="left">余量多到少</button>
            </div>
          </div>
        </aside>
        <div>
          <div class="square-head">
            <h2>盲盒广场</h2>
            <span class="count" data-count></span>
            <div class="searchbar">
              <input class="input" placeholder="搜盲盒或档口" data-kw />
            </div>
          </div>
          <div data-grid>${raw(gridHTML())}</div>
        </div>
      </div>`,
    mount(root) {
      const grid = qs("[data-grid]", root);
      const count = qs("[data-count]", root);
      const redraw = () => {
        grid.innerHTML = gridHTML();
        count.textContent = `共 ${filter().length} 个`;
      };
      redraw();

      bindTree(qs("[data-tree]", root), {
        single: true,
        onSelect({ node }) {
          const byId = findCategory(node.dataset.id);
          if (!byId) return;
          if (byId.parent_id) {
            stateFilter.sub = stateFilter.sub === byId.name ? "" : byId.name;
          } else {
            stateFilter.top = stateFilter.top === byId.name ? "" : byId.name;
          }
          redraw();
        },
      });

      qs("[data-kw]", root).addEventListener("input", (e) => {
        stateFilter.keyword = e.target.value.trim();
        redraw();
      });
      qsa("[data-sort]", root).forEach((btn) =>
        btn.addEventListener("click", () => {
          const v = btn.dataset.sort;
          const on = stateFilter.sort !== v;
          stateFilter.sort = on ? v : "";
          qsa("[data-sort]", root).forEach((b) => b.setAttribute("aria-pressed", b.dataset.sort === stateFilter.sort ? "true" : "false"));
          redraw();
        })
      );
      qs("[data-only]", root).addEventListener("click", (e) => {
        stateFilter.only = !stateFilter.only;
        e.currentTarget.setAttribute("aria-pressed", stateFilter.only ? "true" : "false");
        redraw();
      });
      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-reset]")) {
          Object.assign(stateFilter, { top: "", sub: "", keyword: "", sort: "", only: false });
          qs("[data-kw]", root).value = "";
          qsa("[data-tree] .tree-node", root).forEach((n) => n.classList.remove("is-open", "is-active"));
          qsa(".chip", root).forEach((c) => c.setAttribute("aria-pressed", "false"));
          redraw();
        }
      });
    },
  };
}

let _flatCats = [];
async function loadTree() {
  if (!_flatCats.length) {
    const r = await api.get("/api/categories");
    state.tree = r.data.tree;
    const flat = [];
    const walk = (ns) => ns.forEach((n) => (flat.push(n), walk(n.children || [])));
    walk(state.tree);
    _flatCats = flat;
  }
  return _flatCats;
}
const findCategory = (id) => _flatCats.find((c) => String(c.id) === String(id));

/* ================================================================ 视图：详情 */
async function viewBox({ args }) {
  const r = await api.get(`/api/boxes/${args.id}`);
  const b = r.data;
  const soldOut = b.remain <= 0 || b.status !== "active";

  return {
    html: html`
      <div style="margin-bottom:18px" class="crumb small muted">
        <a href="#/square" data-nav>盲盒广场</a> / ${b.campus} / ${b.canteen}
      </div>
      <div class="detail">
        <div>
          <div class="detail-cover">${b.cover_emoji}</div>
          <div class="panel-card" style="margin-top:18px">
            <header><h3>盲盒里可能有什么</h3></header>
            <p class="muted small">由 ${b.canteen} 在闭餐前打包，下列菜品为常见组合，实际以当日余量为准。</p>
            <div class="dish-chips">
              ${b.dishes.length
                ? b.dishes.map((d) => html`<span class="dish-chip">${d.emoji} ${d.name}</span>`)
                : html`<span class="muted small">该档口暂未登记菜品</span>`}
            </div>
          </div>
        </div>
        <div>
          <h1>${b.title}</h1>
          <p class="detail-sub">${b.subtitle}</p>

          <div class="price-block">
            <span class="now num"><i>¥</i>${fmt.yuan(b.price)}</span>
            <span class="was">¥${fmt.yuan(b.original_price)}</span>
            <span class="tag ${soldOut ? "tag-out" : "tag-live"}">${soldOut ? "已售罄" : b.discount + " 折"}</span>
            <span style="margin-left:auto" class="small muted">已售 ${b.sold} / ${b.total}</span>
          </div>

          <div class="info-rows">
            <div class="info-row"><b>档口</b><div>${b.canteen}<span class="muted"> · ${b.window}</span></div></div>
            <div class="info-row"><b>取餐</b><div>${b.pickup_start} – ${b.pickup_end}<span class="muted"> · 错过自动退款</span></div></div>
            <div class="info-row"><b>减碳</b><div>约 ${b.carbon_g} 克<span class="muted"> · 折合 ${Math.floor(b.carbon_g / 10)} 碳积分</span></div></div>
            <div class="info-row"><b>分类</b><div>${b.category_path || "未分类"}</div></div>
          </div>

          <div class="buy-bar">
            <div class="stepper">
              <button data-minus aria-label="减少">−</button>
              <span data-qty>1</span>
              <button data-plus aria-label="增加">+</button>
            </div>
            <button class="btn btn-primary" data-buy ${soldOut ? "disabled" : ""}>
              ${soldOut ? "已经卖完了" : "立即预订"}
            </button>
            <span class="small muted" data-total>合计 ¥${fmt.yuan(b.price)}</span>
          </div>
        </div>
      </div>

      <div class="sec-head"><h2>下单前了解清楚</h2></div>
      <div class="card" style="padding:22px">
        <div class="panel-tabs" style="margin-bottom:16px">
          <button data-goto="0" aria-selected="true">图文详情</button>
          <button data-goto="1" aria-selected="false">取餐须知</button>
          <button data-goto="2" aria-selected="false">同学评价 ${b.review_count ? `(${b.review_count})` : ""}</button>
        </div>
        <div data-panel data-mode="fade">
          <div data-state>
            <p class="small" style="line-height:1.9">
              ${b.canteen_intro || "该档口暂无介绍。"}<br /><br />
              每一个盲盒都是当日现做的完整一份正餐，不是临期食品。档口在闭餐前把没卖完的菜品按需组合打包，
              你拿到手时可以正常加热食用。若遇到过敏食材，取餐时告知窗口可现场更换等价菜品。
            </p>
          </div>
          <div data-state>
            <ul style="line-height:2;font-size:14px">
              <li>取餐时段 <b>${b.pickup_start} – ${b.pickup_end}</b>，请在时段内到 ${b.window || b.canteen} 领取。</li>
              <li>向工作人员出示订单里的 6 位核销码，或报手机号后四位。</li>
              <li>错过取餐时间订单自动失效，费用原路退回，碳积分不会扣除。</li>
              <li>可以给同学代取：把核销码截图发给对方即可。</li>
            </ul>
          </div>
          <div data-state>
            ${b.reviews.length
              ? raw(
                  b.reviews
                    .map(
                      (rv) => html`<div class="review">
                        <div class="review-top">
                          <b>${rv.name}</b><span class="stars">${fmt.stars(rv.rating)}</span>
                          <span style="margin-left:auto">${fmt.ago(rv.created_at)}</span>
                        </div>
                        <p>${rv.text}</p>
                      </div>`
                    )
                    .join("")
                )
              : empty("💬", "还没有人评价这个盲盒")}
          </div>
        </div>
      </div>`,
    mount(root) {
      let qty = 1;
      const qtyEl = qs("[data-qty]", root);
      const totalEl = qs("[data-total]", root);
      const sync = () => {
        qtyEl.textContent = qty;
        totalEl.textContent = `合计 ¥${fmt.yuan(b.price * qty)}`;
      };
      qs("[data-minus]", root).addEventListener("click", () => (qty = Math.max(1, qty - 1), sync()));
      qs("[data-plus]", root).addEventListener("click", () => (qty = Math.min(Math.min(5, b.remain || 1), qty + 1), sync()));
      qs("[data-buy]", root).addEventListener("click", () => book(b, qty));
    },
  };
}

/* ================================================================ 视图：订单 */
async function viewOrders() {
  if (!state.user) return requireLoginView("查看我的订单");
  const r = await api.get("/api/orders?status=all");
  const { orders, counts } = r.data;

  const card = (o) => html`
    <div class="order-card">
      <div class="order-emoji">${o.cover_emoji}</div>
      <div>
        <h3>${o.title}</h3>
        <div class="order-meta">
          <span>${o.canteen} · ${o.window}</span>
          <span>下单 ${fmt.ago(o.created_at)}</span>
          <span>${o.qty} 份 · 实付 ¥${o.amount_yuan}</span>
          <span class="${o.status === "done" ? "tag" : o.status === "booked" ? "tag tag-live" : "tag tag-out"}">
            ${o.status === "done" ? "已取餐" : o.status === "booked" ? "待取餐" : "已取消"}
          </span>
        </div>
        ${o.status === "booked" ? raw(`<div style="margin-top:12px">${Master.render("code-card", o)}</div>`) : ""}
      </div>
      <div class="order-actions">
        ${o.status === "booked"
          ? html`<button class="btn btn-ghost btn-sm" data-cancel="${o.id}">取消订单</button>`
          : ""}
        ${o.status === "done" ? html`<span class="tag">+${o.points} 碳积分</span>` : ""}
        <button class="btn btn-ghost btn-sm" data-again="${o.box_id}">再订一次</button>
      </div>
    </div>`;

  const tab = (key, label) => html`<button data-goto="${["booked", "done", "cancelled"].indexOf(key)}" aria-selected="${key === "booked" ? "true" : "false"}">${label} ${counts[key]}</button>`;

  return {
    html: html`
      <div class="page-head"><div><h1>我的订单</h1><p>待取餐的订单会显示核销码，记得按时去窗口</p></div></div>
      <div class="panel-tabs" style="margin-bottom:18px" data-order-tabs>
        ${raw(tab("booked", "待取餐"))}${raw(tab("done", "已取餐"))}${raw(tab("cancelled", "已取消"))}
      </div>
      <div data-panel data-mode="fade">
        ${raw(["booked", "done", "cancelled"].map((k) => {
          const list = orders.filter((o) => o.status === k);
          return `<div data-state>${
            list.length
              ? list.map(card).join("")
              : empty(
                  k === "booked" ? "🧺" : k === "done" ? "🌱" : "🍃",
                  k === "booked" ? "还没有待取餐的订单" : k === "done" ? "完成第一单，就能拿到碳积分" : "没有取消过的订单",
                  k === "booked" ? html`<button class="btn btn-primary" data-goto-square>去挑一个</button>` : ""
                )
          }</div>`;
        }).join(""))}
      </div>`,
    mount(root) {
      qs("[data-order-tabs]", root).addEventListener("click", (e) => {
        const b = e.target.closest("[data-goto]");
        if (b) qs("[data-panel]", root).__panel?.go(Number(b.dataset.goto), b);
      });
      root.addEventListener("click", async (e) => {
        const cancel = e.target.closest("[data-cancel]");
        if (cancel) {
          const yes = await confirmBox({ title: "取消这笔订单？", text: "取消后份数会退回盲盒池，费用原路退回。", okText: "取消订单", danger: true });
          if (!yes) return;
          try {
            const r = await api.post(`/api/orders/${cancel.dataset.cancel}/cancel`);
            toast(r.message, "is-good");
            location.hash = "#/orders?t=" + Date.now();
          } catch (err) {
            toast(err.message, "is-bad");
          }
        }
        const again = e.target.closest("[data-again]");
        if (again) location.hash = "#/box/" + again.dataset.again;
      });
    },
  };
}

/* ================================================================ 视图：碳账户 */
async function viewCarbon() {
  if (!state.user) return requireLoginView("查看碳账户");
  const [c, board, rewards] = await Promise.all([
    api.get("/api/carbon"),
    api.get("/api/carbon/leaderboard"),
    api.get("/api/rewards"),
  ]);
  const me = c.data;
  const lv = me.level;

  return {
    html: html`
      <div class="page-head"><div><h1>碳账户</h1><p>每完成一次取餐，被救下的食物会折算成碳积分</p></div></div>

      <section class="carbon-hero">
        <div class="tree-wrap">${raw(treeSVG(lv.level, lv.progress))}</div>
        <div>
          <div class="big-num num">${me.points_all}</div>
          <div class="sub">累计碳积分 · 当前等级 ${lv.emoji} ${lv.name}（第 ${lv.level} 级）</div>
          <div class="level-bar">
            <div class="meter"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
            <div class="level-meta">
              <span>${lv.name}</span>
              <span>${lv.to_next ? `再 ${lv.to_next} 分升级为${lv.next_name}` : "已达最高等级"}</span>
            </div>
          </div>
          <div style="display:flex;gap:34px;margin-top:22px;flex-wrap:wrap">
            <div><div class="num" style="font-size:26px;color:var(--butter)">${me.points}</div><div class="sub">可用积分</div></div>
            <div><div class="num" style="font-size:26px">${fmt.kg(me.carbon_g)}</div><div class="sub">千克 · 累计减碳</div></div>
            <div><div class="num" style="font-size:26px">${me.saved_meals}</div><div class="sub">份 · 救下的餐食</div></div>
            <div><div class="num" style="font-size:26px">第 ${me.rank}</div><div class="sub">名 · 校内排名</div></div>
          </div>
        </div>
      </section>

      <div class="carbon-grid">
        <div>
          <div class="sec-head" style="margin-top:0"><h2>积分流水</h2></div>
          ${me.logs.length
            ? me.logs.map(
                (l) => html`<div class="log">
                  <span class="delta ${l.delta >= 0 ? "plus" : "minus"}">${l.delta >= 0 ? "+" : ""}${l.delta}</span>
                  <span class="why">${l.reason}</span>
                  <span class="when">${fmt.ago(l.created_at)}</span>
                </div>`
              )
            : empty("🌱", "还没有积分记录")}
        </div>
        <div>
          <div class="sec-head" style="margin-top:0"><h2>校内减碳榜</h2></div>
          ${board.data.board.map(
            (r) => html`<div class="rank-row ${r.id === board.data.me_id ? "is-me" : ""}">
              <span class="rank-no">${r.rank}</span>
              <span class="rank-name">${r.name}<span class="muted tiny"> · ${r.campus}</span></span>
              <span class="rank-num">${r.points_all}</span>
            </div>`
          )}
        </div>
      </div>

      <div class="sec-head">
        <h2>积分兑换</h2>
        <div class="panel-tabs" style="margin-left:auto" data-reward-tabs>
          <button data-goto="0" aria-selected="true">可兑换</button>
          <button data-goto="1" aria-selected="false">我的权益</button>
        </div>
      </div>
      <div data-panel data-mode="fade">
        <div data-state>
          <div class="card" style="padding:6px 20px" data-rewards>
            ${raw(
              rewards.data.rewards
                .map(
                  (w) => html`<div class="reward">
                    <div class="reward-emoji">${w.emoji}</div>
                    <div class="reward-main"><h4>${w.name}</h4><p>${w.intro} · 剩 ${w.stock}</p></div>
                    <span class="reward-cost">${w.points}</span>
                    <button class="btn ${me.points >= w.points ? "btn-butter" : "btn-ghost"} btn-sm" data-redeem="${w.id}" ${me.points < w.points || w.stock <= 0 ? "disabled" : ""}>
                      ${w.stock <= 0 ? "已换完" : me.points >= w.points ? "兑换" : "积分不够"}
                    </button>
                  </div>`
                )
                .join("")
            )}
          </div>
        </div>
        <div data-state data-mine>${raw(empty("🎁", "正在加载…"))}</div>
      </div>`,
    async mount(root) {
      const panel = qs("[data-panel]", root).__panel;
      qs("[data-reward-tabs]", root).addEventListener("click", (e) => {
        const b = e.target.closest("[data-goto]");
        if (b) panel.go(Number(b.dataset.goto), b);
      });
      const mineEl = qs("[data-mine]", root);
      const loadMine = async () => {
        const r = await api.get("/api/my/redemptions");
        mineEl.innerHTML = r.data.items.length
          ? r.data.items
              .map(
                (i) => html`<div class="reward">
                  <div class="reward-emoji">${i.emoji}</div>
                  <div class="reward-main"><h4>${i.name}</h4><p>使用码 ${i.code} · ${fmt.ago(i.created_at)}</p></div>
                  <span class="tag ${i.used ? "tag-out" : "tag-live"}">${i.used ? "已使用" : "待使用"}</span>
                </div>`
              )
              .join("")
          : empty("🎁", "还没有兑换过权益");
      };
      panel.onChange = (i) => i === 1 && loadMine();

      root.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-redeem]");
        if (!btn) return;
        const yes = await confirmBox({ title: "确认兑换？", text: "兑换后积分立即扣除，权益可在「我的权益」里查看。", okText: "确认兑换" });
        if (!yes) return;
        try {
          const r = await api.post(`/api/rewards/${btn.dataset.redeem}/redeem`);
          toast(r.message, "is-good");
          location.hash = "#/carbon?t=" + Date.now();
        } catch (err) {
          toast(err.message, "is-bad");
        }
      });
    },
  };
}

/* ================================================================ 通用 */
function requireLoginView(reason) {
  return {
    html: empty(
      "🔑",
      `登录后${reason}`,
      html`<button class="btn btn-primary" data-login>立即登录</button>`
    ),
  };
}

async function book(box, qty) {
  if (!state.user) {
    openLogin();
    return;
  }
  modal({
    title: "确认预订",
    body: html`
      <p class="muted small" style="margin-bottom:14px">${box.title}</p>
      <div class="info-rows" style="margin:0">
        <div class="info-row"><b>档口</b><div>${box.canteen} · ${box.window}</div></div>
        <div class="info-row"><b>取餐</b><div>${box.pickup_start} – ${box.pickup_end}</div></div>
        <div class="info-row"><b>数量</b><div>${qty} 份</div></div>
        <div class="info-row"><b>应付</b><div class="num" style="font-size:20px;color:var(--tomato)">¥${fmt.yuan(box.price * qty)}</div></div>
        <div class="info-row"><b>预计</b><div>减碳 ${box.carbon_g * qty} 克 · 得 ${Math.floor((box.carbon_g * qty) / 10)} 碳积分</div></div>
      </div>
      <p class="tiny muted" style="margin-top:12px">演示环境不产生真实支付，点击确认即完成下单。</p>`,
    okText: "确认支付并预订",
    async onOk() {
      try {
        const r = await api.post("/api/orders", { box_id: box.id, qty });
        toast(r.message, "is-good");
        location.hash = "#/orders?t=" + Date.now();
      } catch (err) {
        toast(err.message, "is-bad");
        return false;
      }
    },
  });
}

export function openLogin() {
  modal({
    title: "登录食光机",
    body: html`
      <p class="muted small" style="margin-bottom:16px">演示环境：输入任意 11 位手机号即可登录，未注册的号码会自动创建学生账号。</p>
      <label class="field"><span>手机号</span><input class="input" data-phone placeholder="18800000001" maxlength="11" inputmode="numeric" /></label>
      <p class="tiny muted">试试已注册的同学：18800000001（林小满），已有订单和碳积分。</p>`,
    okText: "登录",
    async onOk(wrap) {
      const phone = wrap.querySelector("[data-phone]").value.trim();
      if (!/^\d{11}$/.test(phone)) {
        toast("请输入 11 位手机号", "is-bad");
        return true;
      }
      try {
        const r = await api.post("/api/auth/login", { phone, role: "student", campus: state.campus });
        state.user = r.data.user;
        toast(`欢迎，${state.user.name}`, "is-good");
        renderChrome();
        location.hash = "#/?t=" + Date.now();
      } catch (err) {
        toast(err.message, "is-bad");
        return true;
      }
    },
  });
}

/* ================================================================ 启动 */
async function loadBoxes() {
  const r = await api.get(`/api/boxes?campus=${encodeURIComponent(state.campus || "中心校区")}`);
  state.boxes = r.data.boxes;
}

async function boot() {
  const meta = await api.get("/api/meta");
  state.meta = meta.data;
  state.campus = state.meta.campuses[0]?.name || "中心校区";
  const me = await api.get("/api/auth/me");
  state.user = me.data.user;

  const app = qs("#app");
  app.innerHTML = html`
    <div data-topbar></div>
    <main class="shell" data-outlet></main>
    <div data-footer></div>`;

  const router = createRouterLocal({
    routes: [
      { path: "/", view: viewHome },
      { path: "/square", view: viewSquare },
      { path: "/box/:id", view: viewBox },
      { path: "/orders", view: viewOrders },
      { path: "/carbon", view: viewCarbon },
    ],
    outlet: qs("[data-outlet]", app),
  });

  window.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) location.hash = "#/box/" + open.dataset.open;
  });

  renderChrome();
  router.start();
}

function renderChrome() {
  qs("[data-topbar]").innerHTML = Master.render("web-topbar");
  qs("[data-footer]").innerHTML = Master.render("web-footer");
  qs("[data-outlet]").style.minHeight = "60vh";
  const pick = qs("[data-campus]");
  pick?.addEventListener("change", async (e) => {
    state.campus = e.target.value;
    await loadBoxes();
    location.hash = "#/square";
  });
}

/* 简易路由（Web 端） */
function createRouterLocal({ routes, outlet }) {
  async function render() {
    const rawHash = location.hash.replace(/^#/, "") || "/";
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
    const view = hit ? hit.route.view : viewHome;
    outlet.innerHTML = `<div class="skeleton" style="height:70vh"></div>`;
    let res;
    try {
      res = await view({ args: hit?.args || {}, params });
    } catch (err) {
      res = { html: empty("😵", err.message || "页面加载失败") };
    }
    outlet.innerHTML = typeof res === "string" ? res : res.html;
    // 先建好动态面板，页面 mount 里才能直接拿到 panel 实例
    outlet.querySelectorAll("[data-panel]").forEach((p) => (p.__panel = new Panel(p)));
    outlet.querySelectorAll("[data-tree]").forEach((t) => bindTree(t));
    outlet.querySelectorAll("[data-acc]").forEach((a) => bindAccordionLocal(a));
    res.mount?.(outlet);
    qsa("[data-nav][data-href]").forEach((a) =>
      a.classList.toggle("is-active", (location.hash.replace(/^#/, "").split("?")[0] || "/") === a.dataset.href)
    );
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", render);
  return { start: render };
}

function bindAccordionLocal(root) {
  if (root.dataset.accBound) return;
  root.dataset.accBound = "1";
  root.addEventListener("click", (e) => {
    const head = e.target.closest(".acc-head");
    if (!head) return;
    head.closest(".acc-item").classList.toggle("is-open");
  });
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-login]")) openLogin();
  if (e.target.closest("[data-logout]")) {
    api.post("/api/auth/logout").then(() => {
      state.user = null;
      renderChrome();
      location.hash = "#/";
      toast("已退出登录");
    });
  }
  if (e.target.closest("[data-goto-square]")) location.hash = "#/square";
});

boot();
