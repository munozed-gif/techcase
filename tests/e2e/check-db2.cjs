const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://chtqtuishqtypnknofmi.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk';
(async () => {
  const s = createClient(SUPABASE_URL, ANON_KEY);
  await s.auth.signInWithPassword({ email: 'test.admin@techcase.com', password: 'Test@Arena2026!' });

  // Check if test.internal is in client_team_members
  const { data: internal } = await s.from('client_team_members').select('email, full_name, client_id, system_role').eq('email', 'test.internal@test.arena.dev');
  console.log('test.internal in client_team_members:', internal);

  // Find FinCorp company in client_profiles
  const { data: fincorp } = await s.from('client_profiles').select('id, company_name').ilike('company_name', '%fincorp%');
  console.log('FinCorp in client_profiles:', fincorp);

  // All clients in client_profiles with company names
  const { data: companies } = await s.from('client_profiles').select('id, company_name').limit(20);
  console.log('Companies:', companies?.map(c => `${c.id.slice(0,8)} "${c.company_name}"`));

  // Check test.client profile
  const { data: testClientProfile } = await s.from('client_profiles').select('id, company_name').eq('id', '2a96462e-468c-4733-a560-fe7479a2402b');
  console.log('test.client profile:', testClientProfile);

  // Check SAP integration for FinCorp companies
  const { data: sapRow } = await s.from('system_settings').select('value').eq('key', 'sap_integration').single();
  if (sapRow) {
    console.log('\nAll SAP client IDs with envs:', Object.entries(sapRow.value).map(([k, v]) =>
      `${k.slice(0,8)}: ${v.environments?.length ?? 0} envs`
    ));
  }

  process.exit(0);
})();
