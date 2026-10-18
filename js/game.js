(() => {
  const C = window.AFTERGLOW_CONFIG, FB = window.ElenaFallback;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const SAVE_KEY = "afterglow.save.v1", QUOTA_KEY = "afterglow.quota";
  const LEVELS = [[0, "Strangers"], [20, "Acquaintances"], [40, "Friends"], [60, "Crush"], [80, "Couple"]];
  const LOCS = { hotel: { name: "The Lumen Hotel", bg: "bg_hotel" }, rooftop: { name: "Skyline Rooftop", bg: "bg_rooftop" }, beach: { name: "Coral Bay Beach Club", bg: "bg_beach" }, market: { name: "Lantern Night Market", bg: "bg_market" } };
  const SUGGEST = {
    hotel: ["So, do you come to fancy hotels often?", "What are you drinking?", "Tell me something nobody knows about you"],
    rooftop: ["What do you order here?", "Why photography?", "Tell me a secret about this city"],
    beach: ["Did you grow up near the sea?", "Race you to the water?", "Best sunset you ever shot?"],
    market: ["Okay, what should I eat first?", "Do you come here often?", "How spicy can you handle?"],
  };
  const img = n => `assets/img/${n}.webp`;
  const level = a => LEVELS.filter(l => a >= l[0]).pop()[1];
  const clamp = v => Math.max(0, Math.min(100, v));

  let S = null;           // save state
  let api = null;         // resolved API url (null = demo)
  let live = false, busy = false;

  // ---------- persistence ----------
  const fresh = name => ({ v: 1, playerName: name || "Alex", day: 1, affection: 10, phase: "map", visited: [], memories: [], history: [], turns: 0, location: null, phoneLog: [], peak: 10 });
  const save = () => localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
  const today = () => new Date().toISOString().slice(0, 10);
  function quota() { let q; try { q = JSON.parse(localStorage.getItem(QUOTA_KEY)); } catch {} if (!q || q.date !== today()) q = { date: today(), used: 0 }; return q; }
  const left = () => Math.max(0, C.FREE_MESSAGES_PER_DAY - quota().used);
  function spend() { const q = quota(); q.used++; localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); }

  // ---------- UI helpers ----------
  function show(id) { $$(".screen").forEach(s => s.classList.toggle("active", s.id === id)); hud(); }
  function toast(t, ms = 2600) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), ms); }
  function modal(html) { $("#modal-body").innerHTML = html; $("#modal").hidden = false; $$("#modal-body [data-kofi]").forEach(a => a.href = C.KOFI_URL); }
  $("#modal-x").onclick = () => $("#modal").hidden = true;
  $("#modal").onclick = e => { if (e.target.id === "modal") $("#modal").hidden = true; };
  $$(".hud").forEach(h => h.appendChild($("#hud-tpl").content.cloneNode(true)));
  $$("a.kofi, #kofi-end").forEach(a => a.href = C.KOFI_URL);
  function hud() {
    if (!S) return;
    $$(".h-day").forEach(e => e.textContent = S.day);
    $$(".h-level").forEach(e => e.textContent = level(S.affection));
    $$(".h-val").forEach(e => e.textContent = S.affection + "/100");
    $$(".h-fill").forEach(e => e.style.width = S.affection + "%");
    $$(".h-msgs").forEach(e => e.textContent = left());
    $$(".msgs").forEach(e => e.classList.toggle("low", left() <= 10));
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function bubble(container, who, text) { const d = document.createElement("div"); d.className = "msg " + who; d.innerHTML = esc(text); container.appendChild(d); container.scrollTop = container.scrollHeight; return d; }

  // visual-novel line with typewriter
  let twTimer = null;
  function speak(text) {
    const el = $("#line"); clearInterval(twTimer); el.classList.remove("typing"); el.textContent = "";
    let i = 0; const t = String(text);
    twTimer = setInterval(() => { el.textContent = t.slice(0, ++i); if (i >= t.length) clearInterval(twTimer); }, 22);
    el.onclick = () => { clearInterval(twTimer); el.textContent = t; };
  }
  function thinking() { clearInterval(twTimer); const el = $("#line"); el.classList.add("typing"); el.innerHTML = "<span></span><span></span><span></span>"; }
  let curEmo = "neutral", front = true;
  function emotion(e) {
    if (!e || e === curEmo) return;
    curEmo = e; $("#emotion-tag").textContent = e;
    const a = $("#elena-img"), b = $("#elena-img-b"), [on, off] = front ? [b, a] : [a, b];
    on.onload = () => { on.style.opacity = 1; off.style.opacity = 0; on.classList.add("pop"); setTimeout(() => on.classList.remove("pop"), 450); };
    on.src = img("elena_" + e); front = !front;
    $("#grade").style.setProperty("--m", `url(${img("elena_" + e)})`);
  }
  function delta(d) {
    if (!d) return; const el = $("#delta"); el.className = "delta " + (d > 0 ? "up" : "down");
    el.textContent = (d > 0 ? "+" : "−") + Math.abs(d); void el.offsetWidth; el.classList.add("show");
    $$(".bar").forEach(b => { b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); });
  }
  function applyAffection(d) {
    const before = level(S.affection);
    S.affection = clamp(S.affection + d); S.peak = Math.max(S.peak, S.affection);
    const after = level(S.affection);
    if (after !== before) toast(LEVELS.findIndex(l => l[1] === after) > LEVELS.findIndex(l => l[1] === before) ? `Relationship up: ${after} ♥` : `Relationship down: ${after}`);
    hud(); save();
  }

  // ---------- brain (LLM or fallback) ----------
  function stateForApi() {
    return { day: S.day, location: S.location, affection: S.affection, levelName: level(S.affection), playerName: S.playerName, memories: S.memories.map(m => m.summary) };
  }
  async function callApi(payload) {
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }
  async function brain(mode, extra = {}) {
    if (live) {
      try { return await callApi({ mode, state: stateForApi(), history: S.history.slice(-16), ...extra }); }
      catch (e) { console.warn("LLM failed, falling back:", e); if (/rate/.test(e.message)) toast("Slow down a little 🙂"); else { toast("AI offline — switched to demo mode"); setLive(false); } }
    }
    await new Promise(r => setTimeout(r, 500 + Math.random() * 700));
    if (mode === "summary") return { summary: FB.summary(S.history, S.location) };
    if (mode === "text") return { reply: FB.text(S.day, S.affection) };
    return FB.reply(extra.message, stateForApi());
  }
  function setLive(v) { live = v; const b = $("#mode-badge"); b.textContent = v ? "● Live AI" : "Demo mode (scripted)"; b.classList.toggle("live", v); }
  async function detect() {
    if (C.FORCE_DEMO) return setLive(false);
    api = C.API_URL || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "/api/chat" : null);
    if (!api) return setLive(false);
    try { const r = await fetch(api.replace(/\/chat$/, "/health")); const j = await r.json(); setLive(!!j.hasKey); } catch { setLive(false); }
  }

  // ---------- flow ----------
  function startNew() { S = fresh($("#player-name").value.trim()); save(); show("s-select"); }
  function resume() {
    S = load(); if (!S) return startNew();
    if (S.phase === "date" && S.location) return enterDate(S.location, true);
    if (S.phase === "phone") return enterPhone(true);
    if (S.phase === "end") return ending();
    enterMap();
  }
  function enterMap() {
    S.phase = "map"; S.history = []; S.turns = 0; save();
    $("#map-day").textContent = `Night ${S.day} of 3`;
    $$(".loc").forEach(b => b.classList.toggle("was", S.visited.includes(b.dataset.loc)));
    show("s-map");
  }
  function enterDate(loc, resumed) {
    S.phase = "date"; S.location = loc; save();
    $("#date-bg").style.setProperty("--img", `url(${img(LOCS[loc].bg)})`);
    $("#s-date").dataset.scene = loc;
    $("#log").innerHTML = ""; curEmo = ""; emotion("neutral");
    bubble($("#log"), "sys", `Night ${S.day} · ${LOCS[loc].name}` + (live ? "" : " · demo"));
    $("#you").textContent = ""; $("#history").hidden = true;
    if (resumed && S.history.length) { S.history.forEach(m => bubble($("#log"), m.role === "user" ? "me" : "her", m.content)); speak([...S.history].reverse().find(m => m.role === "assistant").content); }
    else { const o = FB.opener(S.day, loc, S.memories); S.history.push({ role: "assistant", content: o }); bubble($("#log"), "her", o); emotion("smile"); speak(o); save(); }
    suggestions(); turnsUI(); $("#chat-input").disabled = false; $("#send").disabled = false;
    show("s-date"); setTimeout(() => $("#chat-input").focus(), 300);
  }
  function suggestions() {
    const box = $("#suggest"); box.innerHTML = "";
    if (S.turns > 1) return;
    SUGGEST[S.location].forEach(t => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = () => send(t); box.appendChild(b); });
  }
  const turnsUI = () => $("#turns").textContent = `${S.turns}/${C.TURNS_PER_DATE}`;

  async function send(text) {
    text = String(text || "").trim(); if (!text || busy) return;
    if (S.turns >= C.TURNS_PER_DATE) return toast("The night is winding down — end the date.");
    if (left() <= 0) return paywall();
    busy = true; $("#chat-input").value = ""; $("#suggest").innerHTML = "";
    bubble($("#log"), "me", text); $("#you").textContent = text; thinking();
    const res = await brain("chat", { message: text });
    spend(); speak(res.reply);
    S.history.push({ role: "user", content: text }, { role: "assistant", content: res.reply });
    S.turns++; bubble($("#log"), "her", res.reply); emotion(res.emotion); delta(res.affection_delta); applyAffection(res.affection_delta || 0);
    turnsUI(); busy = false; save();
    if (S.turns >= C.TURNS_PER_DATE) {
      const bye = S.affection >= 50 ? "It's getting late… but I really don't want tonight to end." : "It's getting late. I should head home.";
      setTimeout(() => { bubble($("#log"), "her", bye); $("#you").textContent = ""; speak(bye); S.history.push({ role: "assistant", content: bye }); save(); }, 700);
      $("#chat-input").disabled = true; $("#send").disabled = true; $("#end-date").textContent = "Walk her home →";
    }
  }
  function paywall() {
    modal(`<img src="${img("elena_card")}" alt=""><h3>That's all for tonight</h3><p>You've used today's ${C.FREE_MESSAGES_PER_DAY} free messages. They refill tomorrow.</p>
      <button class="btn primary" onclick="alert('Unlimited Pass — coming soon!')">Unlimited Pass — soon</button>
      <a class="btn kofi-btn" data-kofi target="_blank" rel="noopener">☕ Buy me a coffee</a>`);
  }
  async function endDate() {
    if (busy) return;
    if (S.turns === 0) { applyAffection(-5); toast("You left without saying a word… (−5)"); }
    busy = true; $("#end-date").textContent = "…";
    const { summary } = S.turns ? await brain("summary") : { summary: `We met at ${LOCS[S.location].name}, but they left almost immediately.` };
    S.memories.push({ day: S.day, location: S.location, summary });
    if (!S.visited.includes(S.location)) S.visited.push(S.location);
    busy = false; $("#end-date").textContent = "End the date →";
    if (S.day >= 3) return ending();
    enterPhone();
  }

  // ---------- phone ----------
  const PH_REPLIES = [
    { t: "Tonight was amazing. Can't wait for tomorrow 😊", d: 3, r: ["Same. Don't be late 😏", "Good. Me neither."], e: "smile" },
    { t: "You still owe me a rematch on those dumplings 🌶️", d: 2, r: ["Ha! Bring tissues. You'll need them.", "Deal. Loser pays."], e: "laugh" },
    { t: "k", d: -3, r: ["…k? Wow. Okay.", "Riveting conversation as always."], e: "annoyed" },
  ];
  async function enterPhone(resumed) {
    S.phase = "phone"; save(); show("s-phone");
    const box = $("#ph-chat"); box.innerHTML = ""; $("#ph-replies").innerHTML = "";
    S.phoneLog.forEach(m => bubble(box, m.me ? "me" : "her", m.t));
    bubble(box, "sys", `Night ${S.day} · after the date`);
    renderMem();
    const dayMsgs = S.phoneLog.filter(m => m.day === S.day);
    if (resumed && dayMsgs.length) return replies(dayMsgs.length > 1);
    $("#ph-status").textContent = "typing…";
    const { reply } = await brain("text");
    $("#ph-status").textContent = "online";
    S.phoneLog.push({ day: S.day, t: reply }); bubble(box, "her", reply); save(); replies(false);
  }
  function replies(done) {
    const box = $("#ph-replies"); box.innerHTML = "";
    if (done) return;
    PH_REPLIES.forEach(o => { const b = document.createElement("button"); b.textContent = o.t; b.onclick = () => {
      box.innerHTML = ""; bubble($("#ph-chat"), "me", o.t); S.phoneLog.push({ day: S.day, t: o.t, me: 1 });
      $("#ph-status").textContent = "typing…";
      setTimeout(() => { const r = o.r[Math.floor(Math.random() * o.r.length)]; bubble($("#ph-chat"), "her", r); S.phoneLog.push({ day: S.day, t: r }); $("#ph-status").textContent = "online"; applyAffection(o.d); toast(o.d > 0 ? `♥ +${o.d}` : `− ${-o.d}`); save(); }, 1100);
    }; box.appendChild(b); });
  }
  function renderMem() {
    const m = $("#ph-mem"); m.innerHTML = S.memories.length ? "" : '<div class="msg sys">No memories yet.</div>';
    S.memories.forEach(x => { const d = document.createElement("div"); d.className = "mem"; d.innerHTML = `<b>DAY ${x.day} · ${esc(LOCS[x.location].name.toUpperCase())}</b>${esc(x.summary)}`; m.appendChild(d); });
  }
  $$(".ph-tabs button").forEach(b => b.onclick = () => { $$(".ph-tabs button").forEach(x => x.classList.toggle("on", x === b)); $("#ph-chat").hidden = b.dataset.tab !== "chat"; $("#ph-mem").hidden = b.dataset.tab !== "mem"; $("#ph-replies").hidden = b.dataset.tab !== "chat"; });
  $("#btn-sleep").onclick = () => { S.day++; enterMap(); toast(`Day ${S.day} — a new night in Port Lumen`); };

  // ---------- ending ----------
  function ending() {
    S.phase = "end"; save();
    const a = S.affection;
    const E = a >= 75 ? { k: "True ending", t: "Afterglow", i: "elena_shy", bg: "bg_hotel", x: `On the last night Elena takes your hand before you can take hers. "Okay. I'm officially not picky anymore." Port Lumen has never looked this bright.` }
      : a >= 45 ? { k: "Good ending", t: "Slow Burn", i: "elena_smile", bg: "bg_beach", x: `Elena hugs you goodbye a little longer than a friend would. "Text me. Not 'k'. A real message." Something started here — it just isn't finished yet.` }
      : { k: "Bad ending", t: "Just Passing Through", i: "elena_sad", bg: "bg_market", x: `Elena smiles politely and disappears into the neon crowd. Some sparks don't catch. Maybe next time, ask her what she's really about.` };
    $("#end-kicker").textContent = E.k; $("#end-title").textContent = E.t; $("#end-text").textContent = E.x;
    $("#end-img").src = img(E.i); $("#end-bg").style.setProperty("--img", `url(${img(E.bg)})`);
    $("#end-stats").innerHTML = `<div><b>${a}</b>Affection</div><div><b>${level(a)}</b>Status</div><div><b>${Math.max(S.memories.length, S.day || 1)}</b>Nights</div>`;
    const txt = `I got the "${E.t}" ending with Elena in Afterglow — an AI dating sim where she actually remembers what you say. Can you do better?`;
    $("#btn-share").href = "https://x.com/intent/post?text=" + encodeURIComponent(txt) + "&url=" + encodeURIComponent(location.href.split("#")[0]);
    show("s-end");
  }

  // ---------- wiring ----------
  $("#btn-new").onclick = startNew;
  $("#btn-continue").onclick = resume;
  $("#btn-restart").onclick = () => { localStorage.removeItem(SAVE_KEY); S = null; $("#btn-continue").hidden = true; show("s-title"); };
  $$("[data-back]").forEach(b => b.onclick = () => show(b.dataset.back));
  $("#card-elena").onclick = enterMap;
  $("#card-maya").onclick = () => modal(`<img src="${img("maya")}" alt=""><h3>Maya</h3><p>A sharp, elegant founder with her own story, three new endings and a private penthouse office.</p>
    <button class="btn primary" onclick="alert('Premium unlock — coming soon!')">Unlock for ${C.PREMIUM_PRICE} — soon</button><a class="btn kofi-btn" data-kofi target="_blank" rel="noopener">☕ Buy me a coffee</a>`);
  $("#card-sasha").onclick = () => toast("Sasha arrives soon — follow @worldmarketcup");
  $$(".card").forEach(c => c.onkeydown = e => { if (e.key === "Enter") c.click(); });
  // sound toggle (placeholder until voice ships)
  const setSound = on => { localStorage.setItem("afterglow.sound", on ? "1" : "0"); $$(".sound").forEach(b => { b.textContent = b.closest(".hud") ? "♪" : `Sound · ${on ? "on" : "off"}`; b.classList.toggle("off", !on); }); };
  $$(".sound").forEach(b => b.onclick = () => { const on = localStorage.getItem("afterglow.sound") !== "1"; setSound(on); toast(on ? "Voice & music arrive in the next update" : "Sound off"); });
  setSound(localStorage.getItem("afterglow.sound") === "1");
  $$(".loc").forEach(b => b.onclick = () => enterDate(b.dataset.loc));
  $("#chat-form").onsubmit = e => { e.preventDefault(); send($("#chat-input").value); };
  $("#end-date").onclick = endDate;
  $("#history-btn").onclick = () => { const h = $("#history"); h.hidden = !h.hidden; if (!h.hidden) $("#log").scrollTop = 1e9; };
  $("#history-x").onclick = () => $("#history").hidden = true;
  window.addEventListener("keydown", e => { if (e.key === "Escape") $("#modal").hidden = true; });

  const prev = load(); if (prev && prev.phase) { $("#btn-continue").hidden = false; $("#player-name").value = prev.playerName || ""; }
  detect();
  // loader: preload key art, then fade in
  (function preload() {
    const list = ["title", "bg_hotel", "elena_neutral", "elena_smile", "elena_card", "maya", "sasha"].map(img);
    let n = 0; const done = () => { $("#ld-fill").style.width = (++n / list.length * 100) + "%"; if (n === list.length) setTimeout(() => $("#loader").classList.add("done"), 350); };
    list.forEach(u => { const i = new Image(); i.onload = i.onerror = done; i.src = u; });
    setTimeout(() => $("#loader").classList.add("done"), 6000);
  })();
  window.__afterglow = { get state() { return S; }, ending, setLive }; // debug hook
})();
