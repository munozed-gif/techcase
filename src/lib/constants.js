// Pure-data constants — no React or Supabase dependencies

const ROLE_PERMISSIONS_DEFAULTS = {
  create_cases:               { admin:true,  manager:true,  consultant:false, client:true,  key_user:true,  headhunter:false, final_user:false, internal_consultant:true,  project_manager:true  },
  view_all_cases:             { admin:true,  manager:true,  consultant:false, client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:true  },
  approve_specs:              { admin:true,  manager:true,  consultant:false, client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:true  },
  regen_specs:                { admin:true,  manager:true,  consultant:false, client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:false },
  upload_docs:                { admin:true,  manager:true,  consultant:true,  client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:true,  project_manager:true  },
  view_docs:                  { admin:true,  manager:true,  consultant:true,  client:true,  key_user:true,  headhunter:false, final_user:true,  internal_consultant:true,  project_manager:true  },
  add_activities:             { admin:true,  manager:true,  consultant:true,  client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:true,  project_manager:true  },
  log_time:                   { admin:true,  manager:true,  consultant:true,  client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:true,  project_manager:false },
  approve_time:               { admin:true,  manager:true,  consultant:false, client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:true  },
  apply_to_cases:             { admin:false, manager:false, consultant:true,  client:false, key_user:false, headhunter:true,  final_user:false, internal_consultant:false, project_manager:false },
  view_reports:               { admin:true,  manager:true,  consultant:false, client:true,  key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:true  },
  manage_invoices:            { admin:true,  manager:true,  consultant:false, client:true,  key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:false },
  view_lifecycle:             { admin:true,  manager:true,  consultant:false, client:true,  key_user:false, headhunter:false, final_user:true,  internal_consultant:true,  project_manager:true  },
  submit_specs:               { admin:true,  manager:true,  consultant:true,  client:true,  key_user:true,  headhunter:false, final_user:false, internal_consultant:true,  project_manager:true  },
  generate_dev_plan:          { admin:true,  manager:true,  consultant:true,  client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:false },
  require_team_signup:        { admin:false, manager:false, consultant:false, client:false, key_user:true,  headhunter:false, final_user:true,  internal_consultant:true,  project_manager:true  },
  edit_activity_phase:        { admin:true,  manager:true,  consultant:true,  client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:true,  project_manager:true  },
  edit_activity_predecessors: { admin:true,  manager:true,  consultant:true,  client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:true,  project_manager:true  },
  bulk_delete_activities:     { admin:true,  manager:true,  consultant:false, client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:false },
  bulk_delete_subcases:       { admin:true,  manager:true,  consultant:false, client:false, key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:false },
  arena_see_all_cases:        { admin:true,  manager:true,  consultant:true,  client:false, key_user:false, headhunter:true,  final_user:false, internal_consultant:true,  project_manager:true  },
  create_projects:            { admin:true,  manager:true,  consultant:false, client:true,  key_user:false, headhunter:false, final_user:false, internal_consultant:false, project_manager:true  },
};

// ============================================================
// GENERATION CONTEXT DEFAULTS
// ============================================================
const GENERATION_CONTEXT_DEFAULTS = {
  include_client_info:   true,
  include_sap_profile:   true,
  include_case_metadata: true,
  include_project_ctx:   false,
  include_related_cases: false,
  related_cases_count:   3,
  sap_live_check:        false,
};

