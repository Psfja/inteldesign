/* 食光机 · 前端内核
   包含：请求封装、模板、路由、「动态面板」（对应 Axure Dynamic Panel）、
   「母版」注册表、树 / 手风琴（展开折叠节点）、Toast、Modal、图表。 */

/* ---------------------------------------------------------------- 模板 */
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const RAW = Symbol("raw");
export const raw = (s) => ({ [RAW]: String(s ?? "") });

/* html`` 的返回值会被打上 RAW 标记：
   这样「模板里套模板」不会被二次转义，而普通字符串仍然自动转义。 */
function mark(str) {
  const box = new String(str);
  Object.defineProperty(box, RAW, { value: str, enumerable: false, configurable: true });
  return box;
}

function stringify(v) {
  if (v == null || v === false || v === true) return "";
  if (Array.isArray(v)) return v.map(stringify).join("");
  if (typeof v === "object" && RAW in v) return v[RAW];
  if (typeof v === "string") return esc(v);
  return esc(v);
}

export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => {
    out += s + (i < vals.length ? stringify(vals[i]) : "");
  });
  return mark(out);
}

export function el(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

/* ---------------------------------------------------------------- 请求 */
async function request(method, url, body) {
  const opt = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(url, opt);
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error("服务器返回异常，请稍后再试");
  }
  if (!json.ok) throw new Error(json.message || "请求失败");
  return json;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body ?? {}),
  put: (url, body) => request("PUT", url, body ?? {}),
  del: (url) => request("DELETE", url),
};

/* ---------------------------------------------------------------- 格式化 */
export const fmt = {
  yuan: (fen) => (Number(fen) / 100).toFixed(2).replace(/\.00$/, ""),
  kg: (g) => ((Number(g) || 0) / 1000).toFixed(1),
  ago(str) {
    if (!str) return "";
    const t = new Date(String(str).replace(/-/g, "/")).getTime();
    if (Number.isNaN(t)) return String(str);
    const diff = Math.floor((Date.now() - t) / 1000);
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 天前";
    return String(str).slice(5, 10);
  },
  clock(str) {
    if (!str) return "";
    const d = new Date(String(str).replace(/-/g, "/"));
    return Number.isNaN(d.getTime()) ? String(str) : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  },
  meterClass(percent) {
    return percent <= 20 ? "is-low" : percent <= 50 ? "is-mid" : "";
  },
  stars(n) {
    return "★".repeat(Math.round(n || 0)) + "☆".repeat(5 - Math.round(n || 0));
  },
};

/* ---------------------------------------------------------------- 路由 */
export function createRouter({ routes, outlet, onNavigate, notFound }) {
  function current() {
    const rawHash = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = rawHash.split("?");
    return { path: path || "/", params: new URLSearchParams(qs || "") };
  }

  function match(path) {
    for (const r of routes) {
      const names = [];
      const pattern = r.path.replace(/:([A-Za-z0-9_]+)/g, (_, n) => {
        names.push(n);
        return "([^/]+)";
      });
      const m = new RegExp("^" + pattern + "$").exec(path);
      if (m) {
        const args = {};
        names.forEach((n, i) => (args[n] = decodeURIComponent(m[i + 1])));
        return { route: r, args };
      }
    }
    return null;
  }

  let dispose = null;

  async function render() {
    const { path, params } = current();
    const hit = match(path);
    if (dispose) {
      try { dispose(); } catch (e) { /* noop */ }
      dispose = null;
    }
    const view = hit ? hit.route.view : notFound;
    const r = await view({ args: hit ? hit.args : {}, params, navigate });
    outlet.innerHTML = "";
    if (typeof r === "string") outlet.innerHTML = r;
    else if (r && r.nodeType === 1) outlet.appendChild(r);
    else if (r && r.html !== undefined) outlet.innerHTML = r.html;
    if (r && typeof r.mount === "function") dispose = r.mount(outlet) || null;
    outlet.querySelectorAll("[data-panel]").forEach((p) => new Panel(p));
    outlet.querySelectorAll("[data-tree]").forEach((t) => bindTree(t));
    outlet.querySelectorAll("[data-acc]").forEach((a) => bindAccordion(a));
    if (onNavigate) onNavigate({ path, params, route: hit ? hit.route : null });
    outlet.scrollTop = 0;
  }

  function navigate(to, { replace = false } = {}) {
    const target = to.startsWith("#") ? to : "#" + to;
    if (replace) location.replace(target);
    else location.hash = target;
  }

  window.addEventListener("hashchange", render);
  return { start: render, navigate, current };
}

