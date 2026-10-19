(() => {
  const C = window.AFTERGLOW_CONFIG, FB = window.ElenaFallback, V = window.AfterglowVoice;
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
  const haptic = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
  const BD = { "s-title": "title", "s-select": "title", "s-map": "bg_hotel", "s-phone": "bg_apartment" };
  function show(id) {
    $$(".screen").forEach(s => s.classList.toggle("active", s.id === id));
    if (id !== "s-date") { V.stop(); if (V.recording()) recCancel(); }
    const bd = id === "s-date" || id === "s-end" ? null : BD[id];
    if (bd) document.body.style.setProperty("--bd", `url(${img(bd)})`);
    hud();
  }
  function toast(t, ms = 2400) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), ms); }
  // bottom sheet
  function modal(html) {
    const m = $("#modal"); m.classList.remove("closing"); $("#modal-body").innerHTML = html; m.hidden = false;
    $$("#modal-body [data-kofi]").forEach(a => a.href = C.KOFI_URL);
    $$("#modal-body [data-close]").forEach(b => b.onclick = closeSheet);
  }
  function closeSheet() { const m = $("#modal"); if (m.hidden || m.classList.contains("closing")) return; m.classList.add("closing"); setTimeout(() => { m.hidden = true; m.classList.remove("closing"); }, 240); }
  $("#modal").onclick = e => { if (e.target.id === "modal") closeSheet(); };
  (() => { // drag sheet down to dismiss
    const box = $(".sheet-box"); let y0 = null, dy = 0;
    box.addEventListener("touchstart", e => { if (box.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; box.style.transition = "none"; } }, { passive: true });
    box.addEventListener("touchmove", e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); box.style.transform = `translateY(${dy}px)`; }, { passive: true });
    box.addEventListener("touchend", () => { if (y0 === null) return; box.style.transition = ""; box.style.transform = ""; if (dy > 90) closeSheet(); y0 = null; });
  })();
  $$("a.kofi").forEach(a => a.href = C.KOFI_URL);
  const R = 15.5, CIRC = 2 * Math.PI * R;
  const ringSvg = a => `<svg viewBox="0 0 36 36"><circle class="rg-bg" cx="18" cy="18" r="${R}"/><circle class="rg-fg" cx="18" cy="18" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - a / 100)}"/></svg>`;
  function hud() {
    if (!S) return;
    const a = S.affection;
    $$(".ring.hud-ring").forEach(e => { const fg = e.querySelector(".rg-fg"); if (fg) { fg.style.strokeDashoffset = CIRC * (1 - a / 100); e.querySelector("b").textContent = a; } else e.innerHTML = ringSvg(a) + `<b>${a}</b>`; });
    $$(".pill-meter.hud-ring").forEach(e => e.innerHTML = `<span class="rg">${ringSvg(a)}${a}</span>${level(a)}`);
    const l = left(), q = $("#quota-line");
    q.textContent = l ? `${l} free message${l === 1 ? "" : "s"} left today` : "No free messages left · they reset tomorrow"; q.classList.toggle("low", l <= 5);
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MIC_SVG = '<svg class="vm" viewBox="0 0 24 24" width="13" height="13" aria-label="Voice message"><rect x="9" y="3" width="6" height="11.5" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  function bubble(container, who, text, voice) { const d = document.createElement("div"); d.className = "msg " + who + (voice ? " voice" : ""); d.innerHTML = (voice ? MIC_SVG : "") + esc(text); if (who === "her" && container.id === "log") d.dataset.say = text; container.appendChild(d); requestAnimationFrame(() => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })); return d; }
  function typing(container, on) {
    container.querySelectorAll(".typing").forEach(t => t.remove());
    if (on) { const d = bubble(container, "her typing", ""); d.innerHTML = "<i></i><i></i><i></i>"; }
  }
  const EMO_LABEL = { neutral: "online", smile: "smiling", laugh: "laughing", shy: "blushing", annoyed: "unimpressed", sad: "quiet", flirty: "flirting", surprised: "surprised" };
  let curEmo = "neutral", front = true;
  function emotion(e) {
    if (!e || e === curEmo) return;
    curEmo = e; $("#emotion-tag").textContent = EMO_LABEL[e] || "online";
    const a = $("#elena-img"), b = $("#elena-img-b"), [on, off] = front ? [b, a] : [a, b];
    on.onload = () => { on.style.opacity = 1; off.style.opacity = 0; };
    on.src = img("elena_" + e); front = !front;
    $("#grade").style.setProperty("--m", `url(${img("elena_" + e)})`);
  }
  function delta(d) {
    if (!d) return; const el = $("#delta"); el.className = "delta " + (d > 0 ? "up" : "down");
    el.textContent = (d > 0 ? "♥ +" : "−") + Math.abs(d); void el.offsetWidth; el.classList.add("show");
    $$(".ring").forEach(b => { b.classList.remove("beat"); void b.offsetWidth; b.classList.add("beat"); });
    if (d > 0) haptic(12);
  }
  function applyAffection(d) {
    const before = level(S.affection);
    S.affection = clamp(S.affection + d); S.peak = Math.max(S.peak, S.affection);
    const after = level(S.affection);
    if (after !== before) toast(LEVELS.findIndex(l => l[1] === after) > LEVELS.findIndex(l => l[1] === before) ? `You're now ${after.toLowerCase()} ♥` : `Cooling off · ${after.toLowerCase()}`);
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
  function setLive(v) { live = v; V.configure(v ? api : null); $("#s-date").classList.toggle("novoice", !v); const b = $("#mode-badge"); b.textContent = v ? "Live AI" : "Demo mode"; b.classList.toggle("live", v); }
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
    $("#date-bg").style.setProperty("--img", `url(${img(LOCS[loc].bg + "_p")})`);
    document.body.style.setProperty("--bd", `url(${img(LOCS[loc].bg)})`);
    $("#s-date").dataset.scene = loc;
    const log = $("#log"); log.innerHTML = ""; curEmo = ""; emotion("neutral");
    bubble(log, "sys", `Night ${S.day} · ${LOCS[loc].name}` + (live ? "" : " · demo"));
    if (resumed && S.history.length) { S.history.forEach(m => bubble(log, m.role === "user" ? "me" : "her", m.content.replace(/ \([^()]* just treated Elena to [^()]*\)$/, ""), m.voice)); }
    else { const o = FB.opener(S.day, loc, S.memories); S.history.push({ role: "assistant", content: o }); emotion("smile"); save();
      typing(log, true); setTimeout(() => { typing(log, false); bubble(log, "her", o); say(o); }, 900); }
    suggestions(); lockComposer(S.turns >= C.TURNS_PER_DATE);
    show("s-date");
  }
  function lockComposer(done) { $("#chat-form").hidden = done; $("#walk-home").hidden = !done; $("#chat-input").disabled = done; composerState(); }
  function composerState() { $("#chat-form").classList.toggle("empty", !$("#chat-input").value.trim()); }
  function suggestions() {
    const box = $("#suggest"); box.innerHTML = "";
    if (S.turns > 1) return;
    SUGGEST[S.location].forEach((t, i) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.style.animationDelay = (0.9 + i * 0.07) + "s"; b.onclick = () => { haptic(); send(t); }; box.appendChild(b); });
  }

  async function send(text, voice) {
    text = String(text || "").trim(); if (!text || busy) return;
    if (S.turns >= C.TURNS_PER_DATE) return toast("The night is winding down");
    if (left() <= 0) return paywall();
    busy = true; $("#chat-input").value = ""; composerState(); $("#suggest").innerHTML = "";
    V.stop(); const log = $("#log"); bubble(log, "me", text, voice); haptic(6);
    setTimeout(() => busy && typing(log, true), 350);
    const res = await brain("chat", { message: text });
    spend(); typing(log, false);
    S.history.push(voice ? { role: "user", content: text, voice: 1 } : { role: "user", content: text }, { role: "assistant", content: res.reply });
    S.turns++; bubble(log, "her", res.reply); say(res.reply); emotion(res.emotion); delta(res.affection_delta); applyAffection(res.affection_delta || 0);
    busy = false; save();
    if (S.turns === 2 && !localStorage.getItem("afterglow.gifttip")) giftTip();
    if (S.turns >= C.TURNS_PER_DATE) {
      const bye = S.affection >= 50 ? "It's getting late… but I really don't want tonight to end." : "It's getting late. I should head home.";
      setTimeout(() => { typing(log, true); setTimeout(() => { typing(log, false); bubble(log, "her", bye); say(bye); S.history.push({ role: "assistant", content: bye }); save(); lockComposer(true); }, 900); }, 600);
    }
  }
  function paywall() {
    modal(`<img class="s-img" src="${img("elena_card")}" alt=""><h3>Elena has to go for tonight</h3><p>You've used today's ${C.FREE_MESSAGES_PER_DAY} free messages. They reset tomorrow, and she'll be waiting. Want to leave her with something sweet?</p>
      ${giftCards()}<button class="btn glass" type="button" data-close>See you tomorrow</button>`);
    bindGifts();
  }

  // ---------- gifts for Elena (tips via Buy Me a Coffee, honor system) ----------
  const GIFTS = C.GIFTS || [];
  const GIFT_LINES = {
    champagne: ["Champagne? Okay, now you're just showing off… and I like it. Cheers to you.", "Champagne, just like that? You know how to make a girl feel special.", "To us — and to you, for having taste. This is dangerously good."],
    flowers: ["Flowers? Nobody does that anymore. I'm keeping one for my camera bag.", "Flowers for me? Okay, they’re beautiful — I’m trying very hard not to blush.", "Wild flowers, not roses? Good instinct. That’s… really sweet."],
    dinner: ["Dinner? You're officially my favorite person in Port Lumen tonight.", "A real dinner date. Fine, you win — I'm smiling and I can't stop.", "Dinner, just for me? I’m saving this one in my memory, not just my photos."],
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let pendingGift = null;
  function giftCards() {
    return `<div class="gifts">${GIFTS.map((g, i) => `<a class="gift${i === 1 ? " top" : ""}" data-gid="${g.id}" href="${esc(g.url || C.KOFI_URL)}" target="_blank" rel="noopener"><i>${g.emoji}</i><b>${esc(g.name)}</b><span>$${g.price}</span></a>`).join("")}</div>
      <p class="foot">Gifts support the indie dev who made this game. ${GIFTS.some(g => !g.url) ? "You'll pay on Buy Me a Coffee — just enter the gift's amount there." : "Secure checkout on Buy Me a Coffee."}</p>`;
  }
  function bindGifts() {
    $$("#modal-body [data-gid]").forEach(a => a.addEventListener("click", () => {
      haptic(10); pendingGift = { id: a.dataset.gid, at: Date.now() };
      try { sessionStorage.setItem("afterglow.gift", JSON.stringify(pendingGift)); } catch {}
    }));
  }
  function giftTip(ms = 5000) { // one-time hint pointing at the gift button
    localStorage.setItem("afterglow.gifttip", "1"); const t = $("#gift-tip"); t.hidden = false;
    clearTimeout(giftTip.t); giftTip.t = setTimeout(() => t.hidden = true, ms);
  }
  function giftSheet() {
    $("#gift-tip").hidden = true;
    if (!S) return;
    modal(`<div class="gift-sheet"><h3>Treat Elena</h3><p>Pick something she'd love tonight. She'll notice — and she won't forget it.</p>${giftCards()}
      <button class="btn glass" type="button" data-close>Maybe later</button></div>`);
    bindGifts();
  }
  // when the player comes back from the tip page, Elena reacts (once per night she also warms up)
  function giftReturn() {
    if (document.hidden) return;
    if (!pendingGift) { try { pendingGift = JSON.parse(sessionStorage.getItem("afterglow.gift")); } catch {} }
    const p = pendingGift; if (!p || !S || Date.now() - p.at < 2500) return;
    pendingGift = null; try { sessionStorage.removeItem("afterglow.gift"); } catch {}
    const g = GIFTS.find(x => x.id === p.id) || GIFTS[0]; closeSheet();
    const line = pick(GIFT_LINES[g.id] || GIFT_LINES.champagne), first = S.gifted !== S.day, boost = first ? (C.GIFT_AFFECTION || 5) : 0;
    S.gifted = S.day; S.gifts = (S.gifts || 0) + 1;
    setTimeout(() => {
      if (S.phase === "date" && $("#s-date").classList.contains("active")) {
        const log = $("#log"); typing(log, true);
        setTimeout(() => { typing(log, false); bubble(log, "her", line); say(line);
          S.history.push({ role: "assistant", content: `${line} (${S.playerName} just treated Elena to ${g.name.toLowerCase()})` });
          emotion(g.id === "flowers" ? "shy" : "smile"); if (boost) { delta(boost); applyAffection(boost); } else save();
          toast(boost ? `Elena loved the ${g.name.toLowerCase()} ♥` : "She's smiling at you"); }, 1100);
      } else if (S.phase === "phone") {
        const box = $("#ph-chat"); $("#ph-status").textContent = "typing…"; typing(box, true);
        setTimeout(() => { typing(box, false); $("#ph-status").textContent = "online"; const t = line + " " + g.emoji;
          bubble(box, "her", t); S.phoneLog.push({ day: S.day, t }); if (boost) { applyAffection(boost); toast(`♥ +${boost}`); } else save(); }, 1200);
      } else { if (boost) applyAffection(boost); toast("Elena says thank you ♥"); }
    }, 350);
  }
  document.addEventListener("visibilitychange", giftReturn); window.addEventListener("focus", giftReturn);
  $$("[data-gift]").forEach(b => b.onclick = e => { e.preventDefault(); haptic(); giftSheet(); });
  function confirmEnd() {
    if (busy) return; recCancel(); V.stop();
    if (S.turns >= C.TURNS_PER_DATE) return endDate();
    modal(`<h3>End the date?</h3><p>${S.turns ? "Elena will remember tonight. You'll text afterwards." : "Leaving without a word won't go down well."}</p>
      <button class="btn primary" type="button" id="sh-end">End the date</button><button class="btn glass" type="button" data-close>Keep talking</button>`);
    $("#sh-end").onclick = () => { closeSheet(); endDate(); };
  }
  function statusSheet() {
    const a = S.affection, snd = V.enabled();
    modal(`<div class="app-row"><img src="${img("elena_card")}" alt="" style="border-radius:50%;object-fit:cover;object-position:50% 18%"><div><b>Elena</b><small>${level(a)} · ${a} of 100</small></div></div>
      <div class="rows"><div class="bar-l" style="margin-top:14px"><i style="width:${a}%"></i></div>
        <div class="row">Night<span>${S.day} of 3</span></div>
        ${S.phase === "date" ? `<div class="row">Messages this date<span>${S.turns} of ${C.TURNS_PER_DATE}</span></div>` : ""}
        <div class="row">Free messages today<span>${left()} of ${C.FREE_MESSAGES_PER_DAY} left</span></div>
        <button class="row link" type="button" id="sh-gift">Treat Elena<span>Send a gift ›</span></button>
        <div class="row">AI<span>${live ? "Live" : "Demo mode"}</span></div>
        <div class="row">Elena's voice<button class="switch ${snd ? "on" : ""}" id="sh-snd" type="button" aria-label="Sound"></button></div></div>
      <button class="btn glass" type="button" data-close>Done</button>`);
    $("#sh-gift").onclick = () => giftSheet();
    $("#sh-snd").onclick = e => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); setSound(on); haptic(); if (on && !live) toast("Voice needs the live AI"); };
  }
  async function endDate() {
    if (busy) return;
    if (S.turns === 0) { applyAffection(-5); toast("You left without a word · −5"); }
    busy = true; $("#walk-home").textContent = "…";
    const { summary } = S.turns ? await brain("summary") : { summary: `We met at ${LOCS[S.location].name}, but they left almost immediately.` };
    S.memories.push({ day: S.day, location: S.location, summary });
    if (!S.visited.includes(S.location)) S.visited.push(S.location);
    busy = false; $("#walk-home").textContent = "Walk her home";
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
    $("#ph-status").textContent = "typing…"; typing(box, true);
    const { reply } = await brain("text");
    $("#ph-status").textContent = "online"; typing(box, false);
    S.phoneLog.push({ day: S.day, t: reply }); bubble(box, "her", reply); save(); replies(false);
  }
  function replies(done) {
    const box = $("#ph-replies"); box.innerHTML = "";
    if (done) return;
    PH_REPLIES.forEach(o => { const b = document.createElement("button"); b.textContent = o.t; b.onclick = () => {
      haptic(); box.innerHTML = ""; bubble($("#ph-chat"), "me", o.t); S.phoneLog.push({ day: S.day, t: o.t, me: 1 });
      $("#ph-status").textContent = "typing…"; setTimeout(() => typing($("#ph-chat"), true), 300);
      setTimeout(() => { typing($("#ph-chat"), false); const r = o.r[Math.floor(Math.random() * o.r.length)]; bubble($("#ph-chat"), "her", r); S.phoneLog.push({ day: S.day, t: r }); $("#ph-status").textContent = "online"; applyAffection(o.d); toast(o.d > 0 ? `♥ +${o.d}` : `−${-o.d}`); save(); }, 1400);
    }; box.appendChild(b); });
  }
  function renderMem() {
    const m = $("#ph-mem"); m.innerHTML = S.memories.length ? "" : '<div class="msg sys">No memories yet.</div>';
    S.memories.forEach(x => { const d = document.createElement("div"); d.className = "mem"; d.innerHTML = `<b>Night ${x.day} · ${esc(LOCS[x.location].name)}</b>${esc(x.summary)}`; m.appendChild(d); });
  }
  $$(".seg button").forEach(b => b.onclick = () => { haptic(); $$(".seg button").forEach(x => x.classList.toggle("on", x === b)); $("#ph-chat").hidden = b.dataset.tab !== "chat"; $("#ph-mem").hidden = b.dataset.tab !== "mem"; $("#ph-replies").hidden = b.dataset.tab !== "chat"; });
  $("#btn-sleep").onclick = () => { haptic(); S.day++; enterMap(); toast(`Night ${S.day} · a new evening in Port Lumen`); };

  // ---------- ending ----------
  function ending() {
    S.phase = "end"; save();
    const a = S.affection;
    const E = a >= 75 ? { k: "True ending", t: "Afterglow", i: "elena_shy", bg: "bg_hotel", x: `On the last night Elena takes your hand before you can take hers. "Okay. I'm officially not picky anymore." Port Lumen has never looked this bright.` }
      : a >= 45 ? { k: "Good ending", t: "Slow burn", i: "elena_smile", bg: "bg_beach", x: `Elena hugs you goodbye a little longer than a friend would. "Text me. Not 'k'. A real message." Something started here — it just isn't finished yet.` }
      : { k: "Bad ending", t: "Just passing through", i: "elena_sad", bg: "bg_market", x: `Elena smiles politely and disappears into the neon crowd. Some sparks don't catch. Maybe next time, ask her what she's really about.` };
    $("#end-kicker").textContent = E.k; $("#end-title").textContent = E.t; $("#end-text").textContent = E.x;
    $("#end-img").src = img(E.i); $("#end-bg").style.setProperty("--img", `url(${img(E.bg + "_p")})`); document.body.style.setProperty("--bd", `url(${img(E.bg)})`);
    $("#end-stats").innerHTML = `<div><b>${a}</b>Affection</div><div><b>${level(a)}</b>Status</div><div><b>${Math.max(S.memories.length, S.day || 1)}</b>Nights</div>`;
    const txt = `I got the "${E.t}" ending with Elena in Afterglow — an AI dating sim where she actually remembers what you say. Can you do better?`;
    $("#btn-share").href = "https://x.com/intent/post?text=" + encodeURIComponent(txt) + "&url=" + encodeURIComponent(location.href.split("#")[0]);
    show("s-end");
  }

  // ---------- wiring ----------
  $("#btn-new").onclick = () => { haptic(); startNew(); };
  $("#player-name").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); startNew(); } };
  $("#btn-continue").onclick = () => { haptic(); resume(); };
  $("#btn-restart").onclick = () => { haptic(); localStorage.removeItem(SAVE_KEY); S = null; $("#btn-continue").hidden = true; show("s-title"); };
  $$("[data-back]").forEach(b => b.onclick = () => { haptic(); show(b.dataset.back); });
  const PICK = {
    elena: () => { haptic(); enterMap(); },
    maya: () => modal(`<img class="s-img" src="${img("maya")}" alt=""><h3>Maya</h3><p>A sharp, elegant founder with her own story, three new endings and a private penthouse office.</p>
      <button class="btn primary" type="button" onclick="alert('Premium unlock — coming soon!')">Unlock for ${C.PREMIUM_PRICE} · soon</button><a class="btn glass" data-kofi target="_blank" rel="noopener">☕ Buy me a coffee</a>`),
    sasha: () => toast("Sasha arrives soon · follow @worldmarketcup"),
  };
  $$(".pcard").forEach(c => { const k = c.id.replace("card-", ""); c.onclick = () => PICK[k](); c.onkeydown = e => { if (e.key === "Enter") PICK[k](); }; });
  const deck = $("#deck"); deck.addEventListener("scroll", () => { const i = Math.round(deck.scrollLeft / deck.clientWidth); $$("#deck-dots i").forEach((d, j) => d.classList.toggle("on", i === j)); }, { passive: true });
  // ---------- voice: Elena speaks ----------
  function setSound(on) { V.setEnabled(on); $$(".icon-btn.sound").forEach(b => { b.classList.toggle("on", on); b.setAttribute("aria-label", on ? "Elena's voice on" : "Elena's voice off"); }); }
  $$(".icon-btn.sound").forEach(b => b.onclick = () => { haptic(); const on = !V.enabled(); setSound(on); toast(on ? (live ? "Elena's voice on" : "Voice needs the live AI") : "Voice off"); });
  setSound(V.enabled());
  function say(text) { if (live && V.enabled() && $("#s-date").classList.contains("active")) V.speak(text); }
  V.onSpeaking = (on, key) => {
    $("#s-date").classList.toggle("speaking", on);
    $$("#log .msg.her.playing").forEach(m => m.classList.remove("playing"));
    if (on) { const m = [...$$("#log .msg.her")].reverse().find(x => x.dataset.say === key); if (m) m.classList.add("playing"); }
  };
  V.onBlocked = () => toast("Tap her message to hear Elena");
  $("#log").addEventListener("click", e => { // tap a bubble to replay / stop her voice
    const m = e.target.closest(".msg.her[data-say]"); if (!m || !live) return;
    if (V.isPlaying(m.dataset.say)) return V.stop();
    haptic(); V.speak(m.dataset.say, true);
  });

  // ---------- voice: player records English voice messages ----------
  const MAX_REC = 30, form = $("#chat-form"), mic = $("#mic");
  let recState = "idle", recT0 = 0, recTimer = 0, downAt = 0, holdMode = false;
  function recUI(st) {
    recState = st; form.classList.toggle("recording", st === "rec" || st === "starting"); form.classList.toggle("transcribing", st === "stt");
    mic.setAttribute("aria-label", st === "rec" ? "Send voice message" : "Record a voice message");
    if (st === "idle") { clearInterval(recTimer); $("#rec-time").textContent = "0:00"; form.style.removeProperty("--lvl"); }
  }
  function micSheet() {
    modal(`<h3>Microphone is off</h3><p>To send voice messages, allow microphone access for this site — in Safari tap <b>aA</b> → Website Settings → Microphone, in Chrome tap the lock icon → Permissions. Then try again.</p>
      <button class="btn primary" type="button" data-close>Got it</button>`);
  }
  async function recStart() {
    if (recState !== "idle" || busy) return;
    if (S.turns >= C.TURNS_PER_DATE) return toast("The night is winding down");
    if (left() <= 0) return paywall();
    if (!live) return toast("Voice messages need the live AI");
    if (!V.canRecord()) return toast("Voice messages aren't supported in this browser — type instead");
    recUI("starting"); $("#rec-hint").textContent = "Allow the microphone…";
    try {
      await V.start(l => form.style.setProperty("--lvl", l.toFixed(2)));
    } catch (e) {
      recUI("idle");
      if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) return micSheet();
      if (e && (e.name === "NotFoundError" || e.name === "OverconstrainedError")) return toast("No microphone found");
      return toast("Couldn't start the microphone");
    }
    if (recState !== "starting") { V.cancel(); return; }       // cancelled while asking
    recUI("rec"); recT0 = Date.now(); haptic(14);
    // released before the permission prompt finished → switch to tap-to-send
    if (!holdMode || !downAt) holdMode = false;
    $("#rec-hint").textContent = holdMode ? "Release to send" : "Tap ↑ to send";
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recT0) / 1000); $("#rec-time").textContent = `0:${String(Math.min(s, MAX_REC)).padStart(2, "0")}`;
      if (s >= MAX_REC - 5) $("#rec-hint").textContent = `${MAX_REC - s}s left`;
      if (s >= MAX_REC) recStop();
    }, 250);
  }
  function recCancel() { if (recState === "idle") return; V.cancel(); recUI("idle"); }
  async function recStop() {
    if (recState !== "rec") return;
    const dur = (Date.now() - recT0) / 1000; clearInterval(recTimer);
    if (dur < 0.8) { V.cancel(); recUI("idle"); return toast("Hold to talk · or tap, speak, tap ↑"); }
    recUI("stt"); haptic(8); $("#rec-hint").textContent = "Transcribing…";
    const blob = await V.finish();
    if (!blob || blob.size < 800) { recUI("idle"); return toast("Didn't catch that — try again"); }
    let text = "";
    try { text = await V.transcribe(blob); }
    catch (e) { recUI("idle"); return toast(/rate/.test(e.message) ? "Slow down a little 🙂" : /too_long|too_large/.test(e.message) ? "Keep it under 30 seconds" : "Couldn't hear that — try again"); }
    recUI("idle");
    if (!text) return toast("Didn't catch that — try again");
    send(text, true);
  }
  mic.addEventListener("pointerdown", e => {
    if (e.button > 0) return; e.preventDefault();
    if (recState === "rec") { recStop(); return; }                // tap mode: second tap sends
    if (recState !== "idle") return;
    downAt = Date.now(); holdMode = true; try { mic.setPointerCapture(e.pointerId); } catch {}
    recStart();
  });
  const release = () => {
    if (!downAt) return; const held = Date.now() - downAt; downAt = 0;
    if (recState === "rec" && holdMode && held > 450) recStop();     // hold-to-talk: release sends
    else holdMode = false;                                           // quick tap: keep recording, tap ↑ to send
    if (recState === "rec") $("#rec-hint").textContent = holdMode ? "Release to send" : "Tap ↑ to send";
  };
  mic.addEventListener("pointerup", release); mic.addEventListener("pointercancel", release);
  mic.addEventListener("contextmenu", e => e.preventDefault());
  mic.addEventListener("click", e => { if (e.detail === 0) { recState === "rec" ? recStop() : recState === "idle" && (holdMode = false, recStart()); } }); // keyboard
  $("#rec-cancel").onclick = () => { haptic(); recCancel(); toast("Voice message discarded"); };
  $$(".loc").forEach(b => b.onclick = () => { haptic(); enterDate(b.dataset.loc); });
  $("#chat-form").onsubmit = e => { e.preventDefault(); send($("#chat-input").value); };
  $("#chat-input").oninput = composerState;
  $("#end-date").onclick = () => { haptic(); confirmEnd(); };
  $("#walk-home").onclick = () => { haptic(); endDate(); };
  $("#ring-btn").onclick = () => { haptic(); statusSheet(); };
  window.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

  // ---------- PWA: service worker + install hint ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)))
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e)));
  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; });
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  function installHint(force) {
    if (!force && (standalone() || localStorage.getItem("afterglow.hint") || !matchMedia("(pointer:coarse)").matches || /[?&]nohint/.test(location.search))) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!ios && !deferredInstall && !force) return;
    localStorage.setItem("afterglow.hint", "1");
    const how = ios ? `<p>Tap <span class="ios-share"></span> Share, then <b>Add to Home Screen</b>. Afterglow opens full-screen, like an app.</p><button class="btn primary" type="button" data-close>Got it</button>`
      : `<p>Install Afterglow on your phone. It opens full-screen and loads instantly.</p><button class="btn primary" type="button" id="sh-install">Install app</button><button class="btn glass" type="button" data-close>Not now</button>`;
    modal(`<div class="app-row"><img src="assets/img/icon-192.png" alt=""><div><b>Afterglow</b><small>Add to Home Screen</small></div></div>${how}`);
    const ib = $("#sh-install"); if (ib) ib.onclick = async () => { closeSheet(); if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } };
  }

  const prev = load(); if (prev && prev.phase) { $("#btn-continue").hidden = false; $("#player-name").value = prev.playerName || ""; }
  detect();
  // loader: preload key art, then fade in
  (function preload() {
    const list = ["title_p", "p_elena", "bg_hotel_p", "elena_neutral", "elena_smile", "elena_card"].map(img);
    let n = 0; const done = () => { $("#ld-fill").style.width = (++n / list.length * 100) + "%"; if (n === list.length) setTimeout(() => $("#loader").classList.add("done"), 350); };
    list.forEach(u => { const i = new Image(); i.onload = i.onerror = done; i.src = u; });
    setTimeout(() => $("#loader").classList.add("done"), 6000);
    setTimeout(() => installHint(), 4500);
  })();
  window.__afterglow = { giftSheet, giftReturn, giftTip, get state() { return S; }, ending, setLive, paywall, installHint, statusSheet, closeSheet, voice: V, get recState() { return recState; } }; // debug hook
})();
