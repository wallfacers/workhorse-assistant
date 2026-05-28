# Product Specs — Index

A product spec describes **what the user can do** and **why**. It does not
prescribe implementation; that lives in `docs/exec-plans/`.

## Active specs

| Spec | State | Last reviewed | Owner |
| --- | --- | --- | --- |
| [Agent Workspace](agent-workspace.md) | draft | 2026-05-29 | wallfacers |

## How to write a spec

A good spec has five sections, in order:

1. **Who** — the specific user this serves. If you cannot picture one
   person, the spec is not ready.
2. **What** — the smallest user-visible behaviour that delivers value.
3. **Why** — the user need this addresses; the evidence that the need
   exists.
4. **Success** — how we know the spec landed. Concrete and observable.
5. **Anti-success** — what we are *not* solving and would refuse to add to
   this spec even if asked.

A spec without "Anti-success" tends to grow until it cannot ship. Always
include it.

## Lifecycle

1. **Draft** — file lives under `docs/product-specs/`; row added here with
   state `draft`.
2. **Validated** — at least one concrete agreement that the spec describes
   the right problem. Note the validation in the file.
3. **Active** — an exec-plan is open against this spec.
4. **Shipped** — feature is live; spec stays as the canonical description.
5. **Retired** — feature removed or replaced; spec is kept for history.

## Relation to product taste

The spec answers *what* and *why*. The product taste rules in
[`../PRODUCT_SENSE.md`](../PRODUCT_SENSE.md) are the filter on **whether the
spec belongs to this product at all.** A spec that conflicts with
`PRODUCT_SENSE.md` cannot become active without first amending `PRODUCT_SENSE.md`
and getting that amendment reviewed.
