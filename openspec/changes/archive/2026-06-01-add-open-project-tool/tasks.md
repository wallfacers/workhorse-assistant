# Tasks — add-open-project-tool

> All work is in `workhorse-assistant` renderer (TS). No Rust, no sidecar (Go)
> changes — `GET /v1/fs/list` (`fsList`) and `agent_attach`
> (`useSession().openProject`) already ship. Purely additive: manual project
> switching and the existing picker behave identically when no agent request is
> pending. Groups A–B are independently shippable; C–D add the confirm flow.

## A. `get_current_project` reader

- [x] A1 New `useAgentProjectTools` hook (`src/components/.../useAgentProjectTools.ts`),
      mirroring `useAgentTabTools`: live `useSession` state read through refs,
      `registerState` on mount, unregister + `republishCatalog` on unmount.
- [x] A2 Register `get_current_project` (reader) returning
      `{ path, label, recentPaths }`; rich `description` + per-property schema
      `description`s per the LLM tool conventions.
- [x] A3 Mount the hook where the agent tool surface is assembled (alongside
      `useAgentTabTools`); confirm it appears in the published catalog.
- [x] A4 Unit test: reader returns current/recent from a mocked session; empty
      state does not throw.

## B. `open_project` action — direct mode

- [x] B1 Register `open_project` (action, parallel-unsafe) in `useAgentProjectTools`
      with `inputSchema` `{ path: string, confirm?: boolean }` and `outputSchema`
      `{ opened, path?, label?, cancelled? }`, every property `description`d.
- [x] B2 Direct handler (`confirm` falsy): `fsList(path)` → on ok call
      `openProject(resolvedPath)` and return `{ opened:true, path, label }`.
- [x] B3 On `fsList` miss: throw a `ToolError` (`not_found`/`validation`) whose
      message carries the nearest valid parent or a suggested path, so the model
      self-repairs in one retry. Never return bare null.
- [x] B4 Derive `label` as the path basename (reuse the `TitleBar` label logic /
      `parentOf`-style split) for a consistent display name.
- [x] B5 Unit tests: valid path switches + returns confirmation; bad path yields
      a self-repairing error and performs no switch.

## C. Shared pending-picker request (session store)

- [x] C1 Add a `pendingPickerRequest` slice to the session store:
      `{ path, resolve, cancel } | null`, with actions to set and clear it.
- [x] C2 `useSession` exposes `requestPicker(path): Promise<string>` that sets the
      slice and returns a promise settled by `resolve`/`cancel`.
- [x] C3 Supersede/teardown rule: setting a new request while one is pending
      `cancel()`s the old; clearing always settles the promise.
- [x] C4 Unit tests: resolve path, cancel, and supersede all settle the promise
      exactly once.

## D. `open_project` action — confirm mode + picker wiring

- [x] D1 Confirm handler (`confirm: true`): call `requestPicker(path)`; on resolve
      `openProject(picked)` → `{ opened:true, path:picked, label }`; on cancel →
      `{ opened:false, cancelled:true }`.
- [x] D2 Emit a one-line assistant-visible hint ("已为你打开项目选择器，请确认路径")
      when the confirm picker opens (i18n string).
- [x] D3 Reject a second concurrent confirm with a clear "picker already open"
      error (actions are serialized, so this is a guard against edge races).
- [x] D4 `ProjectBrowser` gains optional `initialPath?: string`; when set, the
      first `load(initialPath)` starts there. Manual open passes nothing →
      unchanged (starts at `default_workdir`).
- [x] D5 `ProjectSwitcher` subscribes to `pendingPickerRequest`: on non-null,
      open the popover in `browsing` mode with `initialPath = request.path`; on
      `onPick` `resolve(picked)` + clear; on dismiss/outside-click `cancel()` +
      clear; on unmount `cancel()` any outstanding request (no leak).
- [x] D6 Unit/interaction tests: confirm opens pre-filled popover; pick returns
      edited path; cancel returns `{cancelled:true}`; manual open unaffected.

## E. Polish & gates

- [x] E1 i18n keys for the chat hint and any new picker copy.
- [x] E2 `npm run lint` clean (type-check gate before commit).
- [ ] E3 Manual smoke (Windows build per project constraint): agent direct-open,
      agent confirm-open + edit, agent confirm-open + cancel, manual switch
      regression.
