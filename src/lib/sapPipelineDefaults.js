// Per-object-type mode of the SAP implementation (blueprint + implement), the default of
// Settings → SAP MCP Policy → Pipeline → object types. One list, used by the pipeline
// (SapPanels.jsx) and by the estimate (estimationContext.js), so they cannot disagree.
//   'manual'          → skipped (configured in SAP by hand)
//   'adt-create-only' → ADT skeleton only; properties set in SE11/SE91
//   'ai-generate'     → AI writes the source, written to SAP through the ADT bridge
export const PIPELINE_OBJECT_TYPE_DEFAULTS = {
  config:          'manual',
  // Tables/structures need their full DDL definition to activate; an empty
  // skeleton can never be activated, so the AI writes the definition.
  table:           'ai-generate',
  structure:       'ai-generate',
  domain:          'adt-create-only',
  data_element:    'adt-create-only',
  message_class:   'adt-create-only',
  program:         'ai-generate',
  include:         'ai-generate',
  class:           'ai-generate',
  function_module: 'ai-generate',
  bapi:            'ai-generate',
  odata:           'manual',
  badi:            'ai-generate',
  enhancement:     'ai-generate',
  report:          'ai-generate',
  smartform:       'manual',
};

// Defaults of the case / project Transport tab. An SAP environment can override them
// (env.transportDefaults, edited in the environment form → "Transport defaults").
export const TRANSPORT_ENV_DEFAULTS = {
  mode:        'external',  // 'external' (different systems) | 'internal' (same system)
  stopOnError: true,        // pause the import / release sequence when a transport fails
  type:        'workbench', // type of a request added by hand: 'workbench' | 'customizing'
  bcsetTarget: 's4_onprem', // system type of a new BC set: 'ecc' | 's4_onprem' | 's4_cloud'
  activate:    'U',         // BC set activation mode: 'U' (update) | 'O' (overwrite)
};