// ============================================================
// GENERATION PROFILES DEFAULTS
// ============================================================
const GENERATION_PROFILE_DEFAULTS = {
  default_profile: "standard",
  profiles: {
    basic: {
      additional_instructions: "",
      spec_a:   { executive_summary:true, scope:true, pros_cons:false, technical_recommendation:false, technical_objects:true,  time_estimation:true,  screen_prototype:false, risks_assumptions:false, next_steps:false },
      spec_b:   { executive_summary:true, scope:true, pros_cons:false, technical_recommendation:false, configuration_objects:true, implementation_timeline:true, screen_prototype:false, risks_assumptions:false, next_steps:false },
      spec_c:   { executive_summary:true, scope:true, customer_proposal_details:true, technical_objects:true, time_estimation:true, screen_prototype:false, assumptions:false, next_steps:false },
      dev_plan: { scope_summary:true, design_phase:true, development_phase:true, dependencies_risks:false, estimated_timeline:false },
    },
    standard: {
      additional_instructions: "",
      spec_a:   { executive_summary:true, scope:true, pros_cons:true, technical_recommendation:true, technical_objects:true,  time_estimation:true,  screen_prototype:false, risks_assumptions:true, next_steps:false },
      spec_b:   { executive_summary:true, scope:true, pros_cons:true, technical_recommendation:true, configuration_objects:true, implementation_timeline:true, screen_prototype:false, risks_assumptions:true, next_steps:false },
      spec_c:   { executive_summary:true, scope:true, customer_proposal_details:true, technical_objects:true, time_estimation:true, screen_prototype:false, assumptions:true, next_steps:false },
      dev_plan: { scope_summary:true, design_phase:true, development_phase:true, dependencies_risks:true, estimated_timeline:false },
    },
    full: {
      additional_instructions: "",
      spec_a:   { executive_summary:true, scope:true, pros_cons:true, technical_recommendation:true, technical_objects:true,  time_estimation:true,  screen_prototype:true, risks_assumptions:true, next_steps:true },
      spec_b:   { executive_summary:true, scope:true, pros_cons:true, technical_recommendation:true, configuration_objects:true, implementation_timeline:true, screen_prototype:true, risks_assumptions:true, next_steps:true },
      spec_c:   { executive_summary:true, scope:true, customer_proposal_details:true, technical_objects:true, time_estimation:true, screen_prototype:true, assumptions:true, next_steps:true },
      dev_plan: { scope_summary:true, design_phase:true, development_phase:true, dependencies_risks:true, estimated_timeline:true },
    },
  },
};

// Document + section metadata used by settings UI and prompt builder
const GEN_DOCS = [
  { key:"spec_a",   label:"Spec A — Custom ABAP",       sections:[
    { key:"executive_summary",        label:"Executive Summary" },
    { key:"scope",                    label:"Scope" },
    { key:"pros_cons",                label:"Pros & Cons" },
    { key:"technical_recommendation", label:"Technical Recommendation" },
    { key:"technical_objects",        label:"Technical Objects" },
    { key:"time_estimation",          label:"Time Estimation" },
    { key:"screen_prototype",         label:"SAP Screen Prototype" },
    { key:"risks_assumptions",        label:"Risks & Assumptions" },
    { key:"next_steps",               label:"Next Steps" },
  ]},
  { key:"spec_b",   label:"Spec B — Standard SAP",      sections:[
    { key:"executive_summary",        label:"Executive Summary" },
    { key:"scope",                    label:"Scope" },
    { key:"pros_cons",                label:"Pros & Cons" },
    { key:"technical_recommendation", label:"Technical Recommendation" },
    { key:"configuration_objects",    label:"Configuration Objects" },
    { key:"implementation_timeline",  label:"Implementation Timeline" },
    { key:"screen_prototype",         label:"SAP Screen Prototype" },
    { key:"risks_assumptions",        label:"Risks & Assumptions" },
    { key:"next_steps",               label:"Next Steps" },
  ]},
  { key:"spec_c",   label:"Spec C — Customer Proposal", sections:[
    { key:"executive_summary",          label:"Executive Summary" },
    { key:"scope",                      label:"Scope" },
    { key:"customer_proposal_details",  label:"Customer Proposal Details" },
    { key:"technical_objects",          label:"Technical Objects" },
    { key:"time_estimation",            label:"Time Estimation" },
    { key:"screen_prototype",           label:"SAP Screen Prototype" },
    { key:"assumptions",                label:"Assumptions" },
    { key:"next_steps",                 label:"Next Steps" },
  ]},
  { key:"dev_plan", label:"Dev & Design Plan",           sections:[
    { key:"scope_summary",       label:"Project Scope Summary" },
    { key:"design_phase",        label:"Design Phase" },
    { key:"development_phase",   label:"Development Phase" },
    { key:"dependencies_risks",  label:"Dependencies & Risks" },
    { key:"estimated_timeline",  label:"Estimated Timeline" },
  ]},
];

export {
  ROLE_PERMISSIONS_DEFAULTS,
  GENERATION_CONTEXT_DEFAULTS,
  GENERATION_PROFILE_DEFAULTS,
  GEN_DOCS,
};
