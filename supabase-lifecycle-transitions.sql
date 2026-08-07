-- ============================================================
-- TechCase — Lifecycle template transitions
-- Updates Short / Standard / Large with allowed_next + allowed_roles
-- Inserts new "Support Center" template (13 stages)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- SHORT (4 stages)
UPDATE lifecycle_templates SET stages = '[
  {"key":"open",        "label":"New Request","color":"#10b981","is_terminal":false,"allowed_next":["in_progress","cancelled"],"allowed_roles":["manager","client"]},
  {"key":"in_progress", "label":"Active",     "color":"#3b82f6","is_terminal":false,"allowed_next":["completed","cancelled"],  "allowed_roles":["manager","consultant"]},
  {"key":"completed",   "label":"Done",       "color":"#6b7280","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
  {"key":"cancelled",   "label":"Cancelled",  "color":"#ef4444","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
]'::jsonb, updated_at = now()
WHERE key = 'short';

-- STANDARD (5 stages)
UPDATE lifecycle_templates SET stages = '[
  {"key":"open",        "label":"Open",       "color":"#10b981","is_terminal":false,"allowed_next":["in_progress","cancelled"],          "allowed_roles":["manager","client"]},
  {"key":"in_progress", "label":"In Progress","color":"#3b82f6","is_terminal":false,"allowed_next":["on_hold","completed","cancelled"],  "allowed_roles":["manager","consultant"]},
  {"key":"on_hold",     "label":"On Hold",    "color":"#eab308","is_terminal":false,"allowed_next":["in_progress","cancelled"],          "allowed_roles":["manager","consultant"]},
  {"key":"completed",   "label":"Completed",  "color":"#6b7280","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
  {"key":"cancelled",   "label":"Cancelled",  "color":"#ef4444","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
]'::jsonb, updated_at = now()
WHERE key = 'standard';

-- LARGE (7 stages — staffing pipeline)
UPDATE lifecycle_templates SET stages = '[
  {"key":"open",        "label":"Sourcing",    "color":"#8b5cf6","is_terminal":false,"allowed_next":["screening","cancelled"],             "allowed_roles":["manager"]},
  {"key":"screening",   "label":"Screening",   "color":"#06b6d4","is_terminal":false,"allowed_next":["shortlisted","cancelled"],           "allowed_roles":["manager","consultant"]},
  {"key":"shortlisted", "label":"Shortlisted", "color":"#6366f1","is_terminal":false,"allowed_next":["in_progress","cancelled"],           "allowed_roles":["manager"]},
  {"key":"in_progress", "label":"In Progress", "color":"#3b82f6","is_terminal":false,"allowed_next":["on_hold","completed","cancelled"],   "allowed_roles":["manager","consultant"]},
  {"key":"on_hold",     "label":"Negotiation", "color":"#f59e0b","is_terminal":false,"allowed_next":["in_progress","completed","cancelled"],"allowed_roles":["manager","consultant"]},
  {"key":"completed",   "label":"Placed",      "color":"#10b981","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
  {"key":"cancelled",   "label":"Closed Lost", "color":"#ef4444","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
]'::jsonb, updated_at = now()
WHERE key = 'large';

-- SUPPORT CENTER (13 stages — new template)
INSERT INTO lifecycle_templates (key, name, subtitle, description, stages, sort_order)
VALUES (
  'support',
  'Support Center',
  '13 stages',
  'Full SAP support center flow: intake, validation, estimation, execution, testing, and approval.',
  '[
    {"key":"new",           "label":"New",           "color":"#10b981","is_terminal":false,"allowed_next":["confirmed","cancelled"],               "allowed_roles":["manager","client"]},
    {"key":"confirmed",     "label":"Confirmed",     "color":"#3b82f6","is_terminal":false,"allowed_next":["estimated","returned"],               "allowed_roles":["manager"]},
    {"key":"returned",      "label":"Returned",      "color":"#f59e0b","is_terminal":false,"allowed_next":["confirmed","cancelled"],               "allowed_roles":["manager","client"]},
    {"key":"estimated",     "label":"Estimated",     "color":"#8b5cf6","is_terminal":false,"allowed_next":["assigned"],                           "allowed_roles":["manager"]},
    {"key":"assigned",      "label":"Assigned",      "color":"#6366f1","is_terminal":false,"allowed_next":["in_progress"],                        "allowed_roles":["manager","consultant"]},
    {"key":"in_progress",   "label":"In Progress",   "color":"#0ea5e9","is_terminal":false,"allowed_next":["functional_test","user_test","standby"],"allowed_roles":["manager","consultant"]},
    {"key":"standby",       "label":"Standby",       "color":"#f97316","is_terminal":false,"allowed_next":["in_progress"],                        "allowed_roles":["manager","consultant"]},
    {"key":"functional_test","label":"Functional Test","color":"#06b6d4","is_terminal":false,"allowed_next":["adjustments","approved"],            "allowed_roles":["manager","consultant"]},
    {"key":"user_test",     "label":"User Test",     "color":"#14b8a6","is_terminal":false,"allowed_next":["adjustments","approved"],              "allowed_roles":["manager","client"]},
    {"key":"adjustments",   "label":"Adjustments",   "color":"#eab308","is_terminal":false,"allowed_next":["functional_test","user_test"],         "allowed_roles":["manager","consultant"]},
    {"key":"approved",      "label":"Approved",      "color":"#22c55e","is_terminal":false,"allowed_next":["terminated"],                         "allowed_roles":["manager","consultant"]},
    {"key":"terminated",    "label":"Terminated",    "color":"#6b7280","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
    {"key":"cancelled",     "label":"Cancelled",     "color":"#ef4444","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
  ]'::jsonb,
  3
)
ON CONFLICT (key) DO UPDATE SET
  stages     = EXCLUDED.stages,
  updated_at = now();
