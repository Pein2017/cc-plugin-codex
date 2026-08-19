# A field report on Codex token efficiency

Hi Tibo. I’ve been a GPT power user since the ChatGPT 3.5 days, and I want to start by saying that Codex is genuinely great. But since GPT-5.6 launched, my $200 weekly allowance can disappear in half a day.

Back in the 5.3/5.4 era, I could give a session an auto-research goal and let it run for 24 hours without coming close to exhausting my tokens. (Probably a little too comfortable, admittedly. My inner researcher was quietly pleased that researchers weren’t getting automated away just yet.) With 5.6, or perhaps more specifically multi-agent v2, I can burn through what used to be a week’s worth in a single day.

There has already been plenty of community discussion around the model itself being “over-engineered,” so I won’t repeat that. Instead, I audited four of my long-running sessions line by line: 145 MB of rollout history, roughly 1.4B tokens in the root threads, plus another ~1.1B in child-agent threads. None of these examples used Ultra mode. Xhigh was the highest setting I used.

What I found on the harness side feels like a red signal.

## 1. Long-running tasks turn into polling loops (my biggest issue)

Once a task becomes long enough that the root needs to wait for sub-agents or long-running commands, polling is effectively its only option. Two multi-day implementation sessions were especially bad: in one session, wait/wait_agent accounted for 40.8% of all tool calls (704 / 1,747). Another accumulated 1,169 waits. Across the four sessions, 25.7% of all tool calls were pure waiting.

The problem isn’t waiting itself. The problem is that every wait timeout appears to re-enter the model with the full context. Long-running jobs also have the largest contexts, so every polling hop is maximally expensive. Then the snowball starts:

poll → larger context → compaction → expensive re-entry → poll again.

Those four sessions compacted 42 / 13 / 9 / 11 times respectively. In my usage, output tokens were only ~0.2% of the total. More than 97% was context being resent.

This seems structural rather than a usage mistake. Child-agent completion messages use trigger_turn:false, while followup_task cannot target the root, so an idle root cannot be awakened by its own child agent. With a default wait timeout of only ~30 seconds, the root effectively pays for another full-context inference every 30 seconds while doing nothing.

There are already similar reports on GitHub: #15723 describes the same pattern, and another user measured polling at 19.8% of their total token volume in #35259. That lines up remarkably well with what I’m seeing.

## 2. Spawn / fork instruction-following is unreliable, and mistakes are catastrophically expensive

I explicitly specify fork_turns:"none" in both my prompt and skill, but the model does not follow it consistently and will still sometimes decide to fork all history.

One violation was spectacular: a reviewer agent spawned with fork_turns:"all" consumed 318.6M tokens. Its output was never even consumed by the root because the session later died from a transport error. A reviewer for the same task with targeted context used only 17.9M tokens: an ~18x difference.

Full-history fork combined with inherited parent model + effort is an extremely dangerous default. #14116 reports a similar case where a single child consumed 264M tokens.

## 3. Superpowers as a default curated plugin seems to amplify GPT-5.6’s existing tendencies

I noticed recent versions include superpowers in the default curated plugins. On my machine it’s openai-curated-remote/superpowers/6.2.0. This is interesting because not long ago the mood on X seemed closer to “maybe we should stop using superpowers.” I’m curious whether newer models were trained or tuned more deeply around its workflow.

For someone like me who is not a senior software engineer, the process discipline is genuinely useful. But combined with 5.6’s tendency to over-review and over-expand scope, the cost becomes enormous.

In one implementation session, the lead directly modified 85 files. 59 of them (69%) were superpowers-style ledgers / reports / process artifacts. Only 26 were actual source code or tests.

The review pattern is similar: the lead routinely gives reviewer agents higher effort than implementation agents. In other words, the default budget for “being suspicious of the work” can exceed the budget for actually doing the work. That seems backwards if speed and token efficiency matter.

## 4. I accidentally got a useful control experiment

