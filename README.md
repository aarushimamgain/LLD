# LLD Practice Platform

Practise Low-Level Design the way interviews test it. Pick a problem (Parking Lot, Elevator, Vending Machine), think through the requirements, model your design as classes, relationships and patterns, and get **explainable feedback**: every lost point names the class or requirement it is about and says what to change. Every attempt is kept, so you can see what you fixed since last time.

Node.js 20 · Express · Supabase (Postgres) · zod · vanilla JS frontend · Jest. A single monolith.

## 30-second demo

1. `npm install && npm run dev`, then open http://localhost:3000. No keys needed.
2. **Parking Lot → 2 Design → Load sample design → Submit for feedback.**
3. Watch the badge go *Submitted → Evaluating → Evaluated*. The sample scores **71/100**: payment and concurrency are missing, `SpotAllocator` should be an interface, and there's a dangling `PaymentService`. Each finding names the class it is about and suggests a fix.
4. **4 History → Try again.** The form starts from your last design. Add an interface `PaymentMethod` (responsibility: "Pay an amount") and a class `CardPayment` (responsibility: "Charge a card") that `implements` it, then submit.
5. History now shows **attempt #2 vs #1**: the score change per dimension, the issues fixed, and any new issues.

To see degraded mode, set `LLM_PROVIDER=gemini` with a wrong `LLM_API_KEY`. The attempt ends as **Partial**: rule feedback and the score are complete, and a **Retry** button appears.

## Setup

```bash
npm install
cp .env.example .env      # optional: everything works with it empty
npm run dev               # http://localhost:3000 (node --watch)
npm test                  # Jest: in-memory storage + mock LLM, no network
```

**Runs without any keys.** With no Supabase variables, attempts are kept in memory (a warning is logged and data is lost on restart). With no LLM key, a deterministic **mock reviewer** adds clearly labelled "(Mock reviewer)" feedback. Scores are identical either way, because only rules produce the score.

**Supabase (optional):** create a project, run [`supabase/schema.sql`](supabase/schema.sql) in *SQL Editor*, and set in `.env`:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Project URL, `https://<project-ref>.supabase.co` (not the `postgresql://` connection string) |
| `SUPABASE_SERVICE_ROLE_KEY` | The `service_role` key. Server-only; RLS is on with no policies, so the anon key gets nothing |
| `LLM_PROVIDER` | `mock` (default), `gemini`, `openai` or `anthropic` |
| `LLM_API_KEY` | Key for that provider |
| `LLM_MODEL` | Optional model override |
| `EVAL_TIMEOUT_MS` | Time limit for the AI review (default 8000; use ~30000 for `anthropic`) |

Already created the table from an earlier version? Run [`supabase/migrations/001_add_drafts.sql`](supabase/migrations/001_add_drafts.sql) instead.

## Architecture

Full design, including a class diagram, the state machine, the rule table, failure handling and trade-offs: **[docs/DESIGN.md](docs/DESIGN.md)**.

```
public/            Vanilla JS app (hash routing): problems → think first → design → feedback → history
src/api/           Thin Express routes, zod request schemas, one error middleware (400/404/409, generic 500)
src/services/      PracticeService: start/save draft, submit, evaluate in background, retry, history, compare
src/domain/        Pure classes: Attempt (state machine), Submission, Problem, Rubric, EvaluationResult, FeedbackItem
src/evaluation/    13 Rule classes → RuleBasedEvaluator (score) + LLMEvaluator (advice) → CompositeEvaluator
src/llm/           LLMClient: Mock, Gemini, OpenAI, Anthropic (plain fetch, no SDKs)
src/parsers/       SubmissionParser → StructuredJsonParser (learner-friendly errors)
src/repositories/  AttemptRepository: Supabase / InMemory; ProblemCatalog (JSON files, validated at startup)
src/problems/      Problems + rubrics as JSON, and one "decent but flawed" sample design each
```

