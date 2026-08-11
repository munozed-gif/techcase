CREATE TABLE case_specifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('manual','wizard','ai')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  title text,
  -- wizard: array of {type, name, questions:[{q,a}], summary}
  objects jsonb DEFAULT '[]',
  -- ai/wizard final: compiled markdown spec
  content text,
  -- manual: notes
  notes text,
  -- manual: doc IDs from case_documents
  document_ids uuid[] DEFAULT '{}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  rejected_reason text
);

CREATE INDEX ON case_specifications(case_id);
