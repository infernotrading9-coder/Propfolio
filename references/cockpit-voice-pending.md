# Cockpit Voice — Pending Messages (not yet recorded)

L Lawliet voice. Boss/lender persona — Daniel is borrowing L's money to trade.
Status as of Oct 2026. Record these when tokens are available, then drop the mp3s
into `public/cockpit-voice/` and add the paths to `VOICE_CATEGORIES` in
`src/components/TradingModeCockpit.tsx`.

Naming convention: `<category>-<slug>.mp3` where category is one of
`pretrade`, `intrade`, `slhit`, `tradeloss`, `accountlost`, `maxaccounts`, `personal`.

---

## NEW CATEGORY — `personal` (insults / personal hits)

Daniel's words: *"I'm going to need more personalized messages in the cockpit,
need insults, make it nasty."* Tone: L as the lender, deadpan cruel, mocking the
gap between what he said as a kid and where he actually is. Text saved as-spoken
so it can be recorded verbatim.

Intended wiring: fires during **pre_trade idle** (when he's just sitting there
with nothing to do but think) — recommended. Could also be appended to `sl_hit`.

Slug names in brackets for when they're recorded.

1. **[personal-easy]** "Weren't you the guy who said getting rich was easy? Just stack your money, don't overspend, let it build. Mmm. I checked. Thirty-three. Living with your mother. Deep in debt. So — which part was the hard part?"

2. **[personal-seventeen]** "You told everyone money was simple. Stack it. Don't spend it. Wait. That was the entire plan. You've had seventeen years to run it, and I'm looking at the results. Where's the money, Daniel-kun?"

3. **[personal-cautionary]** "Getting rich is easy. You said that. With your whole chest. At sixteen. So I ran the numbers. Thirty-three years old, living in your mother's house, in debt up to your neck. That's not a rich man. That's a cautionary tale with a trading account."

4. **[personal-answer]** "I solve harder cases in an afternoon. Yours? You had the answer at sixteen and still managed to lose. 'Stack your money, don't overspend.' Genius. And yet — broke, in debt, at your mother's."

5. **[personal-bet]** "Let me say it back to you. 'Getting rich is easy.' You said that. You're thirty-three now. So either the strategy was wrong, or the person running it was. I know which one I'd bet on."

6. **[personal-fascinating]** "Mmm. You're losing my money, you're thirty-three, and you live with your mother. And you still tell yourself you understand how money works. Fascinating."

7. **[personal-slowly]** "The guy who said getting rich was easy is asking me for another account. Say that sentence again. Slowly. While you look at your balance. And your age."

8. **[personal-what-happened]** "Seventeen years to prove that 'getting rich is easy.' Instead: broke, in debt, in your mother's house. Remind me — what happened to easy?"

### `personal` — business framing

Daniel's words: *"Treat this like a business. It is a business. Make some messages from that."*
Angle: L is the **investor/lender**, Daniel is the **operator/manager**. The business lens is the discipline argument — rules, books, hours, overhead, revenue.

9. **[personal-biz-business]** "You keep calling this trading. It's not. It's a business. And a business that doesn't follow its own rules gets shut down. Act like an operator, not a gambler with a uniform."

10. **[personal-biz-hobby]** "Mmm. I see. You don't own a business. You own a hobby with a brokerage login. Businesses have budgets. They close on time. They don't chase back what they lost before lunch."

11. **[personal-biz-investor]** "I'm not your friend. I'm the capital. I don't fund feelings — I fund processes. Show me a process, or show me my money back."

12. **[personal-biz-overhead]** "Every loss is overhead. Overhead is fine, if the revenue covers it. So tell me: what's your revenue this month? Or are we just paying rent on a building nobody's shopping in?"

13. **[personal-biz-shopkeeper]** "Would you run a shop this way? Open whenever you feel like it, buy stock on impulse, sell at a loss because you got impatient. You'd be closed in a month. You are the shop."

14. **[personal-biz-payroll]** "You want this to pay you like a business, but you don't show up like one. No hours, no rules, no books. A business that doesn't keep books doesn't get to complain about the profit."

15. **[personal-biz-fired]** "If you were your own employee, you'd have fired yourself by now. Late, emotional, no plan, over budget. Fortunately for you I'm the investor — I don't fire people. I just stop funding them."

16. **[personal-biz-product]** "This is a business. The overhead is your losses. The product is your discipline. Right now you're selling nothing and paying overhead all day. Fix the product."

17. **[personal-biz-asset]** "You're not the boss here. You're the manager. The capital is the boss. Managers who lose the boss's money don't get promoted. They get replaced."

18. **[personal-biz-quiet]** "A real operator can sit in a quiet business all morning and touch nothing. That's not laziness. That's overhead control. Learn the difference."

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
| Personal (insults) | 0 | 8 |
| Personal (business framing) | 0 | 10 |
