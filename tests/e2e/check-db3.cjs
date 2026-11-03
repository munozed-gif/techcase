const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://chtqtuishqtypnknofmi.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk';
(async () => {
  const s = createClient(SUPABASE_URL, ANON_KEY);
  await s.auth.signInWithPassword({ email: 'test.admin@techcase.com', password: 'Test@Arena2026!' });

  // Find cases with status 'estimated'
  const { data: estCases } = await s.from('cases').select('id, title, status').eq('status', 'estimated').limit(10);
  console.log('Estimated cases:', estCases?.map(c => `${c.id.slice(0,8)} "${c.title}"`));

  // Check case assignments for aaaaaaaa-0001
  const { data: assigns } = await s.from('case_assignments').select('case_id, consultant_id').eq('case_id', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa');
  console.log('Assignments on aaaaaaaa:', assigns);

  // Find cases without assignments and with status = 'open' or 'estimated'
  const { data: openCases } = await s.from('cases').select('id, title, status').in('status', ['open', 'estimated']).limit(20);
  console.log('Open/estimated cases:', openCases?.map(c => `${c.id.slice(0,8)} "${c.title}" [${c.status}]`));

  // Update one case to 'estimated' status so it shows in Arena
  // Need a case that has no assignment and we want to give it an application
  // Let's use the cccccccc cases (newer demo)
  const { data: ccc } = await s.from('cases').select('id, title, status').like('id', 'cccccccc%').limit(5);
  console.log('\ncccccccc cases:', ccc?.map(c => `${c.id.slice(0,8)} "${c.title}" [${c.status}]`));

  process.exit(0);
})();
