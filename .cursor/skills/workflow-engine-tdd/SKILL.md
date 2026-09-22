---
name: workflow-engine-tdd
description: Disciplined test-first procedure for Kisi workflow-engine domain behavior and shared Zod workflow schemas. Use when implementing or modifying packages/shared types/schemas, apps/api engine logic (path, template, transform, filter, http_request, runner), or when the user asks for TDD on this repo.
---

# Workflow Engine TDD

Test-first procedure for `@kisi-workflow/shared` schemas/types and `apps/api` workflow-engine domain logic. Do not implement behavior before a failing test exists.

## When to use

- Adding or changing workflow/step/run Zod schemas or inferred types
- Adding or changing engine behavior: dot-path, template, transform, filter, HTTP request, runner/status
- Fixing a failing engine or schema test

Do not treat this skill as permission to also change Fastify CRUD, Prisma, the React UI, deploy config, or to add a runs API.

## Repo map

| Concern | Location |
| --- | --- |
| Zod schemas + types | `packages/shared` (`@kisi-workflow/shared`) |
| Engine | `apps/api/src/engine/` |
| Schema tests | `packages/shared`, beside the schemas |
| Engine unit tests | `apps/api/src/engine/**/*.test.ts` (Vitest, no DB) |
| HTTP adapter | Fastify routes — thin; not the engine |

Types are `z.infer<typeof Schema>`. Do not duplicate workflow, step, or run types in `apps/api` or `apps/web`.

Preserve TypeScript strictness: keep `strict`, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax` from `tsconfig.base.json`. No `any`, no non-null assertions to satisfy tests, no relaxed compiler flags.

## Procedure

1. **understand the existing Zod schema/types before implementation**
   - Read the current schemas in `packages/shared` and the engine functions you will touch.
   - State the behavior change: inputs, `ctx` effects, and run status (`success` | `skipped` | `failed`).
   - If the contract changes, design the Zod update first. Types follow the schema; do not hand-write a parallel interface.

2. **write focused failing tests first**
   - One rule per test. Include the nearest edge (missing path, invalid step, retry vs no-retry).
   - Schema tests: accept valid definitions; reject invalid ones (issue paths matter).
   - Engine tests: no database. Mock `fetch` for `http_request`.
   - Run only those tests and confirm they fail for the intended reason before writing production code.

3. **implement the smallest change required**
   - Edit only the schema and/or engine files the tests require.
   - **keep workflow engine logic pure/testable where practical**: transform and filter are in-memory `ctx` functions; the runner returns a result; persistence and routes stay outside the pure core. Inject or mock outbound HTTP.
   - **avoid unrelated changes and scope creep**: no drive-by refactors, extra step types, public `GET /workflows/:id/runs`, or UI/Prisma work unless that is the asked task.

4. **run focused tests, then the relevant full test suite**
   - Focused: `npm test -w @kisi-workflow/shared -- <file>` and/or `npm test -w @kisi-workflow/api -- src/engine/<file>` (or the workspace equivalent once `test` scripts exist).
   - Then the touched workspace suite: `npm test -w <workspace>`.
   - After schema/type edits: `npm run typecheck`.
   - Do not stop after the new tests pass if the workspace suite or typecheck still applies.

5. **report files changed and verification results** using the template below.

## Engine invariants (do not silently change)

- Transform ops: `template` | `default` | `pick` only; no side effects; missing get → `null`; missing template values → `""`.
- Filter: `eq` / `neq`, AND, no `ctx` mutation; mismatch → `skipped`.
- HTTP: retry network errors and 5xx only; do not retry 4xx (including 429); honor shared-schema `timeoutMs` / `retries` caps.
- Stop on first failed step. Empty `steps` → `success`.
- Shared schemas are the source of truth; the engine may defensive-parse before execute.

## Report template

```
## TDD result
- Behavior:
- Tests added:
- Implementation:
- Files changed:
- Verification:
  - focused: <command> → <pass/fail>
  - suite: <command> → <pass/fail>
  - typecheck: <command> → <pass/fail> | skipped (no type/schema change)
```
