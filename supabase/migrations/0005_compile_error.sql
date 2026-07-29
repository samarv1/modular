-- Phase 7 compile worker needs somewhere to surface *why* a compile failed
-- (e.g. a pdflatex error) rather than just the generic 'failed' status.
-- Nullable, cleared on each new compile attempt.
alter table resume add column compile_error text;
