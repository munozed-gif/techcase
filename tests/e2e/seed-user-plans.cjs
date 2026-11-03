/**
 * Seed: upgrade test user plans to "professional"
 * This removes plan-based nav restrictions for KU-05/FU-05/IN-03/IN-04/PM-05/C-08.
 *
 * Also seeds plan_config so that "professional" is a valid client plan with maxCases:-1.
 * DEFAULT_PLAN_CONFIG only defines free/growth/enterprise; "professional" falls back to
 * free (maxCases:3) without this seed.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://chtqtuishqtypnknofmi.supabase.co';
const ADMIN_EMAIL  = 'test.admin@techcase.com';
const ADMIN_PASS   = 'Test@Arena2026!';

const NOW = new Date().toISOString();
// UIDs of test users who need professional plan — stored as { plan, roleType, updatedAt }
const PLAN_UPGRADES = {
  '1a4ee245-69f3-47c1-bc2a-253854dad4ba': { plan: 'professional', roleType: 'client',     updatedAt: NOW }, // test.keyuser
  'efa77686-0c14-4592-be27-aabeea7596f6': { plan: 'professional', roleType: 'client',     updatedAt: NOW }, // test.finaluser
  'a0ec6a44-547a-4b5e-947d-d242eb87b7cb': { plan: 'professional', roleType: 'client',     updatedAt: NOW }, // test.internal
  '66267025-cf5d-45c8-9e7f-0d8e109a0f14': { plan: 'professional', roleType: 'client',     updatedAt: NOW }, // test.pm
  '18769da1-b80c-4e57-92d4-cd78159d0bda': { plan: 'professional', roleType: 'consultant', updatedAt: NOW }, // test.consultant
  '2a96462e-468c-4733-a560-fe7479a2402b': { plan: 'professional', roleType: 'client',     updatedAt: NOW }, // test.client
};

(async () => {
  const supabase = createClient(SUPABASE_URL, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDkzNzcsImV4cCI6MjA4ODcyNTM3N30.UOONXFIPiHbzRuuv8l9VFoErkZMzBhQ3mTTG2ksiRUk');

  // Sign in as admin
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (authErr) { console.error('Login failed:', authErr.message); process.exit(1); }
  console.log('Signed in as admin:', authData.user.email);

  // Read current user_plans setting
  const { data: rows, error: readErr } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'user_plans')
    .single();

  if (readErr && readErr.code !== 'PGRST116') {
    console.error('Read error:', readErr.message); process.exit(1);
  }

  const current = rows?.value ?? {};
  console.log('Current user_plans keys:', Object.keys(current).length);

  // Merge upgrades
  const merged = { ...current, ...PLAN_UPGRADES };
  console.log('Merged keys:', Object.keys(merged).length);

  const { error: upsertErr } = await supabase
    .from('system_settings')
    .upsert({ key: 'user_plans', value: merged }, { onConflict: 'key' });

  if (upsertErr) { console.error('Upsert error:', upsertErr.message); process.exit(1); }

  console.log('Done — upgraded', Object.keys(PLAN_UPGRADES).length, 'test users to professional plan.');

  // --- Seed plan_config so "professional" is a valid client plan with maxCases:-1 ---
  const { data: pcRows, error: pcReadErr } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'plan_config')
    .single();

  if (pcReadErr && pcReadErr.code !== 'PGRST116') {
    console.error('plan_config read error:', pcReadErr.message); process.exit(1);
  }

  const currentPc = pcRows?.value ?? {};
  const mergedPc = {
    ...currentPc,
    client: {
      free:         { label: 'Free',         maxCases: 3,  maxTeam: 2,  ai: false, analytics: false, helpDesk: false },
      growth:       { label: 'Growth',       maxCases: 5,  maxTeam: 10, ai: true,  analytics: true,  helpDesk: false },
      professional: { label: 'Professional', maxCases: -1, maxTeam: -1, ai: true,  analytics: true,  helpDesk: true  },
      enterprise:   { label: 'Enterprise',   maxCases: -1, maxTeam: -1, ai: true,  analytics: true,  helpDesk: true  },
      ...(currentPc.client ?? {}),
    },
    consultant: {
      free: { label: 'Free', maxApps: 3,  ai: false, priority: false },
      pro:  { label: 'Pro',  maxApps: -1, ai: true,  priority: true  },
      professional: { label: 'Professional', maxApps: -1, ai: true, priority: true },
      ...(currentPc.consultant ?? {}),
    },
  };

  const { error: pcUpsertErr } = await supabase
    .from('system_settings')
    .upsert({ key: 'plan_config', value: mergedPc }, { onConflict: 'key' });

  if (pcUpsertErr) { console.error('plan_config upsert error:', pcUpsertErr.message); process.exit(1); }
  console.log('Done — seeded plan_config with professional plan (maxCases:-1).');
  process.exit(0);
})();
