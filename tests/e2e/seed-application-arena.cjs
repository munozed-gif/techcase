/**
 * Seed: application on an 'estimated' case for A-20
 * The Arena openCases filter requires status === 'estimated' (unless lifecycle template has arena stages)
 */
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL  = 'https://chtqtuishqtypnknofmi.supabase.co';
const ADMIN_EMAIL   = 'test.admin@techcase.com';
const ADMIN_PASS    = 'Test@Arena2026!';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk';
const CONSULTANT_ID = '18769da1-b80c-4e57-92d4-cd78159d0bda'; // test.consultant

(async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (authErr) { console.error('Login failed:', authErr.message); process.exit(1); }
  console.log('Signed in as admin:', authData.user.email);

  // Find estimated cases with no assignments
  const { data: estCases } = await supabase
    .from('cases')
    .select('id, title, status, client_id')
    .eq('status', 'estimated')
    .limit(20);

  if (!estCases?.length) { console.log('No estimated cases found'); process.exit(0); }

  // Find one without case_assignments
  let targetCase = null;
  for (const c of estCases) {
    const { data: assigns } = await supabase.from('case_assignments').select('id').eq('case_id', c.id);
    if (!assigns?.length) { targetCase = c; break; }
  }

  if (!targetCase) { console.log('All estimated cases have assignments'); process.exit(0); }
  console.log('Target case:', targetCase.id, targetCase.title);

  // Check if application already exists
  const { data: existingApps } = await supabase
    .from('applications')
    .select('id, status')
    .eq('case_id', targetCase.id)
    .eq('consultant_id', CONSULTANT_ID);

  if (existingApps?.length) {
    console.log('Application already exists:', existingApps[0]);
    process.exit(0);
  }

  // Create pending application
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .insert({
      case_id: targetCase.id,
      consultant_id: CONSULTANT_ID,
      status: 'pending',
      cover_letter: 'Test application for arena ranking test. SAP Finance module specialist with extensive S/4HANA experience.',
      proposed_rate: 90,
      time_commitment: 100,
    })
    .select()
    .single();

  if (appErr) { console.error('Insert error:', appErr.message); process.exit(1); }
  console.log('Created application:', app.id, '→ case:', targetCase.title, '[estimated]');
  process.exit(0);
})();
