# `docs/generated/` — Machine-generated artefacts

Everything in this directory is produced by tooling. **Do not hand-edit.**
If a file here is wrong, fix the generator, not the file.

## Expected residents

| File | Source | Generator |
| --- | --- | --- |
| `db-schema.md` | SQLite migrations | (TBD) — script under `scripts/` |
| `ipc-contract.md` | Rust `#[tauri::command]` signatures | (TBD) — `cargo run --bin gen-ipc-md` |
| `design-tokens.md` | `docs/DESIGN.md` | `npx @google/design.md spec` (manual today) |

None of these exist yet; rows will appear here as generators land.

## Why we commit generated files

Generated docs are committed (rather than `.gitignore`d) so the agent can
read them in-place without needing to run the generator first. The CI job
re-runs every generator and fails the build if the committed copy is stale.

## Adding a generator

1. Land the generator script under `scripts/` (or as a `cargo` binary).
2. Wire it into `npm run <name>` or `cargo run --bin <name>`.
3. Add it to the table above with its source and command.
4. Add a CI step that runs the generator and `git diff --exit-code` against
   `docs/generated/`.