Attempt lifecycle: `DRAFT → SUBMITTED → EVALUATING → EVALUATED | PARTIALLY_EVALUATED | FAILED`. The last two can be retried. Domain code imports nothing from Express or Supabase. Interfaces are base classes whose methods throw `Not implemented`, and they are used only where behaviour actually varies.

**API**

| Method & path | Purpose |
|---|---|
| `GET /api/problems`, `GET /api/problems/:id` | List problems; one problem without its rubric |
| `GET /api/problems/:id/sample` | Demo sample design |
| `POST /api/attempts` | Open a draft (returns the existing open draft; a new one starts from your last design) |
| `PUT /api/attempts/:id` | Save draft text (any text, even half-written) |
| `POST /api/attempts/:id/submit` | Validate and submit → `202`, evaluation runs in the background |
| `POST /api/attempts/:id/retry` | Retry a failed or partial evaluation |
| `GET /api/attempts/:id` | Attempt, comparison with the previous scored attempt, rubric concepts covered (after submit only) |
| `GET /api/learners/:learnerId/attempts?problemId=` | History summaries and the latest-vs-previous comparison |

## Key decisions

- **Structured submissions, not free text.** Entities, relationships, patterns, flows and trade-offs make deterministic checks possible and force the learner to assign responsibilities explicitly.
- **A rubric of concepts, not a reference answer.** Each concept has aliases (`SpotAssigner`, `AllocationPolicy`, …) and is matched on whole words, preferring the most specific match. A class only counts if it has responsibilities or methods. A complete design with entirely different names scores 100 in the tests.
- **Rules produce the score; the LLM only advises.** Scores are reproducible, free, testable, and can't be gamed by prompt injection in the submission. Each dimension starts at 10; an issue costs 2 and a suggestion 1, so every lost point is a visible item.
- **Every feedback item must point at something.** The domain rejects a `FeedbackItem` without evidence (a class, requirement id or section) and a suggestion. LLM items citing things that don't exist are dropped.
- **The LLM is optional and bounded.** It has a time limit with real cancellation, output validated with zod, one retry with the validation error, and duplicates of rule findings removed. On any failure the attempt is *partially evaluated* with the complete rule feedback.
- **Attempt progress is visible.** Rule feedback is saved while the AI review is still running, and history compares attempts by stable finding keys (`SRP:ParkingLot`) to list what was fixed and what's new.
- **Problems are data.** Adding a problem means adding one JSON file. The catalog validates it at startup and refuses to start on a broken rubric.

## Limitations

- **No authentication.** The learner is a random id in `localStorage`: history is per browser, and anyone who knows an attempt id can read it. Writes require the matching learner id, which prevents accidents, not attacks.
- **Rules are heuristics.** Concept matching relies on names, so an unusual but valid name can be missed, and the god-class and single-responsibility checks use thresholds. Those findings are suggestions, not issues, and the AI review can point out misses.
- **Polling and in-process background work, not a queue.** Evaluation runs inside the web process and the browser polls every 1.5s. A startup sweep marks interrupted evaluations as FAILED (retryable). This assumes a single server instance, and a crash between submit and the start of evaluation can leave an attempt stuck at SUBMITTED.
- **Three problems,** with rubrics written by hand.
- **The JSON-backed design form is LLD-shaped only.** There are no diagrams, PlantUML or code upload yet.

## What I'd do next

1. **Auth:** Supabase Auth, taking the learner id from the verified session instead of the request body.
2. **A job queue** (e.g. pg-boss on the same Postgres) for evaluations. `runEvaluation(attemptId)` is already shaped like a job handler, so this replaces the startup sweep and fixes the stuck-SUBMITTED gap.
3. **Calibrate the rules and prompt** against a small set of human-graded designs, and tune the aliases and thresholds from the misses.
4. **More input formats** through new `SubmissionParser`s (PlantUML, a code skeleton), plus a simple class-diagram preview of the submitted design.
5. **More problems,** and an authoring checklist for rubrics.
6. **Progress over time:** per-dimension trends across all problems, and suggested next problems based on weak dimensions.