/* ------------------------------------------------- 动态面板（Axure Dynamic Panel）
   用法：
     <div data-panel data-mode="fade|slide">
       <div data-state>状态一</div>
       <div data-state>状态二</div>
     </div>
   切换器：容器内部任意 <button data-goto="1">
   JS：new Panel(el)；panel.go(1)；panel.onChange = (i) => {}
------------------------------------------------------------------------------ */
export class Panel {
  constructor(root) {
    this.root = root;
    this.mode = root.dataset.mode || "fade";
    this.states = Array.from(root.querySelectorAll(":scope > [data-state]"));
    this.onChange = null;
    root.classList.add("panel");

    let start = this.states.findIndex((s) => s.classList.contains("is-active"));
    if (start < 0) start = 0;
    this.index = start;

    if (this.mode === "slide") {
      const track = document.createElement("div");
      track.className = "panel-track";
      this.states.forEach((s) => track.appendChild(s));
      root.classList.add("panel-slide");
      root.style.overflow = "hidden";
      root.appendChild(track);
      this.track = track;
    } else {
      root.classList.add("panel-fade");
    }

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-goto]");
      if (!btn || !root.contains(btn)) return;
      const scope = btn.dataset.scope ? root.querySelector(btn.dataset.scope) : root;
      if (btn.dataset.scope && !scope) return;
      this.go(Number(btn.dataset.goto), btn);
    });

    this._apply(true);
  }

  get length() {
    return this.states.length;
  }

  go(i, trigger) {
    if (i < 0 || i >= this.states.length || i === this.index) return;
    this.index = i;
    this._apply(false);
    if (trigger) {
      const group = trigger.closest(".panel-tabs") || trigger.parentElement;
      if (group) {
        group.querySelectorAll("[data-goto]").forEach((b) => {
          const on = Number(b.dataset.goto) === i;
          b.setAttribute("aria-selected", on ? "true" : "false");
          if (b.classList.contains("chip")) b.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
    }
    this.root.querySelectorAll(".panel-tabs [data-goto]").forEach((b) => {
      b.setAttribute("aria-selected", Number(b.dataset.goto) === i ? "true" : "false");
    });
    if (this.onChange) this.onChange(i, this.states[i]);
  }

  _apply(first) {
    const i = this.index;
    if (this.mode === "slide") {
      this.track.classList.toggle("no-anim", !!first);
      this.track.style.transform = `translateX(${-i * 100}%)`;
      const setH = () => (this.root.style.height = this.states[i].offsetHeight + "px");
      if (first) requestAnimationFrame(setH);
      else setTimeout(setH, 220);
      this.states.forEach((s) => s.classList.remove("is-active"));
      this.states[i].classList.add("is-active");
    } else {
      this.states.forEach((s, k) => s.classList.toggle("is-active", k === i));
    }
  }
}

/* 切换器按钮常常放在面板外面（比如卡片头部的 Tab 条），
   这里做一层全局委托：向上找到最近的「直接子元素里含动态面板」的容器并切换。 */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-goto]");
  if (!btn || btn.closest("[data-panel]")) return; // 面板内部的按钮由 Panel 自己处理
  let node = btn.parentElement;
  while (node && node !== document.body) {
    const p = node.querySelector(":scope > [data-panel]");
    if (p && p.__panel) {
      p.__panel.go(Number(btn.dataset.goto), btn);
      return;
    }
    node = node.parentElement;
  }
});

/* ------------------------------------------------- 母版（Axure Master）
   母版是一次定义、多处复用的界面块。这里用一个注册表集中管理，
   页面通过 Master.render(name, ctx) 取到同一份结构，保证三端一致。 */
const masters = new Map();
export const Master = {
  define(name, render) {
    masters.set(name, render);
    return name;
  },
  render(name, ctx = {}) {
    const fn = masters.get(name);
    if (!fn) throw new Error("未定义的母版：" + name);
    return fn(ctx);
  },
  names() {
    return [...masters.keys()];
  },
};

