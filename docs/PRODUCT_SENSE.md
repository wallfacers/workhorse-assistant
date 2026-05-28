# PRODUCT_SENSE.md

What we are building and — more importantly — what we are not.

## Identity

**Workhorse Assistant** is a desktop AI assistant for people who think in long
sessions: writers, researchers, engineers, analysts. It optimises for *one*
person working with *one* agent for *hours*, not for casual one-shot prompts.

It is **not**:

- A messaging app (no multi-user threads).
- A team collaboration tool (no shared state across users).
- A general-purpose chat client (no model marketplace, no plugin store).
- A mobile-first product (desktop only, by design — see below).

## Why desktop

The renderer is a sandboxed WebView. Putting privileged work in a native
process buys us three things the browser cannot offer:

1. **Secret custody.** API keys live in OS keyring, not localStorage.
2. **File system trust.** Users can drop a 500MB CSV in without consenting
   to upload it.
3. **Long-lived background work.** Indexing, embedding, summarisation can run
   while the user is in another window without a tab being suspended.

If a feature can be done equally well in a browser tab, it probably should be.
"Probably should be" means it does not belong here.

## Audience

Imagine **the patient power user**: comfortable with a CLI, tolerant of an
unpolished v0.1, intolerant of magical opaque behaviour. They want to *see*
what the agent did and *undo* it cleanly.

We are explicitly **not** building for:

- The user who needs a hand-held onboarding flow with empty-state confetti.
- The user who would prefer a different model "vibe" each week.
- The user who wants their data synced to a vendor cloud by default.

These users are well-served elsewhere; serving them here would compromise
the patient power user.

## Taste

Three load-bearing aesthetic decisions:

1. **Quiet, not minimal.** Minimal UIs hide affordances; quiet UIs make
   the right thing obvious without shouting. We err on the side of *labelled
   buttons over icon-only*, *visible state over hover-reveal*.
2. **Type does the work.** Strong type hierarchy, generous line-height,
   short measure. Everything else (chrome, color, motion) is secondary.
3. **Motion is structural.** Animation conveys *where things went* (panes
   opening, items moving). It never decorates.

When a design decision conflicts with these, the decision loses.

## Naming

- The product is **Workhorse Assistant**.
- The Rust crate is `workhorse-assistant` / `workhorse_assistant_lib`.
- The bundle identifier is `com.workhorse.assistant`.
- Internally, "the renderer" / "the core" / "a command" / "a pane".
  Avoid metaphors that imply server architecture ("client", "server") since
  there is no server.

## The "would this surprise a user?" test

Before adding any background behaviour (file access, network call, telemetry,
auto-save to disk, model download), ask: **would a careful user be surprised
to learn this is happening?** If yes, surface it. If you cannot surface it
gracefully, do not add it.

This is the single highest-leverage product rule in the repo.

## What "good v1" looks like

- Three panes, one model, one local store.
- Conversations persist on disk in plain JSON the user can open in `cat`.
- Every long-running operation has a visible progress affordance.
- The user can quit, reboot, and resume the last conversation in < 2 seconds.
- No telemetry. No auto-update. No first-run tutorial.

If a proposed feature does not move v1 closer to that picture, it goes in
[`exec-plans/tech-debt-tracker.md`](./exec-plans/tech-debt-tracker.md) as a
"not now."
