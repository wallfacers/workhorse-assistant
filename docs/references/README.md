# `docs/references/` — Third-party reference snapshots

This directory holds **agent-readable snapshots of external documentation**.
The convention is `<topic>-llms.txt` — plain text optimised for an LLM
context window, not a human reader.

## Why we vendor these

- The agent works offline (no network in the sandbox).
- Upstream docs change; a vendored snapshot pins behaviour to a known version.
- A small curated subset beats a 1000-page firehose for in-context grounding.

## Naming

- `<topic>-llms.txt` — primary file. Plain text. Aggressively trimmed.
- `<topic>-llms.md` — optional Markdown variant if the topic genuinely needs
  structure.
- `<topic>-source.md` — provenance: where the snapshot came from, the version
  / commit pinned, the date pulled, and *what was cut*.

Always include the `-source.md` companion. A snapshot without provenance is
worse than no snapshot.

## What belongs here

- Format specs we follow (e.g., `design-md-spec-llms.txt`).
- Build-system docs we depend on (e.g., `nixpacks-llms.txt`, `uv-llms.txt`).
- Library docs whose stable subset we lean on (e.g., `tauri-v2-llms.txt`).

## What does **not** belong here

- Tutorials and "getting started" prose — too volatile, too long.
- Forum threads, blog posts, anything paywalled.
- Anything the agent can derive from reading our own code.

## Adding a reference

1. Pull the source (link or `wget`); pin the commit / version.
2. Trim aggressively: keep schemas, type signatures, "do this not that"
   rules; drop marketing prose, anecdotes, FAQs.
3. Save as `<topic>-llms.txt`.
4. Add a `<topic>-source.md` companion with provenance.
5. Reference it from whichever top-level doc uses it (e.g., link
   `tauri-v2-llms.txt` from `ARCHITECTURE.md` once the agent needs it).

## Current snapshots

| Topic | File | Source | Pulled |
| --- | --- | --- | --- |
| _none yet_ | — | — | — |