/* ---------------------------------------------------------------- 树 / 手风琴 */
export function treeHTML(nodes, { activeId = null, renderActions = null, depth = 0 } = {}) {
  const walk = (list, d) =>
    list
      .map((n) => {
        const kids = n.children || [];
        const hasKids = kids.length > 0;
        const cls = ["tree-node", hasKids ? "" : "tree-leaf", activeId && String(activeId) === String(n.id) ? "is-open" : ""]
          .filter(Boolean)
          .join(" ");
        return html`<li class="${cls}" data-id="${n.id}" data-depth="${d}">
          <div class="tree-row" role="button" tabindex="0">
            <span class="tree-caret" aria-hidden="true">
              <svg viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            </span>
            <span class="tree-label">${n.name}${n.count ? raw(`<span class="muted tiny"> · ${n.count} 个</span>`) : ""}</span>
            ${renderActions ? raw(renderActions(n)) : ""}
          </div>
          ${hasKids ? html`<ul class="tree-children">${raw(walk(kids, d + 1))}</ul>` : ""}
        </li>`;
      })
      .join("");
  return html`<ul class="tree">${raw(walk(nodes, depth))}</ul>`;
}

/* 把一棵树绑成可展开折叠的交互控件 */
export function bindTree(root, { onSelect = null, single = false, openAll = false } = {}) {
  if (root.dataset.treeBound) return;
  root.dataset.treeBound = "1";
  if (openAll) root.querySelectorAll(".tree-node").forEach((n) => n.classList.add("is-open"));

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-no-toggle]")) return;
    const node = e.target.closest(".tree-node");
    if (!node || !root.contains(node)) return;
    const row = e.target.closest(".tree-row");
    if (!row) return;
    if (single) {
      const parentLi = node.parentElement?.closest(".tree-node");
      (parentLi || root).querySelectorAll(".tree-node.is-open").forEach((n) => {
        if (n !== node) n.classList.remove("is-open");
      });
    }
    if (node.querySelector(".tree-children")) node.classList.toggle("is-open");
    root.querySelectorAll(".tree-row").forEach((r) => r.classList.remove("is-active"));
    row.classList.add("is-active");
    if (onSelect) {
      const li = row.closest(".tree-node");
      onSelect({ id: li.dataset.id, name: li.querySelector(".tree-label")?.textContent.trim(), node: li });
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest(".tree-row");
    if (!row) return;
    e.preventDefault();
    row.click();
  });
}

export function accordionHTML(items, { openFirst = false } = {}) {
  return html`<div class="acc" data-acc>
    ${items.map(
      (it, i) => html`<div class="acc-item ${openFirst && i === 0 ? "is-open" : ""}">
        <button class="acc-head" type="button">
          <span class="acc-caret" aria-hidden="true">▸</span>
          <span>${it.q}</span>
        </button>
        <div class="acc-body">${it.a}</div>
      </div>`
    )}
  </div>`;
}

export function bindAccordion(root) {
  if (root.dataset.accBound) return;
  root.dataset.accBound = "1";
  root.addEventListener("click", (e) => {
    const head = e.target.closest(".acc-head");
    if (!head || !root.contains(head)) return;
    const item = head.closest(".acc-item");
    const single = root.dataset.single === "1";
    if (single) root.querySelectorAll(".acc-item.is-open").forEach((i) => i !== item && i.classList.remove("is-open"));
    item.classList.toggle("is-open");
  });
}

/* ---------------------------------------------------------------- Toast / Modal */
let toastStack = null;
export function toast(message, type = "") {
  if (!toastStack) {
    toastStack = document.createElement("div");
    toastStack.className = "toast-stack";
    document.body.appendChild(toastStack);
  }
  const t = el(html`<div class="toast ${type}"><span>${message}</span></div>`);
  toastStack.appendChild(t);
  setTimeout(() => {
    t.classList.add("is-out");
    setTimeout(() => t.remove(), 220);
  }, 2200);
}

