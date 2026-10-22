---
title: The Prioritization Question Most AI Frameworks Skip
date: '2026-10-19T10:11:29.210Z'
slug: the-prioritization-question-most-ai-frameworks-skip
excerpt: >-
  Impact and feasibility don't tell you how a project fails — here's the missing
  question: what does it cost you if the AI is wrong, and how long before you
  notice?
---

Most advice on prioritizing AI use cases asks two questions: how much impact would this have, and how feasible is it to build? Those are reasonable questions, but they both assume the project goes well. Neither one asks the question that actually determines how risky a use case is to attempt first: what does it cost you if the AI is wrong, and how long does it take you to notice?

That third question — call it the cost of being wrong — deserves equal billing with impact and feasibility. It's the difference between a use case that fails loudly and cheaply, and one that fails quietly and expensively. Ignoring it is how a team ends up with a technically successful pilot that nobody trusts, or a confident rollout that causes real damage before anyone catches it.

## Impact and feasibility don't tell you how a project fails

A high-impact, highly-feasible use case can still be a bad first project if getting it wrong is costly or hard to detect. Picture two candidates with identical impact and feasibility scores: one drafts internal summary notes that a person reviews before anyone else sees them, and the other automatically adjusts prices or sends messages directly to customers with no review step. On paper, both might score the same. In practice, they carry completely different risk, because one has a human checkpoint before anything goes wrong in public, and the other doesn't.

The standard framework has no slot for this distinction. It treats "ships to production" as the finish line, without asking what happens in the specific case where the model gets something wrong — and every model, at some rate, gets something wrong.

## Ask how visible a mistake would be

For any candidate use case, walk through what a bad output actually looks like. Is it something a person sees and can immediately correct, like a draft that gets edited before it's used? Or is it something that propagates silently — a miscategorized record, a wrong number entered somewhere downstream, a decision made on bad input three steps removed from where anyone would look? Mistakes that are visible and local are cheap, even if they happen somewhat often. Mistakes that are invisible and propagate are dangerous even if they happen rarely, because by the time you find one, there may be dozens more sitting undetected.

This is a different axis than feasibility. A use case can be technically easy to build and still have a nasty failure mode if a wrong output doesn't announce itself.

## Ask how reversible the action is

The second part of the question is reversibility. If the AI gets something wrong, can you undo it? A chatbot answer that's off-base can be corrected in the next message. A document that's auto-filed in the wrong place can usually be moved. But an email sent to a customer, a record deleted, or a transaction processed can't be quietly taken back — the mistake is already out in the world. Use cases involving irreversible, outward-facing actions deserve a higher bar for accuracy and a longer period of human review before you let them run unsupervised, regardless of how much time they'd save if they worked perfectly.

## Build this into how you rank, not just how you build

The point isn't to avoid high-stakes use cases — some of them are exactly where the impact lives. It's to sequence your work so you're not learning what "good enough" accuracy looks like on your riskiest process first. A sensible rule of thumb: start with use cases where mistakes are visible and reversible, even if the impact is modest, and use what you learn there — about your data, about how often the model actually gets things wrong, about how much review it really needs — before moving to use cases where mistakes are silent or permanent. By the time you tackle the higher-stakes project, you'll have a realistic sense of your error rate and the review process to catch it, instead of a guess.

Add one line to whatever prioritization method you're already using: for each candidate, write down what a mistake would look like and whether you could undo it. That single addition catches the risky projects that a pure impact-versus-feasibility view would wave straight through.

If you're trying to figure out which of your AI ideas is actually safe to go first, that's a conversation worth having before you commit engineering time to any of them. [Book 30 minutes on our calendar](https://calendly.com/brian-kaidonlabs/30min) or reach out through our [contact page](/#contact) — no pressure, just a second opinion on the risk side of the equation.
