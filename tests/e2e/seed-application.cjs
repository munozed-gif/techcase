/**
 * Seed: create a test application for A-20 (applicant ranking scores visible)
 * - Finds the first open/estimated case
 * - Creates a pending application for test.consultant
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL       = 'https://chtqtuishqtypnknofmi.supabase.co';
const ADMIN_EMAIL        = 'test.admin@techcase.com';
const ADMIN_PASS         = 'Test@Arena2026!';
const ANON_KEY           = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk';
const CONSULTANT_ID      = '18769da1-b80c-4e57-92d4-cd78159d0bda'; // test.consultant

(async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (authErr) { console.error('Login failed:', authErr.message); process.exit(1); }
  console.log('Signed in as admin:', authData.user.email);

  // Find a case that is open or estimated
  const { data: cases, error: casesErr } = await supabase
    .from('cases')
    .select('id, title, status, client_id')
    .in('status', ['open', 'estimated'])
    .limit(10);

  if (casesErr) { console.error('Cases error:', casesErr.message); process.exit(1); }
  console.log('Available cases:', cases?.map(c => `${c.id.slice(0,8)} "${c.title}" [${c.status}]`));

  if (!cases || cases.length === 0) {
    console.log('No open/estimated cases found — cannot seed application.');
    process.exit(0);
  }

  const targetCase = cases[0];
  console.log('Using case:', targetCase.id, targetCase.title);

  // Check if application already exists
  const { data: existingApps } = await supabase
    .from('applications')
    .select('id, status')
    .eq('case_id', targetCase.id)
    .eq('consultant_id', CONSULTANT_ID);

  if (existingApps && existingApps.length > 0) {
    console.log('Application already exists:', existingApps[0]);
    process.exit(0);
  }

  // Create application
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .insert({
      case_id: targetCase.id,
      consultant_id: CONSULTANT_ID,
      status: 'pending',
      cover_letter: 'Test application for automated testing purposes. Extensive SAP S/4HANA experience with 8+ years in finance module implementations.',
      proposed_rate: 95,
      time_commitment: 80,
    })
    .select()
    .single();

  if (appErr) { console.error('Insert error:', appErr.message); process.exit(1); }
  console.log('Created application:', app.id, '→ case:', targetCase.title);
  process.exit(0);
})();
