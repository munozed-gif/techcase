CREATE TABLE IF NOT EXISTS spec_generation_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO spec_generation_templates (key, name, description, is_default, is_active, sort_order, stages) VALUES
('standard', 'Standard', 'Full spec generation pipeline with SAP verification and proposal validation.', TRUE, TRUE, 0,
 '[{"type":"documents","label":"Documents","enabled":true,"order":0},{"type":"sap_connection","label":"SAP Connection","enabled":true,"order":1},{"type":"compiled_context","label":"Compiled Context","enabled":true,"order":2},{"type":"sap_verification","label":"SAP Verification","enabled":true,"order":3},{"type":"proposal_validation","label":"Proposal Validation","enabled":true,"order":4},{"type":"generate_specs","label":"Generate Specs","enabled":true,"order":5},{"type":"approval","label":"Approval","enabled":true,"order":6}]'::jsonb),
('lightweight', 'Lightweight', 'Quick spec generation, skips SAP live verification.', FALSE, TRUE, 1,
 '[{"type":"documents","label":"Documents","enabled":true,"order":0},{"type":"sap_connection","label":"SAP Connection","enabled":true,"order":1},{"type":"compiled_context","label":"Compiled Context","enabled":true,"order":2},{"type":"sap_verification","label":"SAP Verification","enabled":false,"order":3},{"type":"proposal_validation","label":"Proposal Validation","enabled":true,"order":4},{"type":"generate_specs","label":"Generate Specs","enabled":true,"order":5},{"type":"approval","label":"Approval","enabled":true,"order":6}]'::jsonb)
ON CONFLICT (key) DO NOTHING;
