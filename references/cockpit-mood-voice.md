# Cockpit — Mobile Mood Buttons ("Mindset") — CONCEPT + MESSAGES

Daniel's idea, Oct 2026. Mobile-only. Buttons describing **how he's feeling**;
tapping one plays an L-voice message to get him back into spirit.

His words: *"I'm going to have buttons describing how I'm feeling, for example,
motivated. And I'm going to make voice messages that will play to get me back
into spirit. Like, you're not young anymore. You're 33. You can't be wasting
around time just existing, not working, not generating money. You can't be
relaxing. You're 33."*

## SHIPPED (dev, Oct 2026) — `src/components/Dashboard.tsx`

- The **blue arcade button** opens a chooser: 📋 **Agenda** | 🗣️ **Mindset**.
  Cockpit-neon styling, matching the "What are you trading?" prompt
  (`px-6 py-5 rounded-2xl border-2 text-lg font-bold`, tint `color15`, border
  `color50`, glow `0 0 30px color20`). The button itself is a plain glossy
  circle again (the 3-dot glyph was removed at Daniel's request).
- **Mindset** = single-column big mood buttons (10), each `px-5 py-4 rounded-2xl
  border-2` with its own neon colour, a glowing bold label and a subtitle line.
  Container `max-w-md`, scrolls at `88vh`.
- Tapping plays a random clip `public/cockpit-voice/mood-<key>-<n>.mp3`
  (tries -1, -2, -3). Missing clips show
  `⚠️ No clip yet — record mood-<key>-1.mp3` so an unrecorded mood can't be
  mistaken for a broken button. Recorded ones show `🔊 <key>`.
- **On demand only** — these never fire on their own. He chooses the medicine.

### The 10 moods (as built)

| Emoji | Label | key | Colour | File to record |
|---|---|---|---|---|
| 🛋️ | Comfortable | `comfortable` | `#f59e0b` | `mood-comfortable-1.mp3` |
| 😶‍🌫️ | Unmotivated | `unmotivated` | `#94a3b8` | `mood-unmotivated-1.mp3` |
| 😴 | Tired | `tired` | `#818cf8` | `mood-tired-1.mp3` |
| 🥱 | Bored | `bored` | `#a78bfa` | `mood-bored-1.mp3` |
| 😤 | Tilted | `tilted` | `#ef4444` | `mood-tilted-1.mp3` |
| 😰 | Scared | `scared` | `#fb923c` | `mood-scared-1.mp3` |
| 🤑 | Greedy | `greedy` | `#eab308` | `mood-greedy-1.mp3` |
| 😞 | Discouraged | `discouraged` | `#64748b` | `mood-discouraged-1.mp3` |
| 📱 | Distracted | `distracted` | `#22d3ee` | `mood-distracted-1.mp3` |
| 🔥 | Motivated | `motivated` | `#a3e635` | `mood-motivated-1.mp3` |

Up to 3 clips per mood (`-1`/`-2`/`-3`), picked at random per tap. Drop extra
files in later — no code change.

---

## THE MESSAGES — 5 per mood (50 total)

### 🛋️ comfortable
1. "You're not young anymore. You're thirty-three. You can't spend your days just existing — not working, not generating money. Comfortable is the most expensive thing you own."
2. "Relaxing? You haven't earned relaxing. Relaxing is what you do *after* you've built something. Right now you're just sitting still with a good excuse."
3. "Mmm. You feel comfortable. Good. That is the exact feeling that keeps people broke for another ten years. Get up."
4. "Comfort is a slow leak. You won't notice it today. You'll notice it in five years when nothing has changed."
5. "You know what I would do? I'd be uncomfortable on purpose. Comfort is where ambition goes to die quietly."

### 😶‍🌫️ unmotivated
1. "Unmotivated. I see. Nobody is motivated. That's not a condition, it's an excuse. Motivated people are just people who started before they felt like it."
2. "You're waiting to feel like it? You're thirty-three. You've been waiting since sixteen. The feeling isn't coming. Start anyway."
3. "Motivation is a mood. Discipline is a decision. You don't need the mood — you need to open the chart and do the boring thing."
4. "Nobody is coming to motivate you. No manager, no alarm, nobody checking. That's the whole problem — and it's also the whole opportunity."
5. "Mmm. Unmotivated. Fine. Show up unmotivated, then. That's allowed. It's *not showing up* that kills you."

### 😴 tired
1. "Tired? Then close the laptop and sleep. Tired and trading is how you lose the account. Rest is a tool, not a reward. Use it properly."
2. "If you're too tired to follow your own rules, you're too tired to trade. That's not weakness. That's honesty."
3. "You're tired because you've been busy doing nothing all day. Go do one real thing, then rest. You'll sleep better."
4. "Sleep is maintenance, not laziness. But don't confuse resting with quitting — one recharges you, the other just delays."
5. "Mmm. Tired. Then why are you on the charts? Either you're sharp enough to execute, or you're done. There is no third state."

### 🥱 bored
1. "Bored. Mmm. Bored is what a gambler feels right before he does something stupid. An operator doesn't get bored. He waits."
2. "Nothing is happening, so you want to make something happen. That impulse has cost you more than any bad setup. Sit still."
3. "Bored? Good. Bored means you're not in a bad trade. That's a win. Count it, and keep waiting."
4. "The market is not here to entertain you. If you need entertainment, you're in the wrong business."
5. "You know what I would do? Eat a chip. Watch. Wait. The setup you're bored waiting for is the one that pays you."

### 😤 tilted
1. "Angry. I can hear it. Do you know what angry people do in markets? They donate. Close it. Walk."
2. "You lost. Now you want it back. That's not trading, that's revenge — and revenge doesn't have a stop loss."
3. "Step away from the desk. Right now. The market will still be here in an hour. Your money might not be."
4. "You're one click away from doing something you'll regret tomorrow. That click is the most expensive one you'll ever make. Don't."
5. "I've solved murders with less emotion than you're showing right now. Breathe. Then walk away."

### 😰 scared
1. "Scared? Good. Scared means you understand the risk. Now take the setup you already planned, or take nothing. Don't invent a third option."
2. "Hesitation isn't caution. Caution is a rule. Hesitation is fear wearing caution's clothes."
3. "You planned this trade when you were calm. Trust the calm version of you — not the one at the keyboard right now."
4. "Fear is information. Ask it what it's telling you: a real risk, or just a bad night's sleep? Only one of those means skip the trade."
5. "If you can't take the setup properly, you don't get to take it badly either. Either execute the plan or close the laptop."

### 🤑 greedy
1. "You're up and you feel invincible. That feeling has a name: tomorrow's drawdown. Take the profit. Lock the account."
2. "Greed is the most expensive emotion you own. You don't need the whole move — you need the plan's move."
3. "Green does not mean keep going. Green means you did the job. The job ends when you say it ends — not when the market stops giving."
4. "You know what I would do? Take my cut and close the tab. The market gives, and the market takes — and it takes most from the ones who just got paid."
5. "Winning feels like skill. Often it's just the market being generous. Don't confuse the two — the generous days are what fund the honest ones."

### 😞 discouraged
1. "You feel like it's pointless. That is the exact feeling that separates the ones who make it from the ones who quit at the worst possible moment. Keep going."
2. "Discouraged after a loss? The loss is tuition. Quitting now means you paid for nothing."
3. "Every trader you admire has had this exact night. The difference is what they did the next morning."
4. "You're not behind. You're early — and early feels exactly like failing. Ask anyone who has built anything."
5. "Mmm. Pointless. Do you know what's actually pointless? Starting twice. You're halfway up the hill. Don't walk back down."

### 📱 distracted
1. "You're doing everything except the thing. That's not being busy, that's hiding. Open the chart."
2. "Procrastinating again? The work doesn't care that you're not in the mood. Neither do I."
3. "Your phone isn't the problem. Your phone is where you go to avoid the problem. Put it in the other room."
4. "Ten minutes of real work beats three hours of feeling like you're about to start. Prove me wrong."
5. "You know what I would do? Close every tab that isn't the trade. The work is one window. Everything else is escape."

### 🔥 motivated
1. "Good. Motivation is fuel. But fuel burns. Build the system that works when the fuel is gone."
2. "You feel it today. Good. Write down why — you'll need it next week when you don't."
3. "Motivated? Prove it. Open the charts and *wait* for the setup, instead of forcing one because you feel good."
4. "Feeling good is the most dangerous state in trading — it's when you size up and skip the rules. Stay disciplined while you're flying."
5. "Mmm. Motivated. Spend it on the boring thing: the journal, the review, the plan. That's what motivation is actually for."

---

## Open questions

- Buttons are **"how I feel now"** (L snaps him out), per Daniel's example. `motivated`
  therefore gets *fuel to keep going*, not a push.
- Possible extra moods he mentioned in passing: `revenge`, `phone-in-hand`,
  `greedy-after-a-win`. Not built yet.
