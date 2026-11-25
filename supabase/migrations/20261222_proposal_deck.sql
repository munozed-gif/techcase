-- Proposal presentation: slide content generated from the proposal document (Project → Proposals).
ALTER TABLE project_proposals ADD COLUMN IF NOT EXISTS deck jsonb;
COMMENT ON COLUMN project_proposals.deck IS 'Presentation slides {slides:[{layout,title,kicker,lead,items}], generated_at, doc_md_len}; numbers are added by the app, never stored here.';