After exhausting my Codex allowance, I had to let Claude Code read the Codex session history and take over the unfinished implementation. In one day it produced 36 commits and 50K+ lines, and passed independent review.

To be fair, it inherited Codex’s design work and some already-validated but uncommitted implementation, and some Codex interruptions were caused by me manually pausing sessions. So I’m not claiming a clean model-vs-model benchmark.

But two observations seem meaningful.

First, that Claude Code environment did not have superpowers installed, yet it completed the same project very efficiently. Process ceremony was clearly not necessary for the work to succeed.

Second, I previously built a cc-plugin-for-codex setup where Codex acted as the “brain” and delegated implementation to Claude Code as a sub-agent. The implementation throughput was poor enough that I initially thought Sonnet/Opus simply weren’t that impressive.

Only after using Claude directly did I realize that much of the difference was in orchestration, not raw model capability.

Fable feels almost like having a principal investigator supervising a lead in another thread: I can keep talking to it while execution continues elsewhere, and the work reliably progresses. I’ve seen other users make a similar observation: under Fable-style orchestration, even Sol suddenly feels much more token-efficient.

Same user, same kind of work, very different agent harness, radically different outcome.

There’s also an implementation detail worth borrowing: Claude Code’s waiting is event-driven. When a child agent or background task finishes, a task notification wakes the main thread. It also has Monitor-style primitives where the harness can wait for a condition such as a process exiting, a file appearing, or output stalling, and only wake the model when the condition is satisfied.

Zero tokens are spent while waiting.

So “long-running tasks shouldn’t burn tokens while idle” is clearly an engineering-solvable problem. What Codex seems to be missing is the wake-up path.

## 5. A note on Sol itself

Token efficiency has historically been one of GPT’s biggest strengths, and I worry 5.6-sol may have regressed badly here.

It is absolutely capable. For math and research, I often find it more exploratory and creative than Fable. But execution can be painfully inefficient: repeated reviews and audits, unnecessary branches, scope expansion that I did not ask for. In several cases it only tightened up after I opened a side chat and explicitly asked, “Why is this moving so slowly?”

I’m not a senior engineer, and my architecture prompts are certainly imperfect. But that is exactly where a frontier model should add intelligence: infer the user’s actual intent and turn it into working software, rather than requiring the user to first become a perfect software architect.

## What I’d love to see

1. Ship “child completion wakes root.” Durable sleep / clock.sleep is already in HEAD; connecting that wake-up path could eliminate a huge fraction of polling immediately.

2. Move toward event-driven waiting, similar to task notifications / Monitor: let the harness register a condition and wake the model only when it fires, with zero inference while idle. At minimum, dramatically increase the default ~30s wait timeout.

3. Tighten spawn defaults and instruction-following. Missing fork_turns should not implicitly mean “fork the entire conversation,” and an explicit fork_turns:"none" should be treated as a hard constraint.

4. Calibrate Sol toward execution: less unsolicited scope expansion, and don’t make review effort systematically larger than implementation effort. I’d also seriously re-evaluate the interaction between superpowers-as-default and 5.6’s natural behavior.

5. Persist child-agent rollouts and attribute usage per child. I have one session with 97 spawn calls and zero child rollouts left on disk. Hundreds of millions of tokens can disappear without any practical way for the user to audit where they went.

One last aside: I’ve also been experimenting with an open-source project called HarnessDock (the repo this note lives in). The idea is to use the Codex App as the primary “brain” while dispatching and coordinating sub-agents / threads across different harnesses. Instead of forcing every model into the Codex harness, each model stays inside the environment it works best in, while Codex orchestrates them.

The wake-up / polling problem above is exactly the wall I keep hitting when doing cross-harness orchestration, so consider this post a field report from someone spending a slightly unreasonable amount of time at the edge of this system.

I wrote this much only because I care about where Codex is going.

---

P.S. For scale, this is the account the numbers above come from:

![Codex profile stats: 110.8B lifetime tokens, 3.2B peak tokens, 20h 32m longest chat, 182-day current and longest streak](./codex-profile.png)
