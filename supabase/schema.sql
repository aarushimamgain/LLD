-- Attempts by learners, from draft to evaluated. Accessed only via SupabaseAttemptRepository.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- (Created the table from an earlier version? Run migrations/001_add_drafts.sql instead.)

create table if not exists attempts (
  id             uuid        primary key default gen_random_uuid(),
  learner_id     text        not null,
  problem_id     text        not null,
  attempt_number int         not null check (attempt_number > 0),
  status         text        not null,
  draft_text     text        not null default '', -- raw editor text; may be invalid while drafting
  submission     jsonb,                  -- parsed Submission; null only while DRAFT
  evaluation     jsonb,                  -- EvaluationResult; null until rules have run
  error_message  text,                   -- why an attempt is PARTIALLY_EVALUATED or FAILED
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Stops two concurrent starts from both becoming attempt #N.
  unique (learner_id, problem_id, attempt_number),
  constraint attempts_status_check
    check (status in ('DRAFT', 'SUBMITTED', 'EVALUATING', 'EVALUATED', 'PARTIALLY_EVALUATED', 'FAILED')),
  constraint attempts_submission_unless_draft
    check (status = 'DRAFT' or submission is not null)
);

-- History per learner and problem.
create index if not exists attempts_learner_problem_created_idx
  on attempts (learner_id, problem_id, created_at);

-- Startup sweep for attempts stuck in EVALUATING; tiny because few rows are ever in that state.
create index if not exists attempts_evaluating_idx
  on attempts (updated_at) where status = 'EVALUATING';

-- RLS on with no policies: the anon key gets no access at all. The server uses the
-- service_role key, which bypasses RLS and is never sent to the browser; the browser
-- only ever talks to the Express API.
alter table attempts enable row level security;
