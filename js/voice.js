// Afterglow voice: Elena speaks (Worker /tts → xAI TTS) and the player can send English voice messages
// (MediaRecorder → Worker /stt → xAI grok-voice-transcribe). No keys here — everything goes through the proxy.
(() => {
  const KEY = "afterglow.voice", MAX_TTS = 400;
  let ttsUrl = null, sttUrl = null, fails = 0;
  const V = { onSpeaking: () => {}, onBlocked: () => {} };

  V.configure = api => { ttsUrl = api ? api.replace(/\/chat$/, "/tts") : null; sttUrl = api ? api.replace(/\/chat$/, "/stt") : null; fails = 0; };
  V.enabled = () => localStorage.getItem(KEY) !== "0";            // on by default
  V.setEnabled = on => { localStorage.setItem(KEY, on ? "1" : "0"); if (!on) V.stop(); };
  V.ready = () => !!ttsUrl;

  // ---------- playback (one reusable <audio>, unlocked on first gesture for iOS Safari) ----------
  const el = new Audio(); el.preload = "auto"; el.setAttribute("playsinline", ""); el.setAttribute("webkit-playsinline", "");
  const silent = (() => { // 50 ms of silent 8 kHz mono WAV
    const n = 400, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
    s(0, "RIFF"); v.setUint32(4, 36 + n, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, "data"); v.setUint32(40, n, true); b.fill(128, 44);
    return "data:audio/wav;base64," + btoa(String.fromCharCode(...b));
  })();
  let unlocked = false, unlocking = false, playingKey = null, ctl = null;
  const GESTURES = ["touchend", "click", "keydown"];
  function unlock() {
    if (unlocked || unlocking) return; unlocking = true;
    try {
      el.src = silent;
      Promise.resolve(el.play()).then(() => { unlocked = true; if (el.src === silent) el.pause(); GESTURES.forEach(t => document.removeEventListener(t, unlock, true)); })
        .catch(() => {}).finally(() => { unlocking = false; });
    } catch { unlocking = false; }
  }
  GESTURES.forEach(t => document.addEventListener(t, unlock, true));
  V.unlock = unlock;

  const cache = new Map(); // text -> blob URL (last 12 replies, for tap-to-replay)
  function remember(k, url) { cache.set(k, url); while (cache.size > 12) { const [ok, ou] = cache.entries().next().value; URL.revokeObjectURL(ou); cache.delete(ok); } }
  const speaking = on => V.onSpeaking(on, playingKey);
  el.addEventListener("playing", () => { if (el.src !== silent) speaking(true); });
  ["ended", "pause", "error"].forEach(t => el.addEventListener(t, () => { if (playingKey) { speaking(false); playingKey = null; } }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) V.stop(); });

  V.stop = () => { if (ctl) { ctl.abort(); ctl = null; } if (!el.paused) el.pause(); if (playingKey) { speaking(false); playingKey = null; } };

  async function play(key, url) {
    if (!el.paused) el.pause();
    playingKey = key; el.src = url;
    try { await el.play(); return true; }
    catch (e) { playingKey = null; if (e && e.name === "NotAllowedError") V.onBlocked(key); return false; }
  }

  /** Speak a line. Silent no-op when muted, offline, or TTS fails. force = user tapped to replay. */
  V.speak = async (text, force) => {
    text = String(text || "").trim().slice(0, MAX_TTS);
    if (!text || !ttsUrl || (!force && (!V.enabled() || fails >= 3))) return false;
    V.stop();
    if (cache.has(text)) return play(text, cache.get(text));
    const my = ctl = new AbortController();
    try {
      const r = await fetch(ttsUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: my.signal });
      if (!r.ok || !/^audio\//.test(r.headers.get("Content-Type") || "")) throw new Error("tts " + r.status);
      const url = URL.createObjectURL(await r.blob()); remember(text, url); fails = 0;
      if (my !== ctl) return false; ctl = null;                     // superseded or stopped meanwhile
      if (!force && !V.enabled()) return false;
      return play(text, url);
    } catch (e) { if (e.name !== "AbortError") { fails++; console.info("[voice] TTS unavailable:", e.message); } return false; }
  };
  V.isPlaying = key => playingKey === key && !el.paused;

  // ---------- recording ----------
  const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  V.canRecord = () => !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
  let rec = null, stream = null, chunks = [], meter = null;
  V.recording = () => !!rec;

  /** Ask for the mic and start recording. onLevel(0..1) is called ~30×/s for the live meter. Throws DOMException on denial. */
  V.start = async onLevel => {
    V.stop();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const type = TYPES.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    chunks = [];
    rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(250);
    try { // live level meter (optional)
      const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
      an.fftSize = 512; src.connect(an); const buf = new Uint8Array(an.fftSize);
      const tick = () => { if (!meter) return; an.getByteTimeDomainData(buf); let m = 0; for (const x of buf) m = Math.max(m, Math.abs(x - 128)); onLevel && onLevel(Math.min(1, m / 64)); meter.raf = requestAnimationFrame(tick); };
      meter = { ac, raf: 0 }; tick();
    } catch { meter = null; }
  };
  function release() {
    if (meter) { cancelAnimationFrame(meter.raf); meter.ac.close().catch(() => {}); meter = null; }
    if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; rec = null;
  }
  /** Stop and return the recorded Blob. */
  V.finish = () => new Promise(res => {
    if (!rec) return res(null);
    const r = rec;
    r.onstop = () => { const b = new Blob(chunks, { type: (r.mimeType || chunks[0]?.type || "audio/webm") }); chunks = []; release(); res(b); };
    try { r.requestData && r.state === "recording" && r.requestData(); r.stop(); } catch { release(); res(null); }
  });
  V.cancel = () => { if (rec) { rec.onstop = null; try { rec.stop(); } catch {} } chunks = []; release(); };

  /** Upload a recording, get English text back. Throws Error(code) on failure. */
  V.transcribe = async blob => {
    if (!sttUrl) throw new Error("offline");
    const r = await fetch(sttUrl, { method: "POST", headers: { "Content-Type": (blob.type || "audio/webm").split(";")[0] }, body: blob });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
    return String(j.text || "").trim();
  };

  window.AfterglowVoice = V;
})();
