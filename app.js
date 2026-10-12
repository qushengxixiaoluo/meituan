// 校园食堂点评 · 全部交互逻辑（原生 JS，无依赖）
// 依赖 data.js 中的全局常量 CANTEENS / STALLS / DISHES / REVIEWS

(function () {
  "use strict";

  // ========== 工具 ==========
  function $(sel) { return document.querySelector(sel); }
  function stallOf(id) { return STALLS.find(s => s.id === id) || null; }
  function dishOf(id) { return DISHES.find(d => d.id === id) || null; }
  function canteenOf(id) { return CANTEENS.find(c => c.id === id) || null; }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 返回 5 个 span：Math.round(rating) 个实心 st-on，其余 st-off
  function starsHTML(rating, small) {
    const n = Math.round(Number(rating) || 0);
    let h = '<span class="stars' + (small ? " stars-sm" : "") + '">';
    for (let i = 1; i <= 5; i++) {
      h += '<span class="' + (i <= n ? "st-on" : "st-off") + '">★</span>';
    }
    h += "</span>";
    return h;
  }

  function toast(msg) {
    const box = $("#toastBox");
    if (!box) return;
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("show"), 20);
    setTimeout(() => t.remove(), 2400);
  }

  // ========== 常量 ==========
  // 避雷口径：全站统一（只看避雷筛选 / 避雷贴纸 / 首页本周避雷 / 避雷榜四处共用）
  const WARN_RATING = 3.4;

  // ========== 状态 ==========
  const state = {
    view: "home",
    canteenId: "c1",
    search: "",
    sort: "rating",
    onlyNew: false,
    onlyWarn: false,
    minRating: 0,
    maxPrice: 0,
    expanded: {},
    favorites: new Set(),
    myReviews: [],
    rankTab: "new",
    currentDishId: null,
    form: { stars: 0, taste: 0, value: 0, tags: [] }
  };

  // expanded 默认：当前食堂第一个窗口展开
  (function initExpanded() {
    const first = STALLS.find(s => s.canteenId === state.canteenId);
    if (first) state.expanded[first.id] = true;
  })();

  // ========== 筛选 / 排序 / 搜索 ==========
  function haystackOf(d) {
    const st = stallOf(d.stallId);
    const c = st ? canteenOf(st.canteenId) : null;
    return [
      d.name,
      st ? st.name : "",
      c ? c.name : "",
      st ? st.cuisine : "",
      (d.tags || []).join(" ")
    ].join(" ").toLowerCase();
  }

  function filterDishes(list) {
    let arr = list.slice();
    if (state.onlyNew) arr = arr.filter(d => d.isNew);
    if (state.onlyWarn) arr = arr.filter(d => d.rating <= WARN_RATING);
    if (state.minRating > 0) arr = arr.filter(d => d.rating >= state.minRating);
    if (state.maxPrice > 0) arr = arr.filter(d => d.price <= state.maxPrice);
    if (state.sort === "rating") {
      arr.sort((a, b) => b.rating - a.rating);
    } else if (state.sort === "price") {
      arr.sort((a, b) => a.price - b.price);
    } else if (state.sort === "new") {
      arr.sort((a, b) => {
        if (a.isNew && b.isNew) return String(b.newDate).localeCompare(String(a.newDate));
        if (a.isNew) return -1;
        if (b.isNew) return 1;
        return b.rating - a.rating;
      });
    }
    return arr;
  }

  // ========== 通用片段 ==========
  function badgeHTML(badge) {
    if (!badge) return "";
    const label = badge === "hot" ? "🔥人气" : badge === "warn" ? "⚠️避雷" : "🆕新档口";
    return '<span class="badge badge-' + badge + '">' + label + "</span>";
  }

  function stickerHTML(isNew) {
    return isNew ? '<span class="sticker sticker-new">NEW</span>' : "";
  }

  function warnStickerHTML(rating) {
    return rating <= WARN_RATING ? '<span class="sticker sticker-warn">避雷</span>' : "";
  }

  // 排队指数徽章：queue 支持 short/mid/long（或 短/中/长）字符串、1-3 等级、排队分钟数
  function queueChipHTML(queue) {
    if (queue == null || queue === "") return "";
    const q = String(queue).trim().toLowerCase();
    let level = "";
    if (q === "short" || q === "短" || q === "low" || q === "低" || q === "1") level = "queue-short";
    else if (q === "mid" || q === "medium" || q === "中" || q === "2") level = "queue-mid";
    else if (q === "long" || q === "长" || q === "high" || q === "高" || q === "3") level = "queue-long";
    else {
      const n = Number(q);
      if (!isFinite(n)) return "";
      if (Number.isInteger(n) && n >= 1 && n <= 3) {
        level = n === 1 ? "queue-short" : n === 2 ? "queue-mid" : "queue-long";
      } else if (n <= 10) level = "queue-short";
      else if (n <= 20) level = "queue-mid";
      else level = "queue-long";
    }
    const label = level === "queue-short" ? "排队·短" : level === "queue-mid" ? "排队·中" : "排队·长";
    return '<span class="queue-chip ' + level + '">' + label + "</span>";
  }

  function hoursHTML(st) {
    if (!st || !st.hours) return "";
    return '<div class="stall-hours">⏱ ' + esc(st.hours) + "</div>";
  }

  function favBtnHTML(id) {
    const on = state.favorites.has(id);
    return (
      '<button class="fav-btn' + (on ? " on" : "") + '" data-fav="' + esc(id) + '" aria-label="收藏">' +
      (on ? "❤" : "♡") +
      "</button>"
    );
  }

  function dishRowHTML(d) {
    const st = stallOf(d.stallId);
    const c = st ? canteenOf(st.canteenId) : null;
    return (
      '<div class="card dish-row" data-dish="' + esc(d.id) + '">' +
        '<div class="dish-emoji">' + d.emoji + "</div>" +
        '<div class="dish-info">' +
          '<div class="dish-name">' + esc(d.name) + stickerHTML(d.isNew) + warnStickerHTML(d.rating) + "</div>" +
          '<div class="dish-sub">' + esc(st ? st.name : "") + " · " + esc(c ? c.name : "") +
            " " + starsHTML(d.rating) + ' <span class="rating-num">' + d.rating + "</span></div>" +
        "</div>" +
        '<div class="dish-right">' +
          favBtnHTML(d.id) +
          '<div class="dish-price">¥' + d.price + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function heroCardHTML(d) {
    const st = stallOf(d.stallId);
    const c = st ? canteenOf(st.canteenId) : null;
    return (
      '<div class="card hero-card" data-dish="' + esc(d.id) + '">' +
        '<div class="hero-emoji">' + d.emoji + "</div>" +
        '<div class="hero-name">' + esc(d.name) + "</div>" +
        '<div class="hero-sub">' + esc(st ? st.name : "") + " · " + esc(c ? c.name : "") + "</div>" +
        '<div class="hero-meta">' + starsHTML(d.rating) + ' <span class="rating-num">' + d.rating + "</span></div>" +
        '<div class="hero-price">¥' + d.price + "</div>" +
      "</div>"
    );
  }

  // 评分分布：w=exp(-((s-rating)^2)/1.2)，归一化四舍五入，5星行调到总和 100
  function ratingBarsHTML(rating) {
    const weights = [];
    let sum = 0;
    for (let s = 1; s <= 5; s++) {
      const w = Math.exp(-Math.pow(s - rating, 2) / 1.2);
      weights.push(w);
      sum += w;
    }
    const pcts = weights.map(w => Math.round((w / sum) * 100));
    const total = pcts.reduce((a, b) => a + b, 0);
    pcts[4] += 100 - total; // 5星行（index 4）调到总和恰好 100
    let h = "";
    for (let s = 5; s >= 1; s--) {
      const pct = pcts[s - 1];
      h +=
        '<div class="rating-bar">' +
          '<span class="bar-label">' + s + "星</span>" +
          '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="bar-pct">' + pct + "%</span>" +
        "</div>";
    }
    return h;
  }

  function emptyStateHTML(text, view, btnLabel) {
    let h = '<div class="empty-state">' + esc(text);
    if (view && btnLabel) {
      h += '<button class="btn btn-primary" data-view="' + esc(view) + '">' + esc(btnLabel) + "</button>";
    }
    h += "</div>";
    return h;
  }

  // ========== 渲染：首页 ==========
  function renderHome() {
    const view = $("#view-home");
    if (!view) return;
    const newCount = DISHES.filter(d => d.isNew).length;
    let html = "";

    // news-banner
    html += '<div class="news-banner">⚡ 本周情报：' + newCount + " 道新菜上新，快去尝鲜！</div>";

    // 今日必吃：rating 最高 3 道
    const top3 = DISHES.slice().sort((a, b) => b.rating - a.rating).slice(0, 3);
    html += '<section class="section"><div class="section-head"><span class="section-title">😋 今日必吃</span></div>';
    html += '<div class="hero-rail">';
    top3.forEach(d => { html += heroCardHTML(d); });
    html += "</div></section>";

    // 新菜尝鲜：isNew 按 newDate 倒序，最多 6
    const news = DISHES.filter(d => d.isNew)
      .sort((a, b) => String(b.newDate).localeCompare(String(a.newDate)))
      .slice(0, 6);
    html += '<section class="section"><div class="section-head"><span class="section-title">⚡ 新菜尝鲜</span></div>';
    html += '<div class="dish-list">';
    news.forEach(d => { html += dishRowHTML(d); });
    html += "</div></section>";

    // 口碑窗口 Top3：按窗口 rating 降序取 3 个
    const topStalls = STALLS.slice()
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);
    html += '<section class="section"><div class="section-head"><span class="section-title">🔥 口碑窗口 Top3</span><span class="title-tag">评分排序</span></div>';
    html += '<div class="topstall-list">';
    topStalls.forEach((st, i) => {
      const c = canteenOf(st.canteenId);
      html +=
        '<div class="card topstall-card" data-gotostall="' + esc(st.id) + '">' +
          '<div class="topstall-num">' + (i + 1) + "</div>" +
          '<div class="topstall-emoji">' + st.emoji + "</div>" +
          '<div class="topstall-info">' +
            '<div class="topstall-name">' + esc(st.name) + "</div>" +
            '<div class="topstall-sub">' + esc(c ? c.name : "") + " · " + esc(st.cuisine) + " · ★" + st.rating + "</div>" +
          "</div>" +
          queueChipHTML(st.queue) +
        "</div>";
    });
    html += "</div></section>";

    // 同学最新点评：date 倒序（稳定排序，同日期数组靠前优先）取 4 条；
    // 模拟数据含未来日期，用户刚提交的（mine）恒置最前，保证发布后立刻可见
    const feed = REVIEWS.slice()
      .sort((a, b) => {
        const am = a.mine ? 1 : 0;
        const bm = b.mine ? 1 : 0;
        if (am !== bm) return bm - am;
        return String(b.date).localeCompare(String(a.date));
      })
      .slice(0, 4);
    html += '<section class="section"><div class="section-head"><span class="section-title">👥 同学最新点评</span><span class="title-tag">实时</span></div>';
    html += '<div class="feed-list">';
    feed.forEach(r => {
      const fd = dishOf(r.dishId);
      const fs = fd ? stallOf(fd.stallId) : null;
      if (!fd || !fs) return;
      const initial = (r.author || "?").charAt(0);
      html +=
        '<div class="card feed-card" data-dish="' + esc(fd.id) + '">' +
          '<div class="feed-avatar">' + esc(initial) + "</div>" +
          '<div class="feed-head">' +
            '<span class="feed-name">' + esc(r.author) + "</span>" +
            starsHTML(r.stars, true) +
            '<span class="feed-date">' + esc(r.date) + "</span>" +
          "</div>" +
          '<div class="feed-dish">' + esc(fd.name) + " · " + esc(fs.name) + "</div>" +
          '<div class="feed-content">' + esc(r.content) + "</div>" +
        "</div>";
    });
    html += "</div></section>";

    // 本周避雷：rating<=3.4 升序取 3
    const warns = DISHES.filter(d => d.rating <= WARN_RATING)
      .sort((a, b) => a.rating - b.rating)
      .slice(0, 3);
    html += '<section class="section"><div class="section-head"><span class="section-title">⚠️ 本周避雷</span><span class="section-note">同学们亲测</span></div>';
    html += '<div class="warn-list">';
    warns.forEach(d => {
      const bad = REVIEWS.find(r => r.dishId === d.id && r.stars <= 2);
      const reason = bad ? bad.content.slice(0, 20) + "…" : "同学们反映一般";
      html +=
        '<div class="card warn-card" data-dish="' + esc(d.id) + '">' +
          '<div class="warn-head">' +
            '<div class="dish-emoji">' + d.emoji + "</div>" +
            '<div class="dish-info">' +
              '<div class="dish-name">' + esc(d.name) + warnStickerHTML(d.rating) + "</div>" +
              '<div class="dish-sub">踩雷原因：' + esc(reason) + "</div>" +
            "</div>" +
            '<div class="rating-num warn-rating">' + d.rating + "</div>" +
          "</div>" +
        "</div>";
    });
    html += "</div></section>";

    // 快捷找吃的
    html += '<section class="section"><div class="section-head"><span class="section-title">🔍 快捷找吃的</span></div>';
    html +=
      '<div class="quick-grid">' +
        '<button class="quick-chip" data-quick="cheap">💰 ¥10以内</button>' +
        '<button class="quick-chip" data-quick="top">⭐ 评分4.5+</button>' +
        '<button class="quick-chip" data-quick="new">🆕 只看新菜</button>' +
        '<button class="quick-chip" data-quick="warn">⚠️ 避雷模式</button>' +
        '<button class="quick-chip" data-quick="noodle">🍜 面食</button>' +
        '<button class="quick-chip" data-quick="hotpot">🌶️ 麻辣烫</button>' +
      "</div></section>";

    view.innerHTML = html;
  }

  // ========== 渲染：食堂 ==========
  function renderCanteen() {
    const view = $("#view-canteen");
    if (!view) return;
    let html = "";

    // canteen-tabs
    html += '<div class="canteen-tabs">';
    CANTEENS.forEach(c => {
      const active = state.canteenId === c.id && !state.search;
      html +=
        '<button class="chip' + (active ? " active" : "") + '" data-canteen="' + esc(c.id) + '">' +
        c.emoji + " " + esc(c.name) + "</button>";
    });
    html += "</div>";

    // filter-bar
    html += '<div class="filter-bar">';
    const sorts = [["rating", "评分高→低"], ["price", "价格低→高"], ["new", "最新上架"]];
    sorts.forEach(([k, label]) => {
      html += '<button class="chip' + (state.sort === k ? " active" : "") + '" data-sort="' + k + '">' + label + "</button>";
    });
    html += '<span class="filter-sep"></span>';
    const filters = [
      ["new", "只看新菜"],
      ["warn", "只看避雷"],
      ["minrating", state.minRating > 0 ? "≥" + state.minRating.toFixed(1) + "分" : "≥4.0分"]
    ];
    filters.forEach(([k, label]) => {
      let on = false;
      if (k === "new") on = state.onlyNew;
      if (k === "warn") on = state.onlyWarn;
      if (k === "minrating") on = state.minRating > 0;
      html += '<button class="chip' + (on ? " active" : "") + '" data-filter="' + k + '">' + label + "</button>";
    });
    if (state.maxPrice > 0) {
      html += '<button class="chip active" data-filter="maxprice">≤¥10 ✕</button>';
    }
    html += "</div>";

    if (state.search) {
      // 搜索模式：跨全部食堂扁平列表
      const kw = state.search.toLowerCase();
      const hits = DISHES.filter(d => haystackOf(d).includes(kw));
      html +=
        '<div class="search-note">搜索“' + esc(state.search) + "”：命中 " + hits.length +
        ' 道菜 <button class="btn btn-ghost btn-sm" data-clearsearch>清除</button></div>';
      if (hits.length === 0) {
        html += emptyStateHTML("没找到相关菜品，换个词试试？");
      } else {
        html += '<div class="result-count">共 ' + hits.length + " 道菜</div>";
        const sorted = filterDishes(hits);
        html += '<div class="dish-list">';
        sorted.forEach(d => { html += dishRowHTML(d); });
        html += "</div>";
      }
    } else {
      // 按食堂浏览
      const stalls = STALLS.filter(s => s.canteenId === state.canteenId);
      let totalDishes = 0;
      let totalStalls = 0;
      const blocks = [];
      stalls.forEach(st => {
        const dishes = filterDishes(DISHES.filter(d => d.stallId === st.id));
        if (dishes.length > 0) {
          totalDishes += dishes.length;
          totalStalls++;
          blocks.push({ st: st, dishes: dishes });
        }
      });
      html += '<div class="result-count">共 ' + totalDishes + " 道菜 / " + totalStalls + " 个窗口</div>";
      if (blocks.length === 0) {
        html += emptyStateHTML("当前筛选下没有菜品，换个条件试试？");
      } else {
        blocks.forEach(({ st, dishes }) => {
          const open = !!state.expanded[st.id];
          html +=
            '<div class="card stall-card' + (open ? " open" : "") + '" data-stall="' + esc(st.id) + '">' +
              '<div class="stall-head">' +
                '<div class="stall-avatar">' + st.emoji + "</div>" +
                '<div class="stall-meta">' +
                  '<div class="stall-name">' + esc(st.name) + " " + badgeHTML(st.badge) + " " + queueChipHTML(st.queue) + "</div>" +
                  '<div class="stall-sub">' + esc(st.cuisine) + " · 人均¥" + st.avg + " · ★" + st.rating + "</div>" +
                  hoursHTML(st) +
                "</div>" +
                '<div class="stall-arrow">▾</div>' +
              "</div>";
          if (open) {
            html += '<div class="stall-dishes"><div class="dish-list">';
            dishes.forEach(d => { html += dishRowHTML(d); });
            html += "</div></div>";
          }
          html += "</div>";
        });
      }
    }

    view.innerHTML = html;
  }

  // ========== 渲染：榜单 ==========
  function renderRank() {
    const view = $("#view-rank");
    if (!view) return;
    let html =
      '<div class="rank-tabs">' +
        '<button class="chip' + (state.rankTab === "new" ? " active" : "") + '" data-ranktab="new">🆕 新菜热度榜</button>' +
        '<button class="chip' + (state.rankTab === "warn" ? " active" : "") + '" data-ranktab="warn">⚠️ 避雷榜</button>' +
      "</div>";

    let list = [];
    if (state.rankTab === "new") {
      list = DISHES.filter(d => d.isNew)
        .sort((a, b) => (b.rating - a.rating) || (b.count - a.count))
        .slice(0, 10);
    } else {
      list = DISHES.filter(d => d.rating <= WARN_RATING)
        .sort((a, b) => a.rating - b.rating)
        .slice(0, 10);
    }

    if (list.length === 0) {
      html += emptyStateHTML("暂无榜单数据");
    } else {
      html += '<div class="rank-list">';
      list.forEach((d, i) => {
        const st = stallOf(d.stallId);
        const c = st ? canteenOf(st.canteenId) : null;
        const topCls = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
        const warnCls = state.rankTab === "warn" ? " rank-warn" : "";
        let right = "";
        if (state.rankTab === "new") {
          right = '<div class="rank-score">' + d.rating + "</div>";
        } else {
          const n = REVIEWS.filter(r => r.dishId === d.id && r.stars <= 2).length;
          right = '<div class="rank-note">' + n + " 条踩雷</div>";
        }
        html +=
          '<div class="card rank-item ' + topCls + warnCls + '" data-dish="' + esc(d.id) + '">' +
            '<div class="rank-num">' + (i + 1) + "</div>" +
            '<div class="dish-emoji">' + d.emoji + "</div>" +
            '<div class="rank-info">' +
              '<div class="dish-name">' + esc(d.name) + "</div>" +
              '<div class="dish-sub">' + esc(st ? st.name : "") + " · " + esc(c ? c.name : "") + "</div>" +
            "</div>" +
            right +
          "</div>";
      });
      html += "</div>";
    }

    view.innerHTML = html;
  }

  // ========== 渲染：我的 ==========
  function renderMe() {
    const view = $("#view-me");
    if (!view) return;
    const myRevCount = state.myReviews.length;
    const favCount = state.favorites.size;
    const avoidCount = state.myReviews.filter(r => r.stars <= 2).length;

    let html =
      '<div class="stat-grid">' +
        '<div class="card stat-card"><div class="stat-num">' + myRevCount + '</div><div class="stat-label">我的点评</div></div>' +
        '<div class="card stat-card"><div class="stat-num">' + favCount + '</div><div class="stat-label">我的收藏</div></div>' +
        '<div class="card stat-card"><div class="stat-num">' + avoidCount + '</div><div class="stat-label">帮避雷</div></div>' +
      "</div>";

    // 我的收藏（按收藏倒序）
    html += '<section class="section"><div class="section-head"><span class="section-title">❤️ 我的收藏</span></div>';
    if (state.favorites.size === 0) {
      html += emptyStateHTML("还没有收藏，去发现好吃的 →", "home", "去逛逛");
    } else {
      const favIds = Array.from(state.favorites).reverse();
      html += '<div class="dish-list">';
      favIds.forEach(id => {
        const d = dishOf(id);
        if (d) html += dishRowHTML(d);
      });
      html += "</div>";
    }
    html += "</section>";

    // 我的点评
    html += '<section class="section"><div class="section-head"><span class="section-title">✍️ 我的点评</span></div>';
    if (state.myReviews.length === 0) {
      html += emptyStateHTML("点评是同学的灯塔，写第一条吧 →", "canteen", "去写一条");
    } else {
      html += '<div class="myrev-list">';
      state.myReviews.forEach(r => {
        const d = dishOf(r.dishId);
        if (!d) return;
        let tagsHtml = "";
        if (r.tags && r.tags.length) {
          tagsHtml = '<div class="tag-row">';
          r.tags.forEach(t => { tagsHtml += '<span class="tag">' + esc(t) + "</span>"; });
          tagsHtml += "</div>";
        }
        html +=
          '<div class="card myrev-item" data-dish="' + esc(d.id) + '">' +
            '<div class="rv-head">' +
              '<span class="dish-name">' + esc(d.name) + "</span>" +
              starsHTML(r.stars, true) +
              '<span class="rv-date">' + esc(r.date) + "</span>" +
            "</div>" +
            '<div class="rv-content">' + esc(r.content) + "</div>" +
            tagsHtml +
          "</div>";
      });
      html += "</div>";
    }
    html += "</section>";

    view.innerHTML = html;
  }

  // ========== 渲染：介绍 ==========
  function renderAbout() {
    const view = $("#view-about");
    if (!view) return;
    let html = "";

    // 1) about-hero
    html +=
      '<div class="about-hero">' +
        "<h1>校园食堂点评推荐</h1>" +
        '<div class="about-slogan">今天食堂吃什么？让同学的胃替你探路</div>' +
        '<div class="about-badges">' +
          '<span class="about-badge">纯前端</span>' +
          '<span class="about-badge">模拟数据</span>' +
          '<span class="about-badge">黑色描边</span>' +
          '<span class="about-badge">课程作业</span>' +
        "</div>" +
      "</div>";

    // 2) 项目简介
    html +=
      '<section class="section"><div class="section-head"><span class="section-title">💡 项目简介</span></div>' +
        '<div class="about-card">' +
          "<p>大学生每天都要面对「食堂吃什么」的世纪难题，可校园里并没有像大众点评那样按菜品打分的评价工具——哪家窗口好吃、哪道菜踩雷，全靠口口相传，等你知道的时候往往已经下筷了。</p>" +
          "<p>本项目为同学提供发现新菜、避开踩雷窗口的点评与推荐：看评分、看差评摘要、看上新情报，帮你在 30 秒内决定下一顿。</p>" +
        "</div>" +
      "</section>";

    // 3) 产品结构：5 张卡
    const structure = [
      { title: "首页", desc: "聚合今日情报的默认入口", tags: ["今日必吃", "新菜尝鲜", "本周避雷", "快捷入口"] },
      { title: "食堂", desc: "按食堂浏览全部窗口与菜品", tags: ["切换食堂", "排序筛选", "关键词搜索", "窗口展开"] },
      { title: "榜单", desc: "两份榜单一眼看清谁值得吃", tags: ["新菜热度榜", "避雷榜"] },
      { title: "我的", desc: "收藏与点评的个人中心", tags: ["我的收藏", "我的点评", "数据统计"] },
      { title: "弹层", desc: "菜品详情与写点评的浮层", tags: ["菜品详情", "评分分布", "写点评"] }
    ];
    html += '<section class="section"><div class="section-head"><span class="section-title">🧩 产品结构</span></div>';
    html += '<div class="about-grid">';
    structure.forEach(s => {
      html +=
        '<div class="about-card">' +
          '<div class="about-card-title">' + esc(s.title) + "</div>" +
          '<div class="about-card-desc">' + esc(s.desc) + "</div>" +
          '<div class="about-tags">';
      s.tags.forEach(t => { html += '<span class="tag">' + esc(t) + "</span>"; });
      html += "</div></div>";
    });
    html += "</div></section>";

    // 4) 功能亮点：6 张卡
    const features = [
      { emoji: "🍽️", title: "今日推荐", desc: "高分菜打头阵，30 秒锁定今日最佳" },
      { emoji: "⚡", title: "新菜尝鲜", desc: "NEW 贴纸 + 上新日期，第一时间尝鲜" },
      { emoji: "⚠️", title: "避雷预警", desc: "低分菜 + 差评摘要，下筷之前先看雷" },
      { emoji: "🏆", title: "双榜单", desc: "新菜热度榜 / 避雷榜，谁红谁雷一目了然" },
      { emoji: "✍️", title: "多维点评", desc: "总评 / 口味 / 性价比打分 + 快捷标签" },
      { emoji: "🔍", title: "搜索筛选", desc: "关键词搜索 + 排序 + 筛选条，找菜快人一步" }
    ];
    html += '<section class="section"><div class="section-head"><span class="section-title">✨ 功能亮点</span></div>';
    html += '<div class="feature-grid">';
    features.forEach(f => {
      html +=
        '<div class="feature-card">' +
          '<div class="feature-emoji">' + f.emoji + "</div>" +
          '<div class="feature-title">' + esc(f.title) + "</div>" +
          '<div class="feature-desc">' + esc(f.desc) + "</div>" +
        "</div>";
    });
    html += "</div></section>";

    // 5) 使用指南：4 步
    const steps = [
      "打开首页，先看「今日必吃」高分推荐",
      "用快捷入口或顶部搜索直达目标",
      "点进菜品详情，看同学的真实评价",
      "打星写点评，帮后来人排雷"
    ];
    html += '<section class="section"><div class="section-head"><span class="section-title">🚀 使用指南</span></div>';
    html += '<div class="step-list">';
    steps.forEach((s, i) => {
      html +=
        '<div class="step-item">' +
          '<span class="step-num">' + (i + 1) + "</span>" +
          "<div>" + esc(s) + "</div>" +
        "</div>";
    });
    html += "</div></section>";

    // 6) 数据与技术：统计数字全部动态计算
    html +=
      '<section class="section"><div class="section-head"><span class="section-title">📦 数据与技术</span></div>' +
        '<div class="data-chips">' +
          '<span class="data-chip">' + CANTEENS.length + " 个食堂</span>" +
          '<span class="data-chip">' + STALLS.length + " 个窗口</span>" +
          '<span class="data-chip">' + DISHES.length + " 道菜品</span>" +
          '<span class="data-chip">' + REVIEWS.length + " 条点评</span>" +
        "</div>" +
        '<div class="about-note">全部为模拟数据，刷新即重置；零外部依赖（原生 HTML / CSS / JS），双击 index.html 即可运行。</div>' +
        '<div class="about-link-row">' +
          '<a class="about-link" href="https://qushengxixiaoluo.github.io/meituan/" target="_blank" rel="noopener">🌐 在线访问</a>' +
          '<a class="about-link" href="https://github.com/qushengxixiaoluo/meituan" target="_blank" rel="noopener">📦 源码</a>' +
        "</div>" +
      "</section>";

    view.innerHTML = html;
  }

  function render() {
    renderHome();
    renderCanteen();
    renderRank();
    renderAbout();
    renderMe();
  }

  function showView(v) {
    state.view = v;
    document.querySelectorAll(".view").forEach(sec => {
      sec.classList.toggle("active", sec.id === "view-" + v);
    });
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.view === v);
    });
    window.scrollTo(0, 0);
  }

  // ========== 详情弹层 ==========
  function openDetail(id) {
    state.currentDishId = id;
    renderDetail();
    const m = $("#detailModal");
    if (m) m.classList.remove("hidden");
  }

  function renderDetail() {
    const d = dishOf(state.currentDishId);
    if (!d) return;
    const st = stallOf(d.stallId);
    const c = st ? canteenOf(st.canteenId) : null;
    const fav = state.favorites.has(d.id);
    // 新提交的（mine）已 unshift 到 REVIEWS 最前，其余保持原顺序
    const reviews = REVIEWS.filter(r => r.dishId === d.id);

    let html =
      '<button class="modal-close" data-close aria-label="关闭">✕</button>' +
      '<div class="detail-head">' +
        '<div class="detail-emoji">' + d.emoji + "</div>" +
        '<div class="detail-titles">' +
          '<div class="detail-title">' + esc(d.name) + stickerHTML(d.isNew) + warnStickerHTML(d.rating) + "</div>" +
          '<div class="detail-sub">' + esc(st ? st.name : "") + " · " + esc(c ? c.name : "") + " · " + esc(st ? st.cuisine : "") + "</div>" +
          '<div class="tag-row">';
    (d.tags || []).forEach(t => { html += '<span class="tag">' + esc(t) + "</span>"; });
    html +=
          "</div>" +
        "</div>" +
        '<div class="price-box">¥' + d.price + "</div>" +
      "</div>" +
      '<div class="rating-summary">' +
        '<div class="rating-big">' +
          '<div class="rating-big-num rating-num">' + d.rating + "</div>" +
          starsHTML(d.rating) +
          '<div class="rating-count">' + d.count + " 条评价</div>" +
        "</div>" +
        '<div class="rating-bars">' + ratingBarsHTML(d.rating) + "</div>" +
      "</div>" +
      '<div class="detail-actions">' +
        '<button class="btn btn-ghost' + (fav ? " on" : "") + '" data-fav="' + esc(d.id) + '">' + (fav ? "❤ 已收藏" : "♡ 收藏") + "</button>" +
        '<button class="btn btn-primary" data-openreview>✍️ 写点评</button>' +
      "</div>" +
      '<div class="review-list">';

    if (reviews.length === 0) {
      html += emptyStateHTML("还没有评价，来抢沙发～");
    } else {
      reviews.forEach(r => {
        const initial = (r.author || "?").charAt(0);
        let tagsHtml = "";
        if (r.tags && r.tags.length) {
          tagsHtml = '<div class="rv-tags">';
          r.tags.forEach(t => { tagsHtml += '<span class="tag">' + esc(t) + "</span>"; });
          tagsHtml += "</div>";
        }
        html +=
          '<div class="review-item' + (r.mine ? " mine" : "") + '">' +
            '<div class="rv-avatar">' + esc(initial) + "</div>" +
            '<div class="rv-main">' +
              '<div class="rv-head">' +
                '<span class="rv-name">' + esc(r.author) + "</span>" +
                starsHTML(r.stars, true) +
                '<span class="rv-date">' + esc(r.date) + "</span>" +
              "</div>" +
              '<div class="rv-content">' + esc(r.content) + "</div>" +
              tagsHtml +
              '<div class="rv-actions">' +
                '<button class="rv-like' + (r.liked ? " liked" : "") + '" data-like="' + esc(r.id) + '">👍 ' + r.likes + "</button>" +
              "</div>" +
            "</div>" +
          "</div>";
      });
    }
    html += "</div>";

    const body = $("#detailBody");
    if (body) body.innerHTML = html;
  }

  // ========== 写点评弹层 ==========
  function openReview() {
    const d = dishOf(state.currentDishId);
    if (!d) return;
    state.form = { stars: 0, taste: 0, value: 0, tags: [] };

    function starPicker(dim, label) {
      let h =
        '<div class="form-row">' +
          '<span class="form-label">' + label + "</span>" +
          '<div class="star-picker">';
      for (let i = 1; i <= 5; i++) {
        h += '<button class="star-btn" data-star="' + dim + ":" + i + '">★</button>';
      }
      h += "</div></div>";
      return h;
    }

    let html =
      '<button class="modal-close" data-close aria-label="关闭">✕</button>' +
      '<div class="form-title">写点评 · ' + esc(d.name) + "</div>" +
      starPicker("overall", "总评") +
      starPicker("taste", "口味") +
      starPicker("value", "性价比") +
      '<div class="form-row tag-picker">';
    const rtags = ["好吃必点", "踩雷快跑", "排队太久", "量大管饱", "一般般"];
    rtags.forEach(t => {
      html += '<button class="chip" data-rtag="' + esc(t) + '">' + esc(t) + "</button>";
    });
    html +=
      "</div>" +
      '<div class="form-row">' +
        '<textarea id="revText" class="rev-textarea" maxlength="140" placeholder="说说这道菜怎么样，帮同学少踩一个雷～"></textarea>' +
      "</div>" +
      '<div class="form-footer">' +
        '<span class="char-count" id="charCount">0 字</span>' +
        '<button class="btn btn-primary" data-submitreview>发布点评</button>' +
      "</div>";

    const body = $("#reviewBody");
    if (body) body.innerHTML = html;
    const m = $("#reviewModal");
    if (m) m.classList.remove("hidden");
  }

  function closeTopModal() {
    const rm = $("#reviewModal");
    const dm = $("#detailModal");
    if (rm && !rm.classList.contains("hidden")) {
      rm.classList.add("hidden");
    } else if (dm && !dm.classList.contains("hidden")) {
      dm.classList.add("hidden");
    }
  }

  function closeAllModals() {
    const rm = $("#reviewModal");
    const dm = $("#detailModal");
    if (rm) rm.classList.add("hidden");
    if (dm) dm.classList.add("hidden");
  }

  // ========== 收藏 / 点赞 / 提交 ==========
  function toggleFav(id) {
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
      toast("已取消收藏");
    } else {
      state.favorites.add(id);
      toast("已收藏 ❤");
    }
    render();
    const dm = $("#detailModal");
    if (dm && !dm.classList.contains("hidden")) renderDetail();
  }

  function toggleLike(rid) {
    const r = REVIEWS.find(x => x.id === rid);
    if (!r) return;
    r.liked = !r.liked;
    r.likes += r.liked ? 1 : -1;
    renderDetail();
  }

  function submitReview() {
    if (state.form.stars < 1) {
      toast("先选个星级吧！");
      return;
    }
    const textEl = $("#revText");
    const content = (textEl && textEl.value.trim()) || "（只打了分，没写文字）";
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const review = {
      id: "my" + (state.myReviews.length + 1),
      dishId: state.currentDishId,
      author: "我",
      stars: state.form.stars,
      content: content,
      date: mm + "-" + dd,
      likes: 0,
      mine: true,
      tags: state.form.tags.slice(),
      taste: state.form.taste,
      value: state.form.value
    };
    REVIEWS.unshift(review);
    state.myReviews.unshift(review);
    // 评分联动
    const d = dishOf(state.currentDishId);
    if (d) {
      const oldCount = d.count;
      d.rating = Math.round(((d.rating * oldCount + review.stars) / (oldCount + 1)) * 10) / 10;
      d.count = oldCount + 1;
    }
    const rm = $("#reviewModal");
    if (rm) rm.classList.add("hidden");
    state.form = { stars: 0, taste: 0, value: 0, tags: [] };
    renderDetail();
    render();
    toast("点评发布成功，感谢分享！");
  }

  // ========== 首页快捷 ==========
  function applyQuick(q) {
    if (q === "cheap") {
      state.sort = "price"; state.maxPrice = 10; state.onlyNew = false; state.onlyWarn = false; state.minRating = 0; state.search = "";
    } else if (q === "top") {
      state.minRating = 4.5; state.maxPrice = 0; state.onlyNew = false; state.onlyWarn = false; state.sort = "rating"; state.search = "";
    } else if (q === "new") {
      state.onlyNew = true; state.onlyWarn = false; state.minRating = 0; state.maxPrice = 0; state.sort = "new"; state.search = "";
    } else if (q === "warn") {
      state.onlyWarn = true; state.onlyNew = false; state.minRating = 0; state.maxPrice = 0; state.sort = "rating"; state.search = "";
    } else if (q === "noodle") {
      state.search = "面"; state.onlyNew = false; state.onlyWarn = false; state.minRating = 0; state.maxPrice = 0; state.sort = "rating";
    } else if (q === "hotpot") {
      state.search = "麻辣烫"; state.onlyNew = false; state.onlyWarn = false; state.minRating = 0; state.maxPrice = 0; state.sort = "rating";
    }
    const si = $("#searchInput");
    if (si) si.value = state.search;
    showView("canteen");
    render();
  }

  // ========== 事件委托（严格顺序） ==========
  document.addEventListener("click", function (e) {
    // 弹层背景点击关闭
    if (e.target && e.target.classList && e.target.classList.contains("modal-mask")) {
      e.target.classList.add("hidden");
      return;
    }

    let el, val;

    // 1. data-close
    el = e.target.closest("[data-close]");
    if (el) { closeTopModal(); return; }

    // 2. data-star
    el = e.target.closest("[data-star]");
    if (el) {
      val = el.getAttribute("data-star");
      const parts = val.split(":");
      const dim = parts[0];
      const idx = parseInt(parts[1], 10);
      if (dim === "overall") state.form.stars = idx;
      else if (dim === "taste") state.form.taste = idx;
      else if (dim === "value") state.form.value = idx;
      document.querySelectorAll('[data-star^="' + dim + ':"]').forEach(btn => {
        const i = parseInt(btn.getAttribute("data-star").split(":")[1], 10);
        btn.classList.toggle("on", i <= idx);
      });
      return;
    }

    // 3. data-rtag
    el = e.target.closest("[data-rtag]");
    if (el) {
      val = el.getAttribute("data-rtag");
      const i = state.form.tags.indexOf(val);
      if (i >= 0) state.form.tags.splice(i, 1);
      else state.form.tags.push(val);
      el.classList.toggle("active");
      return;
    }

    // 4. data-like
    el = e.target.closest("[data-like]");
    if (el) { toggleLike(el.getAttribute("data-like")); return; }

    // 5. data-fav
    el = e.target.closest("[data-fav]");
    if (el) { toggleFav(el.getAttribute("data-fav")); return; }

    // 6. data-submitreview
    el = e.target.closest("[data-submitreview]");
    if (el) { submitReview(); return; }

    // 7. data-openreview
    el = e.target.closest("[data-openreview]");
    if (el) { openReview(); return; }

    // 8. data-dish
    el = e.target.closest("[data-dish]");
    if (el) { openDetail(el.getAttribute("data-dish")); return; }

    // 9. data-gotostall → 跳转到食堂视图并展开目标窗口
    el = e.target.closest("[data-gotostall]");
    if (el) {
      val = el.getAttribute("data-gotostall");
      const target = stallOf(val);
      state.view = "canteen";
      if (target) state.canteenId = target.canteenId;
      state.search = "";
      const si0 = $("#searchInput");
      if (si0) si0.value = "";
      state.onlyNew = false;
      state.onlyWarn = false;
      state.minRating = 0;
      state.maxPrice = 0;
      state.expanded = {};
      state.expanded[val] = true;
      showView("canteen");
      render();
      return;
    }

    // 10. data-stall
    el = e.target.closest("[data-stall]");
    if (el) {
      val = el.getAttribute("data-stall");
      state.expanded[val] = !state.expanded[val];
      renderCanteen();
      return;
    }

    // 11. data-canteen / data-sort / data-filter / data-quick / data-ranktab / data-clearsearch
    el = e.target.closest("[data-canteen]");
    if (el) {
      state.canteenId = el.getAttribute("data-canteen");
      // 搜索态下点击食堂 chip：清空搜索，切回该食堂列表（否则 chip 不高亮、点击无反馈）
      if (state.search) {
        state.search = "";
        const si = $("#searchInput");
        if (si) si.value = "";
      }
      const first = STALLS.find(s => s.canteenId === state.canteenId);
      state.expanded = {};
      if (first) state.expanded[first.id] = true;
      renderCanteen();
      return;
    }

    el = e.target.closest("[data-sort]");
    if (el) { state.sort = el.getAttribute("data-sort"); renderCanteen(); return; }

    el = e.target.closest("[data-filter]");
    if (el) {
      val = el.getAttribute("data-filter");
      if (val === "new") state.onlyNew = !state.onlyNew;
      else if (val === "warn") state.onlyWarn = !state.onlyWarn;
      else if (val === "minrating") state.minRating = state.minRating > 0 ? 0 : 4.0;
      else if (val === "maxprice") state.maxPrice = 0;
      renderCanteen();
      return;
    }

    el = e.target.closest("[data-quick]");
    if (el) { applyQuick(el.getAttribute("data-quick")); return; }

    el = e.target.closest("[data-ranktab]");
    if (el) { state.rankTab = el.getAttribute("data-ranktab"); renderRank(); return; }

    el = e.target.closest("[data-clearsearch]");
    if (el) {
      state.search = "";
      const si = $("#searchInput");
      if (si) si.value = "";
      renderCanteen();
      return;
    }

    // 12. data-view（tab 栏 + 空状态按钮）
    el = e.target.closest("[data-view]");
    if (el) { showView(el.getAttribute("data-view")); return; }
  });

  // Escape 关闭最上层弹层
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeTopModal();
  });

  // 搜索框（header 静态不重渲染，焦点不丢）
  (function bindSearch() {
    const si = $("#searchInput");
    if (!si) return;
    si.addEventListener("input", function () {
      state.search = si.value.trim();
      if (state.search) showView("canteen");
      render();
    });
  })();

  // 点评字数统计
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "revText") {
      const cc = $("#charCount");
      if (cc) cc.textContent = e.target.value.length + " 字";
    }
  });

  // ========== 启动 ==========
  render();
  showView("home");
})();
