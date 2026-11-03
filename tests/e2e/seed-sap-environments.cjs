/**
 * Seed: add SAP environments for FinCorp (test.client).
 * A-13/CL-07/M-06: SapIntegrationPanel shows no environments because
 * system_settings.sap_integration has no entry for the FinCorp client ID.
 *
 * test.client UID: 2a96462e-468c-4733-a560-fe7479a2402b
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL  = 'https://chtqtuishqtypnknofmi.supabase.co';
const ADMIN_EMAIL   = 'test.admin@techcase.com';
const ADMIN_PASS    = 'Test@Arena2026!';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk';

const FINCORP_CLIENT_ID = '2a96462e-468c-4733-a560-fe7479a2402b';

const SAP_ENVIRONMENTS = [
  {
    id: 'fincorp-dev-001',
    name: 'Development (DEV)',
    envType: 'dev',
    host: 'sap-dev.fincorp.test',
    client: '100',
    username: 'SAPDEV',
    password: '',
    proxyUrl: '',
    type: 's4hana',
    liveCheckOnGenerate: false,
    autoImplementEnabled: false,
  },
  {
    id: 'fincorp-qas-001',
    name: 'Quality (QAS)',
    envType: 'qas',
    host: 'sap-qas.fincorp.test',
    client: '200',
    username: 'SAPQAS',
    password: '',
    proxyUrl: '',
    type: 's4hana',
    liveCheckOnGenerate: false,
    autoImplementEnabled: false,
  },
];

(async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (authErr) { console.error('Login failed:', authErr.message); process.exit(1); }
  console.log('Signed in as admin:', authData.user.email);

  // Read current sap_integration
  const { data: rows, error: readErr } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'sap_integration')
    .single();

  if (readErr && readErr.code !== 'PGRST116') {
    console.error('Read error:', readErr.message); process.exit(1);
  }

  const current = rows?.value ?? {};
  console.log('Current sap_integration client IDs:', Object.keys(current));

  // Only seed if FinCorp doesn't already have environments
  if (current[FINCORP_CLIENT_ID]?.environments?.length > 0) {
    console.log('FinCorp already has', current[FINCORP_CLIENT_ID].environments.length, 'environments — skipping.');
    process.exit(0);
  }

  const updated = {
    ...current,
    [FINCORP_CLIENT_ID]: {
      ...(current[FINCORP_CLIENT_ID] ?? {}),
      environments: SAP_ENVIRONMENTS,
    },
  };

  const { error: upsertErr } = await supabase
    .from('system_settings')
    .upsert({ key: 'sap_integration', value: updated }, { onConflict: 'key' });

  if (upsertErr) { console.error('Upsert error:', upsertErr.message); process.exit(1); }
  console.log('Done — seeded', SAP_ENVIRONMENTS.length, 'SAP environments for FinCorp.');
  process.exit(0);
})();
