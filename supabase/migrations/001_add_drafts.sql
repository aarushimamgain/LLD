-- Adds server-side drafts to an existing attempts table (created from an earlier schema.sql).
-- New projects don't need this: schema.sql already includes it.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

alter table attempts add column if not exists draft_text text not null default '';

-- Drafts have no parsed submission yet.
alter table attempts alter column submission drop not null;

alter table attempts drop constraint if exists attempts_status_check;
alter table attempts add constraint attempts_status_check
  check (status in ('DRAFT', 'SUBMITTED', 'EVALUATING', 'EVALUATED', 'PARTIALLY_EVALUATED', 'FAILED'));

alter table attempts drop constraint if exists attempts_submission_unless_draft;
alter table attempts add constraint attempts_submission_unless_draft
  check (status = 'DRAFT' or submission is not null);
