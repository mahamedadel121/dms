# DMS (Dooo) project rules

## Hard rules
- **This project stays 100% LOCAL.** No GitHub at all: never add a git remote, never `git push`, never use `gh`, never create repos/PRs/issues/Actions, never upload code anywhere. Local `git commit` only. CI is local: `scripts/ci.sh` / `scripts/ci.ps1` (no `.github/workflows`).
- Source of truth: `docs/PLAN.md`, `docs/DECISIONS.md`, `docs/REQUIREMENTS.md`, `packages/db/prisma/schema.prisma` (frozen after WP0). Contract fixes: one line in `docs/CONTRACT_NOTES.md`.
- No Docker, Redis or MinIO on this machine. `docker-compose.yml`/`Dockerfile` are files only, never run.
- Reply to the owner in Egyptian Arabic; code, prompts, comments and docs in English.

## Phase 2 (approved plan, not yet started as of 2026-11-10)
- **The ONLY Phase 2 plan is `docs/plan-v2/`**: `PLAN_V2.md` (gaps, tests, work packages, briefs), `DESIGN_SPEC.md` (full "Majlis" redesign), `TESTING_GUIDE.md`, `OWNER_DECISIONS.md`. `docs/PLAN_PHASE2.md` is SUPERSEDED — never execute it.
- When the owner says "start Phase 2" / "ابدأ التنفيذ": the main session only orchestrates. Follow `PLAN_V2.md` §8: run the §4.1 install step yourself → launch F1/F2/F3 → gate G0 (`pnpm -r typecheck`, `pnpm lint`) → launch W1–W9, A1–A6, T1, H1 in parallel with the §8.4 preamble + §8.5 brief each → Z integration (§9). Models per §8.2 (Sonnet; Haiku for H1). Fable is for planning/advice only — do not use it for implementation.
- **Tests are WRITTEN, never RUN on this machine** (the developer runs them per `TESTING_GUIDE.md`). Agents may only run `tsc --noEmit` and lint. No vitest, playwright, `next build`, servers, `pnpm demo`, migrate or seed.
- Owner decisions in `OWNER_DECISIONS.md` use Fable's defaults unless the owner says otherwise at kickoff. If time is short, apply the cut list in `PLAN_V2.md` §10.

## Layout and conventions
- pnpm monorepo: `packages/{shared,db,core}`, `apps/{api,web,bot,worker}`, `e2e`. No build step for packages: `main/exports` point at `src/*.ts`.
- `@dms/core` = framework-free domain logic, subpath imports only (`@dms/core/engine`), no root index. Web imports only `@dms/shared`.
- Strict TS, Bundler resolution, no `.js` import suffixes. API uses SWC (decorator metadata): `node -r @swc-node/register`, Vitest with `unplugin-swc`. Everything else runs with `tsx`.
- Every API handler carries `@RequirePermission(...)`, `@AuthOnly()` or `@Public()` (meta-test enforces it). Bodies via `ZodPipe`. Errors are `{ error: { code, message, details? } }`. Money = decimal strings.
- Tables snake_case, columns camelCase (quote them in raw SQL). Never hard-delete referenced rows.
- Tests: every file calls `setupTestDb('<wp>-<name>')` (clone of `dms_template`), never touches `dms`. Never weaken a test to make it pass.

## Commands
- `pnpm db:up` (start local Postgres on :54329, run from PowerShell or any shell; idempotent) · `pnpm db:down` · `pnpm db:status`
- `pnpm db:migrate` (migrate `dms`, rebuild `dms_template` + base seed) · `pnpm db:seed` · `pnpm db:generate` (fails with EPERM while node processes hold the engine DLL)
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm ci` (all local) · `pnpm dev` · `pnpm e2e` · `pnpm bot:sim`
- Run one package's tests: `pnpm --filter <pkg> exec vitest run <path>`.

## Shared-file rules (PLAN §14.1)
1. Ownership is by path; never edit another WP's paths (note it in `docs/CONTRACT_NOTES.md` instead).
2. Frozen after WP0 (orchestrator only): root config, lockfile, every `package.json`, `packages/db/**`, `packages/shared/src/**` except contract files, `core/src/{config,errors,audit}`, `core/src/jobs/enqueue.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`.
3. `app.module.ts` imports six initially empty modules; each owner fills only its own.
4. Contract files `packages/shared/src/contracts/*.ts` are filled by WP1/2/4/5 in their first 15 minutes.
5. Dependencies are pre-installed. If one is missing: `mkdir .install.lock` (atomic) -> `pnpm add --filter <pkg> <dep>` -> `rmdir .install.lock` -> note it in `CONTRACT_NOTES.md`.
6. Schema is frozen; use existing `Json` columns. Blocking schema problems go to the orchestrator.
7. Git: `git add -- <owned paths>` then `git commit`; retry on `index.lock`; never `git add -A`, never stash/reset/checkout in the parallel phase. Never push.
8. Processes: never kill another agent's processes or stop Postgres. API tests use supertest in-process. Web builds use `NEXT_DIST_DIR` (`.next-wp6`, `.next-wp7`).