export function modal({ title, body, okText = "确定", cancelText = "取消", onOk = null, danger = false, wide = false }) {
  const wrap = el(html`
    <div class="modal-backdrop">
      <div class="modal" style="${wide ? "max-width:620px" : ""}" role="dialog" aria-modal="true">
        ${title ? html`<h3>${title}</h3>` : ""}
        <div class="modal-body">${raw(body || "")}</div>
        <div class="modal-foot">
          ${cancelText ? html`<button class="btn btn-ghost" data-close>${cancelText}</button>` : ""}
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${okText}</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  const okBtn = wrap.querySelector("[data-ok]");
  okBtn?.addEventListener("click", async () => {
    if (!onOk) return close();
    okBtn.disabled = true;
    try {
      const keep = await onOk(wrap);
      if (!keep) close();
    } catch (err) {
      toast(err.message, "is-bad");
    } finally {
      okBtn.disabled = false;
    }
  });
  const escClose = (e) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", escClose);
    }
  };
  document.addEventListener("keydown", escClose);
  wrap.querySelector("input, textarea, [data-ok]")?.focus();
  return close;
}

export function confirmBox({ title, text, okText = "确定", danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const close = modal({
      title,
      body: html`<p class="muted">${text}</p>`,
      okText,
      cancelText: "再想想",
      danger,
      onOk: () => {
        done = true;
        resolve(true);
      },
    });
    const obs = new MutationObserver(() => {
      if (!document.body.contains(document.querySelector(".modal-backdrop")) && !done) {
        done = true;
        resolve(false);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

/* ---------------------------------------------------------------- 图表 */
export function comboChart({ labels, bars, line, barLabel, lineLabel, height = 190 }) {
  const w = 720, h = height, pad = { l: 34, r: 34, t: 12, b: 24 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const maxBar = Math.max(1, ...bars);
  const maxLine = Math.max(1, ...line);
  const step = iw / Math.max(1, labels.length - 1 || 1);
  const bw = Math.min(26, (iw / Math.max(1, labels.length)) * 0.42);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((p) => {
      const y = pad.t + ih * (1 - p);
      return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#e2dccd" stroke-width="1"/>`;
    })
    .join("");

  const rects = bars
    .map((v, i) => {
      const bh = (v / maxBar) * ih;
      const x = labels.length > 1 ? pad.l + step * i - bw / 2 : pad.l + iw / 2 - bw / 2;
      const y = pad.t + ih - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="3" fill="#2f6b4f" opacity=".82"><title>${v}</title></rect>`;
    })
    .join("");

  const pts = line.map((v, i) => {
    const x = labels.length > 1 ? pad.l + step * i : pad.l + iw / 2;
    const y = pad.t + ih - (v / maxLine) * ih;
    return [x, y];
  });
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = pts.length
    ? `${path} L${pts[pts.length - 1][0].toFixed(1)},${pad.t + ih} L${pts[0][0].toFixed(1)},${pad.t + ih} Z`
    : "";
  const dots = pts
    .map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="#fbf8f1" stroke="#d9a413" stroke-width="2"><title>${line[i]}</title></circle>`)
    .join("");
  const xlab = labels
    .map((l, i) => {
      const x = labels.length > 1 ? pad.l + step * i : pad.l + iw / 2;
      return `<text x="${x.toFixed(1)}" y="${h - 6}" font-size="11" fill="#93a094" text-anchor="middle">${esc(l)}</text>`;
    })
    .join("");

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(barLabel)}与${esc(lineLabel)}趋势">
    ${grid}
    <path d="${area}" fill="#d9a413" opacity=".12"/>
    ${rects}
    <path d="${path}" fill="none" stroke="#d9a413" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${xlab}
    <text x="${pad.l - 6}" y="${pad.t + 8}" font-size="10.5" fill="#93a094" text-anchor="end">${esc(String(Math.round(maxBar)))}</text>
    <text x="${pad.l - 6}" y="${pad.t + ih}" font-size="10.5" fill="#93a094" text-anchor="end">0</text>
  </svg>
  <div class="chart-legend">
    <span><i style="background:#2f6b4f"></i>${esc(barLabel)}</span>
    <span><i style="background:#d9a413"></i>${esc(lineLabel)}</span>
  </div>`;
}

/* ---------------------------------------------------------------- 其它 */
export function empty(emoji, text, actionHTML = "") {
  return html`<div class="empty"><span class="empty-emoji">${emoji}</span><p>${text}</p>${raw(actionHTML)}</div>`;
}

export function skeleton(rows = 3) {
  return Array.from({ length: rows })
    .map(() => html`<div class="skeleton" style="height:76px;margin-bottom:12px"></div>`)
    .join("");
}

export function debounce(fn, wait = 260) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}
