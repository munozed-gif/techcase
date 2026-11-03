/**
 * Seed: ensure arena nav item is visible for consultant.professional plan.
 * C-08/C-09: test.consultant is on professional plan but nav_visibility_by_plan
 * may block arena for 'free' plan only, OR may also block for 'professional'.
 * This removes any arena=false restriction from consultant.professional.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://chtqtuishqtypnknofmi.supabase.co';
const ADMIN_EMAIL  = 'test.admin@techcase.com';
const ADMIN_PASS   = 'Test@Arena2026!';
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk';

(async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (authErr) { console.error('Login failed:', authErr.message); process.exit(1); }
  console.log('Signed in as admin:', authData.user.email);

  // Read current nav_visibility_by_plan
  const { data: rows, error: readErr } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'nav_visibility_by_plan')
    .single();

  if (readErr && readErr.code !== 'PGRST116') {
    console.error('Read error:', readErr.message); process.exit(1);
  }

  const current = rows?.value ?? {};
  console.log('Current nav_visibility_by_plan:', JSON.stringify(current, null, 2));

  // Ensure consultant.professional.arena is NOT false (remove restriction)
  const updated = {
    ...current,
    consultant: {
      ...(current.consultant ?? {}),
      professional: {
        ...(current.consultant?.professional ?? {}),
        arena: true,   // explicitly allow arena for professional plan
      },
    },
  };

  // Also read nav_visibility_by_role to check if arena is blocked at role level
  const { data: roleRows, error: roleErr } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'nav_visibility_by_role')
    .single();

  if (roleErr && roleErr.code !== 'PGRST116') {
    console.error('Role read error:', roleErr.message); process.exit(1);
  }
  const roleVis = roleRows?.value ?? {};
  console.log('nav_visibility_by_role:', JSON.stringify(roleVis, null, 2));

  const { error: upsertErr } = await supabase
    .from('system_settings')
    .upsert({ key: 'nav_visibility_by_plan', value: updated }, { onConflict: 'key' });

  if (upsertErr) { console.error('Upsert error:', upsertErr.message); process.exit(1); }
  console.log('Done — ensured consultant.professional.arena is allowed.');
  console.log('Updated config:', JSON.stringify(updated, null, 2));
  process.exit(0);
})();
