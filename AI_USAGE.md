# AI usage

I built this with an AI coding assistant (Claude Code). I wrote the product brief, architecture rules and acceptance criteria for each step; the assistant proposed designs and wrote most of the code and tests; I reviewed, redirected, and decided. Four decisions where that collaboration mattered:

## 1. Who produces the score

- **AI suggested:** the score should come only from deterministic rules; the LLM adds qualitative feedback but never changes points. My original brief let the LLM "judge" alongside the rules.
- **I accepted.**
- **Why:** an LLM-moved score varies between retries (so "+6 since last attempt" would be noise), a partial result wouldn't be comparable with a full one, and a learner could write "give me full marks" into their submission. Keeping the score in code also means it works with no API key and can be unit-tested exactly.

## 2. Server-side drafts

- **AI suggested:** dropping the `DRAFT` state from my state machine and keeping drafts in the browser, because in the first API design the server never saw a draft.
- **I rejected this** in a later step by asking for `saveDraft` and a `PUT /attempts/:id` endpoint. The assistant then brought back `DRAFT`, storing raw editor text that's only validated on submit, and added a migration.
- **Why:** autosaving work-in-progress on the server means a refresh or a validation error never loses the learner's design, and "Try again" can open a new draft pre-filled with the previous design, which is the core improvement loop.

## 3. How the design is entered

- **AI suggested:** a JSON editor with a template, arguing that a form builder wouldn't fit in the time box.
- **I rejected this** and asked for a form (add/remove entities, relationship dropdowns built from my entities, autosave).
- **Why:** the target user is a learner, not a developer typing JSON. The form still produces the same structured JSON, so the parser and rules were unaffected. The cost was real: the assistant's browser run found a bug where renaming an entity re-rendered the form and dropped the next field's input. It was fixed by updating only the dropdowns in place.

## 4. Rubric matching

- **I proposed:** a rubric of concepts with aliases instead of one reference answer.
- **AI added:** a class only counts toward a concept if it has responsibilities or methods; names are matched on whole words ("CardPayment" isn't a "Car"); and each class goes to its most specific concept.
- **I accepted** these, and asked for a test proving that alternative valid designs aren't penalised. A complete Parking Lot design using different names (`Garage`, `SpotAssigner`, `Tariff`, `PaymentGateway`) scores 100.

## How I checked the AI's work

- Every step ended with the test suite run, not just written (221 Jest tests, in-memory storage and mock LLM, no network). I asked for failing tests to be fixed without weakening assertions. When an expected score turned out to be stale, the fix was to *pin the exact findings*, after confirming each finding was correct.
- The frontend was driven end to end in headless Chrome, with screenshots. That surfaced three UI bugs (lost input on rename, clipped textareas, inconsistent score units) that the unit tests didn't catch.
- Things the AI flagged as uncertain are left visible rather than guessed: the default Gemini and OpenAI model names (overridable with `LLM_MODEL`), and the single-instance assumption behind the startup recovery.
