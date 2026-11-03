const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://chtqtuishqtypnknofmi.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk';
(async () => {
  const s = createClient(SUPABASE_URL, ANON_KEY);
  await s.auth.signInWithPassword({ email: 'test.admin@techcase.com', password: 'Test@Arena2026!' });

  // Check which client team member roles have consultant profiles
  const CLIENT_ROLES = ['client', 'key_user', 'final_user', 'internal_consultant', 'project_manager'];
  const { data: users } = await s.from('users').select('id, full_name, email, role').in('role', CLIENT_ROLES);
  console.log('Client team member users:', users?.map(u => `${u.email} [${u.role}]`));

  // Check which have consultant_profiles
  const userIds = users?.map(u => u.id) ?? [];
  const { data: profiles } = await s.from('consultant_profiles').select('id, headline').in('id', userIds);
  console.log('With consultant_profiles:', profiles?.map(p => {
    const u = users.find(u => u.id === p.id);
    return `${u?.email} — ${p.headline}`;
  }));

  // Check SAP integration for test.client user
  const { data: sapRow } = await s.from('system_settings').select('value').eq('key', 'sap_integration').single();
  const FINCORP_ID = '2a96462e-468c-4733-a560-fe7479a2402b';
  console.log('\nFinCorp SAP envs:', sapRow?.value?.[FINCORP_ID]?.environments?.length ?? 0);

  // Check existing applications for A-20
  const { data: apps } = await s.from('applications').select('id, case_id, consultant_id, status').limit(5);
  console.log('\nApplications:', apps?.map(a => `${a.id.slice(0,8)} case:${a.case_id.slice(0,8)} [${a.status}]`));

  // Check Settings page structure - find client_team_members
  const { data: teamMembers } = await s.from('client_team_members').select('email, full_name, client_id').limit(10);
  console.log('\nClient team members (first 10):', teamMembers?.map(m => `${m.email} client:${m.client_id?.slice(0,8)}`));

  process.exit(0);
})();
