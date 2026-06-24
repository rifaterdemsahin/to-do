/* DayPilot — rules-driven daily planner (spec v0.1)
 * Runs fully local (localStorage + on-device generator). If a backend URL is
 * configured, the Daily Generator calls Claude via the Fly.io proxy instead. */
(() => {
  "use strict";
  const CFG = window.DAYPILOT_CONFIG || {};

  /* ---- Visual language (spec §5) — fixed map, AI never improvises ---- */
  const CATEGORY_EMOJI = {
    kids: "👧", sleep: "😴", diet: "🥗", exercise: "🏃",
    recovery: "🕊️", work: "🎬", home: "🧺",
  };
  const EMOJI_CHOICES = ["⚡","😴","👧","🍳","🧺","🏃","🥗","🕊️","🎬","🟢","🟡","🔴"];
  const CIRCLE_DOT = { inner: "🟢", mid: "🟡", outer: "🔴" };
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  // Local-generator time heuristic: base clock hour per category.
  const CATEGORY_TIME = { kids: 7, diet: 7.5, exercise: 8, work: 9.5, home: 18, recovery: 20, sleep: 22.5 };

  /* ---- Helpers ---- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.flat().forEach(k => n.append(k?.nodeType ? k : document.createTextNode(k ?? "")));
    return n;
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + Math.random().toString(16).slice(2));
  const todayISO = (d = new Date()) => d.toISOString().slice(0, 10);
  const season = (d = new Date()) => ["winter","winter","spring","spring","spring","summer","summer","summer","autumn","autumn","autumn","winter"][d.getMonth()];
  const fmtTime = h => `${String(Math.floor(h)).padStart(2,"0")}:${h % 1 ? "30" : "00"}`;

  /* ---- Store (localStorage) ---- */
  const K = { rules: "daypilot.rules", logs: "daypilot.logs", energy: "daypilot.energy", context: "daypilot.context", plans: "daypilot.plans", seeded: "daypilot.seeded" };
  const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const store = {
    rules: () => read(K.rules, []),
    saveRules: r => write(K.rules, r),
    logs: date => read(K.logs, {})[date] || {},
    setLog(date, ruleId, patch) {
      const all = read(K.logs, {}); all[date] = all[date] || {};
      all[date][ruleId] = Object.assign({ completed: false }, all[date][ruleId], patch);
      write(K.logs, all);
    },
    logsAll: () => read(K.logs, {}),
    energy: date => read(K.energy, {})[date] || {},
    energyAll: () => read(K.energy, {}),
    setEnergy(date, patch) { const all = read(K.energy, {}); all[date] = Object.assign({}, all[date], patch); write(K.energy, all); },
    context: () => read(K.context, { goals: "" }),
    setContext: c => write(K.context, c),
    plan: date => read(K.plans, {})[date] || null,
    setPlan(date, p) { const all = read(K.plans, {}); all[date] = p; write(K.plans, all); },
  };

  /* ---- First-run seed so the app shows something real ---- */
  function seed() {
    if (localStorage.getItem(K.seeded)) return;
    const mk = (title, category, circle, weekdays, extra = {}) => ({
      id: uid(), title, category, circle, weekdays, is_likely: false,
      emoji: extra.emoji || CATEGORY_EMOJI[category], notes: extra.notes || "",
      active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extra,
    });
    store.saveRules([
      mk("Breakfast for the girls", "kids", "inner", [1,2,3,4,5], { emoji: "🍳" }),
      mk("School run", "kids", "inner", [1,2,3,4,5], { is_likely: true, notes: "Sometimes the bus, sometimes me." }),
      mk("Morning run", "exercise", "mid", [1,3,5]),
      mk("Cook a real dinner", "diet", "inner", [0,1,2,3,4,5,6]),
      mk("DeliveryPilot deep work", "work", "mid", [1,2,3,4,5]),
      mk("Laundry / dishwasher", "home", "outer", [2,6]),
      mk("SAA recovery check-in", "recovery", "inner", [0,1,2,3,4,5,6]),
      mk("Wind down, lights out", "sleep", "inner", [0,1,2,3,4,5,6]),
    ]);
    store.setContext({ goals: "Ship the DayPilot MVP. Be present for Arya & Mira every morning. Protect sleep and recovery — they're the base of everything else." });
    localStorage.setItem(K.seeded, "1");
  }

  /* ===================== Daily Generator ===================== */
  function recentEnergy(days = 14) {
    const all = store.energyAll();
    return Object.keys(all).sort().slice(-days).map(date => ({ date, ...all[date] }));
  }
  function completionHistory(days = 14) {
    const logs = store.logsAll();
    return Object.keys(logs).sort().slice(-days).map(date => {
      const vals = Object.values(logs[date]);
      return { date, completed_count: vals.filter(v => v.completed).length, skipped_count: vals.filter(v => !v.completed).length };
    });
  }
  function rulesForToday(wd) {
    return store.rules().filter(r => r.active && r.weekdays.includes(wd));
  }

  // On-device generator: reasons from rules + energy, down-scopes low days.
  function localGenerate(date) {
    const wd = new Date(date + "T12:00:00").getDay();
    const rules = rulesForToday(wd);
    const energy = recentEnergy(5);
    const avg = energy.length ? energy.reduce((s, e) => s + (e.energy || 3), 0) / energy.length : null;
    const low = avg !== null && avg <= 2.5;

    const keep = [], deprioritised = [];
    for (const r of rules) {
      if (low && (r.circle === "outer" || r.is_likely)) {
        deprioritised.push({ title: r.title, reason: `energy low (avg ${avg.toFixed(1)}/5) — ${r.is_likely ? "not guaranteed today" : "outer circle can wait"}` });
      } else keep.push(r);
    }
    // Order by clock heuristic; nudge duplicate categories forward 30 min.
    const used = {};
    const blocks = keep
      .map(r => { let h = CATEGORY_TIME[r.category] ?? 12; while (used[h]) h += 0.5; used[h] = 1; return { h, r }; })
      .sort((a, b) => a.h - b.h)
      .map(({ h, r }) => ({ time: fmtTime(h), emoji: r.emoji, title: r.title, circle: r.circle, rule_id: r.id }));

    let summary;
    if (avg === null) summary = `${WEEKDAYS[wd]} — ${blocks.length} rules on deck. Log your energy tonight so tomorrow can adapt.`;
    else if (low) summary = `Low-bandwidth ${WEEKDAYS[wd]} (energy ${avg.toFixed(1)}/5). Trimmed to the inner circle — protect recovery, let the rest slide.`;
    else if (avg >= 4) summary = `Strong ${WEEKDAYS[wd]} (energy ${avg.toFixed(1)}/5). Full slate — good day to push the mid circle.`;
    else summary = `${WEEKDAYS[wd]} at a steady pace (energy ${avg.toFixed(1)}/5). ${blocks.length} blocks, ${deprioritised.length} parked.`;

    return { summary, blocks, deprioritised, generated_by: "local" };
  }

  async function remoteGenerate(date) {
    const wd = new Date(date + "T12:00:00").getDay();
    const res = await fetch(`${CFG.backendUrl.replace(/\/$/, "")}/generate-day`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date, weekday: wd, season: season(new Date(date + "T12:00:00")),
        goals: store.context().goals,
        rules: rulesForToday(wd),
        history: completionHistory(), energy: recentEnergy(),
      }),
    });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    const data = await res.json();
    return { ...data, generated_by: "claude" };
  }

  async function generate(date) {
    if (CFG.backendUrl) { try { return await remoteGenerate(date); } catch (e) { toast("Backend unreachable — using local generator"); } }
    return localGenerate(date);
  }

  /* ===================== Screens ===================== */
  const view = $("#view");
  let current = "today";

  function screenToday() {
    const date = todayISO();
    const plan = store.plan(date);
    const log = store.logs(date);
    view.innerHTML = "";
    view.append(el("div", { className: "screen-head" },
      el("h1", {}, "Today"),
      el("button", { className: "btn primary", id: "genBtn", onclick: doGenerate }, plan ? "Regenerate" : "Generate day")));

    if (!plan) {
      view.append(el("div", { className: "empty" }, "No plan yet. Tap ", el("strong", {}, "Generate day"), " and DayPilot will reason from your active rules, energy and history."));
      return;
    }
    view.append(el("div", { className: "card glow summary" },
      el("span", { className: "pill" }, (plan.generated_by === "claude" ? "🎬 Claude" : "⚙️ local") + " · " + season() + " · " + WEEKDAYS[new Date(date+"T12:00:00").getDay()]),
      el("div", {}, plan.summary)));

    plan.blocks.forEach(b => {
      const done = log[b.rule_id]?.completed;
      const node = el("div", { className: "block" + (done ? " done" : ""), onclick: () => { if (b.rule_id) { store.setLog(date, b.rule_id, { completed: !done }); screenToday(); } } },
        el("span", { className: "time" }, b.time || ""),
        el("span", { className: "emoji" }, b.emoji || "•"),
        el("span", { className: "title" }, b.title),
        el("span", { className: "dot " + (b.circle || "mid") }));
      view.append(node);
    });

    if (plan.deprioritised?.length) {
      view.append(el("div", { className: "section-label" }, "Deprioritised"));
      plan.deprioritised.forEach(d => view.append(el("div", { className: "block deprio" },
        el("span", { className: "emoji" }, "💤"),
        el("span", { className: "title" }, d.title, el("div", { className: "reason" }, d.reason || "")))));
    }
  }

  async function doGenerate() {
    const btn = $("#genBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin">⏳</span> Generating…'; }
    const plan = await generate(todayISO());
    store.setPlan(todayISO(), plan);
    screenToday();
  }

  function screenRules() {
    const rules = store.rules();
    view.innerHTML = "";
    view.append(el("div", { className: "screen-head" }, el("h1", {}, "Rules"), el("span", { className: "muted" }, `${rules.filter(r=>r.active).length} active`)));
    if (!rules.length) view.append(el("div", { className: "empty" }, "No rules yet. Tap ＋ to add your first living rule."));
    rules.forEach(r => {
      const card = el("div", { className: "card" },
        el("div", { className: "rule" + (r.active ? "" : " inactive") },
          el("span", { className: "emoji" }, r.emoji),
          el("div", { className: "meta", onclick: () => openModal(r) },
            el("div", {}, r.title),
            el("div", { className: "sub" },
              el("span", { className: "tag" }, CIRCLE_DOT[r.circle] + " " + r.circle),
              el("span", { className: "tag" }, r.category),
              r.is_likely ? el("span", { className: "tag" }, "likely") : "",
              " " + r.weekdays.map(w => WEEKDAYS[w]).join(" "))),
          (() => { const lbl = el("label", { className: "switch" }); const cb = el("input", { type: "checkbox", checked: r.active });
            cb.onchange = () => { r.active = cb.checked; r.updated_at = new Date().toISOString(); save(rules); };
            lbl.append(cb, el("span", {})); return lbl; })()));
      view.append(card);
    });
    view.append(el("button", { className: "fab", title: "Add rule", onclick: () => openModal(null) }, "＋"));
    function save(r) { store.saveRules(r); }
  }

  function screenLog() {
    const date = todayISO();
    const en = store.energy(date);
    const log = store.logs(date);
    view.innerHTML = "";
    view.append(el("div", { className: "screen-head" }, el("h1", {}, "Daily log"), el("span", { className: "muted" }, date)));

    // Per-rule completion
    const wd = new Date(date + "T12:00:00").getDay();
    const todays = rulesForToday(wd);
    view.append(el("div", { className: "section-label" }, "Rules today"));
    if (!todays.length) view.append(el("div", { className: "muted", style: "margin-bottom:14px" }, "No active rules match today."));
    todays.forEach(r => {
      const done = log[r.id]?.completed;
      view.append(el("div", { className: "block" + (done ? " done" : ""), onclick: () => { store.setLog(date, r.id, { completed: !done }); screenLog(); } },
        el("span", { className: "emoji" }, r.emoji), el("span", { className: "title" }, r.title),
        el("span", {}, done ? "✅" : "⬜")));
    });

    // Energy / sleep / circles
    const card = el("div", { className: "card" });
    card.append(el("div", { className: "section-label", style: "margin-top:0" }, "How was today?"));
    card.append(ratingRow("Energy ⚡ (1–5)", en.energy, v => store.setEnergy(date, { energy: v })));
    const sleep = el("label", {}, "Sleep last night (hours)",
      el("input", { type: "number", step: "0.5", min: "0", max: "14", value: en.sleep_hours ?? "", oninput: e => store.setEnergy(date, { sleep_hours: parseFloat(e.target.value) || null }) }));
    card.append(sleep);
    card.append(ratingRow("Inner circle 🟢", en.inner_score, v => store.setEnergy(date, { inner_score: v })));
    card.append(ratingRow("Mid circle 🟡", en.mid_score, v => store.setEnergy(date, { mid_score: v })));
    card.append(ratingRow("Outer circle 🔴", en.outer_score, v => store.setEnergy(date, { outer_score: v })));
    card.append(el("label", {}, "Note",
      el("textarea", { rows: 2, value: en.note || "", oninput: e => store.setEnergy(date, { note: e.target.value }) })));
    view.append(card);
    view.append(el("div", { className: "muted", style: "text-align:center;font-size:.8rem" }, "Saved automatically — feeds tomorrow's plan."));
  }

  function ratingRow(label, value, onpick) {
    const wrap = el("label", {}, label);
    const row = el("div", { className: "rating" });
    for (let i = 1; i <= 5; i++) {
      const b = el("button", { type: "button", className: value === i ? "on" : "" }, String(i));
      b.onclick = () => { onpick(i); [...row.children].forEach((c, idx) => c.classList.toggle("on", idx + 1 === i)); };
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }

  function screenContext() {
    const ctx = store.context();
    view.innerHTML = "";
    view.append(el("div", { className: "screen-head" }, el("h1", {}, "Standing context")));
    view.append(el("div", { className: "card" },
      el("label", {}, "Your current goals & objectives (rarely edited — the AI reads this every day)",
        el("textarea", { rows: 8, value: ctx.goals || "", placeholder: "What are you optimising for right now?",
          oninput: e => store.setContext({ goals: e.target.value }) }))));
    view.append(el("div", { className: "muted", style: "text-align:center;font-size:.8rem" }, "Saved automatically."));
  }

  /* ===================== Rule editor modal ===================== */
  const modal = $("#modal"), form = $("#ruleForm");
  function openModal(rule) {
    $("#modalTitle").textContent = rule ? "Edit rule" : "New rule";
    form.reset();
    form.id.value = rule?.id || "";
    form.title.value = rule?.title || "";
    form.category.value = rule?.category || "kids";
    form.circle.value = rule?.circle || "inner";
    form.notes.value = rule?.notes || "";
    form.is_likely.checked = !!rule?.is_likely;
    const wd = new Set(rule?.weekdays || [1,2,3,4,5]);
    buildWeekdayChips(wd);
    buildEmojiPicker(rule?.emoji || CATEGORY_EMOJI[rule?.category || "kids"]);
    $("#deleteRule").hidden = !rule;
    $("#deleteRule").onclick = () => { if (rule) { store.saveRules(store.rules().filter(r => r.id !== rule.id)); closeModal(); screenRules(); toast("Rule deleted"); } };
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; }
  function buildWeekdayChips(selected) {
    const box = $("#weekdayChips"); box.innerHTML = "";
    WEEKDAYS.forEach((d, i) => {
      const c = el("span", { className: "chip" + (selected.has(i) ? " on" : "") }, d);
      c.onclick = () => { selected.has(i) ? selected.delete(i) : selected.add(i); c.classList.toggle("on"); box._sel = selected; };
      box.append(c);
    });
    box._sel = selected;
  }
  function buildEmojiPicker(curr) {
    const box = $("#emojiPicker"); box.innerHTML = ""; $("#emojiInput").value = curr;
    EMOJI_CHOICES.forEach(e => {
      const c = el("span", { className: "chip" + (e === curr ? " on" : "") }, e);
      c.onclick = () => { $("#emojiInput").value = e; [...box.children].forEach(ch => ch.classList.toggle("on", ch.textContent === e)); };
      box.append(c);
    });
  }
  $("#catSelect").addEventListener("change", e => buildEmojiPicker(CATEGORY_EMOJI[e.target.value]));
  $("#modalClose").onclick = closeModal;
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const rules = store.rules();
    const weekdays = [...($("#weekdayChips")._sel || new Set())].sort();
    const data = {
      title: form.title.value.trim(), category: form.category.value, circle: form.circle.value,
      weekdays, is_likely: form.is_likely.checked, emoji: $("#emojiInput").value,
      notes: form.notes.value.trim(), updated_at: new Date().toISOString(),
    };
    if (form.id.value) {
      const r = rules.find(x => x.id === form.id.value); Object.assign(r, data);
    } else {
      rules.push({ id: uid(), active: true, created_at: new Date().toISOString(), ...data });
    }
    store.saveRules(rules); closeModal(); screenRules(); toast("Rule saved");
  });

  /* ===================== Toast ===================== */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2400);
  }

  /* ===================== Router ===================== */
  const screens = { today: screenToday, rules: screenRules, log: screenLog, context: screenContext };
  function go(name) {
    current = name;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.screen === name));
    screens[name]();
    window.scrollTo(0, 0);
  }
  $("#tabbar").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) go(b.dataset.screen); });

  /* ===================== Boot ===================== */
  seed();
  $("#dateLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  go("today");
})();
