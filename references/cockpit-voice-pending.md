# Cockpit Voice — Pending Messages (not yet recorded)

L Lawliet voice. Boss/lender persona — Daniel is borrowing L's money to trade.
Status as of Oct 2026. Record these when tokens are available, then drop the mp3s
into `public/cockpit-voice/` and add the paths to `VOICE_CATEGORIES` in
`src/components/TradingModeCockpit.tsx`.

Naming convention: `<category>-<slug>.mp3` where category is one of
`pretrade`, `intrade`, `slhit`, `tradeloss`, `accountlost`, `maxaccounts`.

---

## Replacements for rejected messages (pick one option each)

### tradeloss-* (slot #7)
**A)** "I've been keeping track. You're down to your last few attempts for this session. I don't need to remind you what happens when they run out. So I won't."

**B)** "The math is simple. You have fewer tries than you did an hour ago. The market doesn't care about your feelings. Neither do I. Only the process matters."

### tradeloss-* (slot #8)
**A)** "You're one bad decision away from this account locking. That's not a threat. That's arithmetic. Choose accordingly."

**B)** "This is the part where most people blow it. Not because the setup was bad — because they knew the limit was close and traded like it wasn't. You're better than most people. Prove it."

### tradeloss-* (slot #10)
**A)** "The account locks after this. Lose, and you're done for the day. Win, and you walk. Either way, this is the last one. Make it count."

**B)** "Last call. When this trade closes, this account closes. Whatever happens, happens. What matters is that you followed the plan. That's the only thing I'm grading you on."

### accountlost-* (slot #10)
**A)** "That account is gone. I want you to sit with that for exactly ten seconds. Not to punish yourself — to remember. Now close the tab and move to the next one."

**B)** "You lost the account. I'm not going to lecture you. You already know what you did. What I want to know is what you're going to do differently. And 'try harder' isn't an answer."

---

## New messages — ran out of tokens before generating

### maxaccounts (slots #5-10)
5. "You know what I would do if I lost everything I invested in a day? I'd go eat something sweet and think about what went wrong. I suggest you do the same."
6. "You're out of accounts. My money is done being risked for today. Come back tomorrow with a clear head and a plan. I'll be here. The market will be here. The losses will still be waiting."
7. "Zero accounts remaining. That's a complete session loss. Do you know what I call this? Data. Valuable, actionable data. You're one step closer to figuring out what works."
8. "All accounts locked. The experiment is over for today. Tomorrow we reset and try again with the same accounts. Same rules. Same expectations. Don't let me down twice in a row."
9. "Empty. Every account gone. You have nothing left to trade. That feeling you're feeling right now? Remember it. Let it fuel you. Let it sharpen you."
10. "Done for the day. All money is now safe. No more risk. No more decisions. I'll allow you to borrow again tomorrow. Assuming you've earned that right."

---

## Recorded so far (50/60)

| Category | Recorded | Target |
|---|---|---|
| Pre-trade | 10 | 10 |
| In-trade | 10 | 10 |
| SL Hit | 10 | 10 |
| Trade Loss Limit | 7 | 10 |
| Account Lost | 9 | 10 |
| Max Accounts Lost | 4 | 10 |
