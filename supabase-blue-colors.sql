-- ============================================================
-- TechCase — Blue Progression color palette for all lifecycle templates
-- Replaces mixed green/purple/red colors with blues (#93C5FD → #1E40AF)
-- Terminal stages: #374151 (dark gray) and #6B7280 (mid gray)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- SHORT (2 active stages)
UPDATE lifecycle_templates SET stages = '[
  {"key":"open",        "label":"New Request","color":"#60A5FA","is_terminal":false,"allowed_next":["in_progress","cancelled"],"allowed_roles":["manager","client"]},
  {"key":"in_progress", "label":"Active",     "color":"#1E40AF","is_terminal":false,"allowed_next":["completed","cancelled"],  "allowed_roles":["manager","consultant"]},
  {"key":"completed",   "label":"Done",       "color":"#374151","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
  {"key":"cancelled",   "label":"Cancelled",  "color":"#6B7280","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
]'::jsonb, updated_at = now()
WHERE key = 'short';

-- STANDARD (3 active stages)
UPDATE lifecycle_templates SET stages = '[
  {"key":"open",        "label":"Open",       "color":"#93C5FD","is_terminal":false,"allowed_next":["in_progress","cancelled"],          "allowed_roles":["manager","client"]},
  {"key":"in_progress", "label":"In Progress","color":"#2563EB","is_terminal":false,"allowed_next":["on_hold","completed","cancelled"],  "allowed_roles":["manager","consultant"]},
  {"key":"on_hold",     "label":"On Hold",    "color":"#1D4ED8","is_terminal":false,"allowed_next":["in_progress","cancelled"],          "allowed_roles":["manager","consultant"]},
  {"key":"completed",   "label":"Completed",  "color":"#374151","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
  {"key":"cancelled",   "label":"Cancelled",  "color":"#6B7280","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
]'::jsonb, updated_at = now()
WHERE key = 'standard';

-- LARGE (5 active stages)
UPDATE lifecycle_templates SET stages = '[
  {"key":"open",        "label":"Sourcing",    "color":"#93C5FD","is_terminal":false,"allowed_next":["screening","cancelled"],             "allowed_roles":["manager"]},
  {"key":"screening",   "label":"Screening",   "color":"#60A5FA","is_terminal":false,"allowed_next":["shortlisted","cancelled"],           "allowed_roles":["manager","consultant"]},
  {"key":"shortlisted", "label":"Shortlisted", "color":"#3B82F6","is_terminal":false,"allowed_next":["in_progress","cancelled"],           "allowed_roles":["manager"]},
  {"key":"in_progress", "label":"In Progress", "color":"#1D4ED8","is_terminal":false,"allowed_next":["on_hold","completed","cancelled"],   "allowed_roles":["manager","consultant"]},
  {"key":"on_hold",     "label":"Negotiation", "color":"#1E40AF","is_terminal":false,"allowed_next":["in_progress","completed","cancelled"],"allowed_roles":["manager","consultant"]},
  {"key":"completed",   "label":"Placed",      "color":"#374151","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
  {"key":"cancelled",   "label":"Closed Lost", "color":"#6B7280","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
]'::jsonb, updated_at = now()
WHERE key = 'large';

-- SUPPORT CENTER (11 active stages — 6-shade scale distributed across them)
UPDATE lifecycle_templates SET stages = '[
  {"key":"new",             "label":"New",           "color":"#93C5FD","is_terminal":false,"allowed_next":["confirmed","cancelled"],                "allowed_roles":["manager","client"]},
  {"key":"confirmed",       "label":"Confirmed",     "color":"#60A5FA","is_terminal":false,"allowed_next":["estimated","returned"],                "allowed_roles":["manager"]},
  {"key":"returned",        "label":"Returned",      "color":"#60A5FA","is_terminal":false,"allowed_next":["confirmed","cancelled"],                "allowed_roles":["manager","client"]},
  {"key":"estimated",       "label":"Estimated",     "color":"#3B82F6","is_terminal":false,"allowed_next":["assigned"],                            "allowed_roles":["manager"]},
  {"key":"assigned",        "label":"Assigned",      "color":"#3B82F6","is_terminal":false,"allowed_next":["in_progress"],                         "allowed_roles":["manager","consultant"]},
  {"key":"in_progress",     "label":"In Progress",   "color":"#2563EB","is_terminal":false,"allowed_next":["functional_test","user_test","standby"],"allowed_roles":["manager","consultant"]},
  {"key":"standby",         "label":"Standby",       "color":"#2563EB","is_terminal":false,"allowed_next":["in_progress"],                         "allowed_roles":["manager","consultant"]},
  {"key":"functional_test", "label":"Functional Test","color":"#1D4ED8","is_terminal":false,"allowed_next":["adjustments","approved"],              "allowed_roles":["manager","consultant"]},
  {"key":"user_test",       "label":"User Test",     "color":"#1D4ED8","is_terminal":false,"allowed_next":["adjustments","approved"],               "allowed_roles":["manager","client"]},
  {"key":"adjustments",     "label":"Adjustments",   "color":"#1E40AF","is_terminal":false,"allowed_next":["functional_test","user_test"],          "allowed_roles":["manager","consultant"]},
  {"key":"approved",        "label":"Approved",      "color":"#1E3A8A","is_terminal":false,"allowed_next":["terminated"],                          "allowed_roles":["manager","consultant"]},
  {"key":"terminated",      "label":"Terminated",    "color":"#374151","is_terminal":true, "allowed_next":[],"allowed_roles":[]},
  {"key":"cancelled",       "label":"Cancelled",     "color":"#6B7280","is_terminal":true, "allowed_next":[],"allowed_roles":[]}
]'::jsonb, updated_at = now()
WHERE key = 'support';
