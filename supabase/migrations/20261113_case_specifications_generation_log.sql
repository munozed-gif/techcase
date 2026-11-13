-- The AI spec generator saves its final result together with generation_log
-- (CaseSubPanels.jsx). Phoenix has this column; ArenaSolPlatf did not, so every
-- final save of a generated spec failed ("column generation_log does not exist")
-- and the error was swallowed. Earlier generation steps had already written
-- content = null, leaving specs approved/submitted with no text.
ALTER TABLE public.case_specifications
  ADD COLUMN IF NOT EXISTS generation_log jsonb;
