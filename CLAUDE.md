# CLAUDE.md

LLD Practice Platform: a learner picks a Low-Level Design problem (Parking Lot, Elevator, Vending Machine), submits a design, gets **explainable** feedback, and sees attempt history so they can improve.

This is a 2-day assignment built in ~4 hours. Favour small, readable, working code over completeness.

**[docs/DESIGN.md](docs/DESIGN.md) is the source of truth** for the domain model, Attempt state machine, evaluation split, and failure handling. Follow it; if the code needs to deviate, update DESIGN.md in the same change. Key invariants: the score is computed by rules only (LLM feedback is advisory), and rule FeedbackItems carry a stable `key` used for attempt comparison.

## Stack (fixed — do not add to it)

Node.js 20, JavaScript ES modules (`"type": "module"`), Express 5 (async handler errors propagate automatically), Supabase via `@supabase/supabase-js`, zod 4, one static HTML/CSS/vanilla JS frontend served by Express, Jest.

**Not allowed:** TypeScript, React or any frontend framework/bundler, Docker, queues, microservices, ORMs. It's a monolith.

## Commands

```bash
npm install
npm run dev     # node --watch; server.js loads .env if present
npm start
npm test        # Jest (ESM via --experimental-vm-modules)
npx jest tests/path/to/file.test.js   # single file: use `npm test -- tests/...`
```

Copy `.env.example` to `.env`. Everything must run with **no env vars set**: no Supabase → `InMemoryAttemptRepository`; `LLM_PROVIDER` unset/`mock` or missing key → `MockLLMClient`.

## Layout

```
src/
  domain/        Pure entities/value objects + Attempt state machine. Import from domain/index.js. No I/O.
  evaluation/    Evaluator interface + strategies (rule-based, LLM-assisted) and the scoring/rubric logic.
  parsers/       Turn raw submitted design text into a structured design model.
  problems/      Problem definitions as JSON (<id>.json, file name must equal id). samples/ = one "decent but flawed" design per problem, used by tests and the demo.
  services/      Use-case orchestration (submit attempt, list history). Depends on interfaces only.
  repositories/  AttemptRepository (+ Supabase, InMemory) and ProblemCatalog (loads + zod-validates problems at startup, fails fast).
  llm/           LLMClient interface, MockLLMClient, provider clients, factory.
  api/           Express routes + zod request schemas. Thin.
  app.js         Composition root: createApp({ env, ...overrides }) builds every dependency (tests inject in-memory ones) and returns { app, service, llmClient }.
  server.js      Entry point: loads .env, passes process.env to createApp, recovers stuck evaluations, listens.
public/          index.html, styles.css, app.js (vanilla JS).
tests/           Jest tests, mirroring src/.
docs/            Design notes, research, AI-usage log, trade-offs.
supabase/schema.sql
```

## Architecture rules (non-negotiable)

1. **Domain is pure.** Code in `src/domain`, `src/evaluation`, `src/parsers` must not import `express`, `@supabase/supabase-js`, or anything from `src/api`/`src/repositories`. Plain JS classes.
2. **Routes are thin.** A route: validate input with zod → call a service → map result/error to HTTP. No business logic in `src/api`.
3. **"Interfaces" are base classes** whose methods `throw new Error('Not implemented')`, documented with JSDoc (`@abstract`, params, returns). Use them only where behaviour genuinely varies (evaluators, repositories, LLM clients, parsers if more than one). Don't create interfaces with a single implementation "just in case".
4. **Supabase only behind `AttemptRepository`.** Implementations: `SupabaseAttemptRepository`, `InMemoryAttemptRepository`. Nothing else touches the Supabase client.
5. **Tests always use `InMemoryAttemptRepository` and `MockLLMClient`.** Tests must never need network or keys.
6. **Dependency injection by constructor.** `server.js` is the only place that reads `process.env` and picks implementations. `app.js` exports `createApp(deps)` so tests can inject fakes (use supertest).
7. **Problems are data.** Adding a new LLD problem = adding a JSON file in `src/problems/` (requirements with keywords, rubric concepts with aliases/expectAbstraction/requirementIds). No code change should be required.
8. **LLM is optional and bounded.** LLM calls are wrapped with `EVAL_TIMEOUT_MS`; on timeout/error, fall back to rule-based feedback and say so in the response. Never let LLM output be the only source of the score.

## Feedback must be explainable

Every score item in feedback should carry: the rubric criterion, points awarded / max, the evidence (what was found or missing in the submission), and a concrete suggestion. The learner should be able to see *why* they got the score and what to change next attempt. History should make improvement across attempts visible.

## Code style

- ES modules, `import`/`export`, named exports preferred. File names kebab-case; class names PascalCase.
- Small functions, early returns, no clever abstractions. Comments explain *why*, not *what*.
- JSDoc on interfaces and public service methods; not needed on every private helper.
- Validate all external input (HTTP bodies, LLM JSON output, problem JSON) with zod at the boundary.
- Errors: throw domain errors (e.g. `ValidationError`, `NotFoundError`) from services; map to HTTP status in one error-handling middleware.
- No new dependencies without a clear reason.

## Grading priorities (use to decide where effort goes)

LLD/domain design 25% · research 15% · product thinking 15% · evaluation/feedback 15% · extensibility 10% · code quality 10% · tests 5% · AI usage 5%.

Implications: domain model and evaluator design matter most; document research and product decisions in `docs/`; keep an AI-usage log in `docs/`; tests should cover domain + evaluation logic first, one or two API tests via supertest second.
