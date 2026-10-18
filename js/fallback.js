// Offline / demo brain for Elena: scripted, keyword-driven replies.
// Same output shape as the LLM: { reply, emotion, affection_delta }.
(function () {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const has = (t, re) => re.test(t);

  const LOC = {
    hotel: ["I love places like this. Everyone whispers, like the marble's listening.", "I've photographed three weddings in this lobby. Never once got a drink here.", "Fancy choice. Trying to impress me, or yourself?"],
    rooftop: ["The view up here makes the city look honest for once.", "I come here when I need the noise to be far away.", "Bartender here makes a smoked old fashioned that should be illegal."],
    beach: ["I grew up two towns down this coast. The sea still feels like home.", "Sunsets here never look the same twice — I've got a thousand photos to prove it.", "Careful, the sand gets everywhere. Like, emotionally."],
    market: ["Okay, rule one: you have to try the chili dumplings. Non-negotiable.", "I love this place when it rains. The neon looks like it's melting.", "Half my best photos were taken right on this street."],
  };

  const R = [
    { re: /\b(sex|sexy|nude|naked|bed|undress|strip|clothes|take (it|them) off|sleep with|horny|nsfw|hook ?up|make out|boobs?|body|your place)\b/i,
      out: () => ({ reply: pick(["Wow, skipping a few chapters there, aren't we? Buy me a dumpling first.", "Cute. Try earning a second date before writing the sequel.", "Down, tiger. Ask me something interesting instead."]), emotion: pick(["flirty", "annoyed"]), affection_delta: -3 }) },
    { re: /\b(stupid|ugly|shut up|bitch|boring|fat|dumb|hate you|whatever)\b/i,
      out: () => ({ reply: pick(["Okay, that was rude. Want to try that again?", "Hm. Not a great look on you.", "I can leave, you know. Just saying."]), emotion: "annoyed", affection_delta: -7 }) },
    { re: /\b(hi|hey|hello|yo|good evening|sup)\b/i,
      out: () => ({ reply: pick(["Hey you. Glad you actually showed up.", "Hi. You clean up nicely.", "Well, hello. I was starting to think you'd chicken out."]), emotion: "smile", affection_delta: 1 }) },
    { re: /\b(photo|camera|photograph|picture|shoot)/i,
      out: () => ({ reply: pick(["I shoot street stuff mostly. Strangers in the rain, neon on wet asphalt. Real moments.", "My camera's older than my car and twice as reliable.", "Photos are the only way I know how to say 'this mattered'."]), emotion: "smile", affection_delta: 4 }) },
    { re: /\b(jazz|music|song|record|vinyl)/i,
      out: () => ({ reply: pick(["Old jazz records. Chet Baker on a rainy night is basically therapy.", "I have a crate of vinyl and zero furniture. Priorities."]), emotion: "laugh", affection_delta: 4 }) },
    { re: /\b(food|eat|hungry|dumpling|spicy|dinner|drink|cocktail)/i,
      out: () => ({ reply: pick(["If it doesn't make me cry a little, it's not spicy enough.", "I judge people by how they order food. No pressure.", "Second round's on you, by the way."]), emotion: "laugh", affection_delta: 3 }) },
    { re: /\b(ex|past|relationship|boyfriend|single|heart ?broken|breakup)\b/i,
      out: () => ({ reply: pick(["My last one loved the version of me in photos. Not the one who snores.", "Let's just say I'm picky now. For good reasons."]), emotion: "sad", affection_delta: 3 }) },
    { re: /\b(beautiful|pretty|gorgeous|cute|stunning|amazing|love your)\b/i,
      out: () => ({ reply: pick(["Smooth. A little rehearsed, but smooth.", "Okay, you get one point for that. One.", "Stop it. …No, actually, keep going."]), emotion: pick(["shy", "flirty"]), affection_delta: 3 }) },
    { re: /\b(haha|lol|lmao|joke|funny|😂|🤣)/i,
      out: () => ({ reply: pick(["Don't laugh at your own jokes, that's my job. …Fine, it was funny.", "You're kind of an idiot. I like it."]), emotion: "laugh", affection_delta: 4 }) },
    { re: /\b(like you|into you|another date|see you again|date me|go out|together)\b/i,
      out: (s) => s.affection >= 50
        ? ({ reply: pick(["…Yeah. I'd like that. A lot, actually.", "Ask me again tomorrow and see what happens."]), emotion: "shy", affection_delta: 6 })
        : ({ reply: pick(["Easy there. Let's see if you survive tonight first.", "Bold. I respect bold. Ask me later."]), emotion: "surprised", affection_delta: 1 }) },
    { re: /\b(sorry|apolog)/i,
      out: () => ({ reply: "Apology accepted. Don't make it a habit.", emotion: "smile", affection_delta: 2 }) },
    { re: /\b(sea|ocean|beach|waves|swim)/i,
      out: () => ({ reply: "I grew up by the sea. When life gets loud I still go stand in the waves till my feet go numb.", emotion: "smile", affection_delta: 3 }) },
    { re: /\b(work|job|career|startup|money)\b/i,
      out: () => ({ reply: pick(["Freelance photographer. Translation: broke but free.", "I shoot weddings to pay rent and strangers to stay sane."]), emotion: "neutral", affection_delta: 2 }) },
    { re: /\?\s*$/,
      out: () => ({ reply: pick(["Good question. Nobody asks me that.", "Hmm. Honestly? I'd say yes. Your turn though — same question.", "Depends. Are you asking because you care or because it's a date thing?"]), emotion: pick(["surprised", "smile"]), affection_delta: 3 }) },
  ];

  window.ElenaFallback = {
    reply(message, state) {
      const t = String(message || "").trim();
      if (t.length < 4) return { reply: pick(["That's it? Come on, give me more than that.", "Wow. A man of few words.", "…Riveting."]), emotion: "annoyed", affection_delta: -2 };
      for (const r of R) if (has(t, r.re)) return r.out(state || {});
      const loc = LOC[(state && state.location) || "rooftop"];
      return { reply: pick([...loc, "Tell me something about you that's not on your dating profile.", "I like how you think. Weird, but good weird."]), emotion: pick(["neutral", "smile", "flirty"]), affection_delta: t.length > 40 ? 2 : 1 };
    },
    opener(day, location, memories) {
      const first = { hotel: "A hotel bar? Bold first move. I'm Elena — and yes, I'll have whatever's most expensive.", rooftop: "So you're the one who wouldn't stop texting. Hi — I'm Elena. Drink?", beach: "Hey! Grab a cabana before the sunset crowd shows up. I'm Elena.", market: "You found it! Okay, I'm Elena and I'm starving. Follow me." };
      if (day === 1 || !(memories || []).length) return first[location];
      return pick(["Back for more? Brave.", "Hey you. I was kind of hoping you'd pick this place.", "Okay, I'll admit it — I was looking forward to tonight."]) + " " + pick(LOC[location]);
    },
    text(day, affection) {
      if (affection >= 60) return pick(["Can't stop smiling at my phone. Your fault. 🙃", "Tonight was really good. Like, actually good. Same time tomorrow?"]);
      if (affection >= 35) return pick(["Got home safe. That was fun, honestly.", "Still thinking about that thing you said. Night 🌙"]);
      return pick(["Home. Thanks for tonight, I guess 😅", "That was… an evening. Let's see about tomorrow."]);
    },
    summary(history, location) {
      const u = history.filter(m => m.role === "user").map(m => m.content);
      const said = u.sort((a, b) => b.length - a.length)[0] || "not much";
      const place = { hotel: "the Lumen Hotel bar", rooftop: "the rooftop bar", beach: "the beach club", market: "the night market" }[location];
      return `We went to ${place}. The thing I remember most: "${said.slice(0, 120)}".`;
    },
  };
})();
