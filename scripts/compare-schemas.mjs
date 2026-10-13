#!/usr/bin/env node
/**
 * Schema diff: Phoenix (preview) vs ArenaSolP-Prod (production)
 *
 * Run locally:  node scripts/compare-schemas.mjs
 *
 * Uses two approaches (tries both, uses whichever responds):
 *   1. Supabase /rest/v1/ OpenAPI spec  — always works with service_role key
 *   2. SQL via RPC exec_sql or /rest/v1/sql — works if the function exists
 */

const PHOENIX = {
  url: 'https://chtqtuishqtypnknofmi.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodHF0dWlzaHF0eXBua25vZm1pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE0OTM3NywiZXhwIjoyMDg4NzI1Mzc3fQ.CwBz-AUE55mnQ1OAwTMMG5Ck1ICw4Q3TKfv3pMLL7CM',
};

const PROD = {
  url: 'https://xwiduokkkoaxrhfyuwye.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3aWR1b2tra29heHJoZnl1d3llIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTc3ODg4MiwiZXhwIjoyMTA1MzU0ODgyfQ.s5x8SNa1Fz3_26uO8F70FSUtwC_x3_uuJHXtDnh6Q7g',
};

// ── SQL queries ──────────────────────────────────────────────────────────────

const Q = {
  tables: `SELECT table_name FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,

  columns: `SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema='public'
            ORDER BY table_name, ordinal_position`,

  enums: `SELECT t.typname AS enum_name, e.enumlabel AS enum_value
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
          ORDER BY t.typname, e.enumsortorder`,

  functions: `SELECT routine_name FROM information_schema.routines
              WHERE routine_schema='public' ORDER BY routine_name`,

  policies: `SELECT tablename, policyname, cmd, roles::text
             FROM pg_policies WHERE schemaname='public'
             ORDER BY tablename, policyname`,
};

async function execSQL(project, query) {
  const headers = {
    apikey: project.key,
    Authorization: `Bearer ${project.key}`,
    'Content-Type': 'application/json',
  };

  // Try /rest/v1/sql first (Supabase newer projects)
  const r1 = await fetch(`${project.url}/rest/v1/sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (r1.ok) return r1.json();

  // Fallback: exec_sql RPC
  const r2 = await fetch(`${project.url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (r2.ok) return r2.json();

  throw new Error(`SQL exec failed (${r1.status} / ${r2.status}) — see README for manual steps`);
}

// ── OpenAPI fallback: get table+column list from the PostgREST spec ──────────
async function fetchOpenAPI(project) {
  const res = await fetch(`${project.url}/rest/v1/`, {
    headers: {
      apikey: project.key,
      Authorization: `Bearer ${project.key}`,
      Accept: 'application/openapi+json',
    },
  });
  if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status}`);
  return res.json();
}

function parseOpenAPI(spec) {
  const tables = [];
  const columns = [];
  const defs = spec?.definitions ?? spec?.components?.schemas ?? {};
  for (const [tbl, def] of Object.entries(defs)) {
    tables.push({ table_name: tbl });
    for (const [col, info] of Object.entries(def.properties ?? {})) {
      columns.push({
        table_name: tbl,
        column_name: col,
        data_type: info.format ?? info.type ?? 'unknown',
        is_nullable: (def.required ?? []).includes(col) ? 'NO' : 'YES',
        column_default: null,
      });
    }
  }
  return { tables, columns };
}

async function fetchSchema(project, name) {
  process.stderr.write(`Fetching ${name}…\n`);
  let tables, columns, enums = [], functions = [], policies = [];

  try {
    [tables, columns, enums, functions, policies] = await Promise.all([
      execSQL(project, Q.tables),
      execSQL(project, Q.columns),
      execSQL(project, Q.enums),
      execSQL(project, Q.functions),
      execSQL(project, Q.policies),
    ]);
    process.stderr.write(`  ${name}: SQL API OK\n`);
  } catch (e) {
    process.stderr.write(`  ${name}: SQL API unavailable (${e.message}), trying OpenAPI…\n`);
    const spec = await fetchOpenAPI(project);
    ({ tables, columns } = parseOpenAPI(spec));
    process.stderr.write(`  ${name}: OpenAPI OK — ${tables.length} tables (enums/functions not available via this path)\n`);
  }

  return { tables, columns, enums, functions, policies };
}

// ── Diff helpers ─────────────────────────────────────────────────────────────

function diffTables(p, d) {
  const pSet = new Set((p ?? []).map(r => r.table_name));
  const dSet = new Set((d ?? []).map(r => r.table_name));
  return {
    missing: [...pSet].filter(t => !dSet.has(t)).sort(),
    extra:   [...dSet].filter(t => !pSet.has(t)).sort(),
  };
}

function diffColumns(p, d, missingTables) {
  // skip columns for tables that are entirely missing (those need CREATE TABLE, not ADD COLUMN)
  const skip = new Set(missingTables);
  const pMap = new Map((p ?? []).filter(r => !skip.has(r.table_name)).map(r => [`${r.table_name}.${r.column_name}`, r]));
  const dMap = new Map((d ?? []).filter(r => !skip.has(r.table_name)).map(r => [`${r.table_name}.${r.column_name}`, r]));

  const missing = [];
  const changed = [];
  for (const [key, pr] of pMap) {
    const dr = dMap.get(key);
    if (!dr) { missing.push(pr); continue; }
    if (pr.data_type !== dr.data_type) {
      changed.push({ key, phoenix: pr, prod: dr });
    }
  }
  return { missing, changed };
}

function diffEnums(p, d) {
  const pMap = new Map();
  for (const r of p ?? []) {
    if (!pMap.has(r.enum_name)) pMap.set(r.enum_name, new Set());
    pMap.get(r.enum_name).add(r.enum_value);
  }
  const dMap = new Map();
  for (const r of d ?? []) {
    if (!dMap.has(r.enum_name)) dMap.set(r.enum_name, new Set());
    dMap.get(r.enum_name).add(r.enum_value);
  }
  const results = [];
  for (const [name, pVals] of pMap) {
    const dVals = dMap.get(name) ?? new Set();
    const missingVals = [...pVals].filter(v => !dVals.has(v));
    if (!dMap.has(name)) results.push({ name, status: 'missing', values: [...pVals] });
    else if (missingVals.length) results.push({ name, status: 'missing_values', values: missingVals });
  }
  return results;
}

function diffFunctions(p, d) {
  const pSet = new Set((p ?? []).map(r => r.routine_name));
  const dSet = new Set((d ?? []).map(r => r.routine_name));
  return [...pSet].filter(f => !dSet.has(f)).sort();
}

// ── Main ─────────────────────────────────────────────────────────────────────
const [p, d] = await Promise.all([
  fetchSchema(PHOENIX, 'Phoenix'),
  fetchSchema(PROD,    'Prod'),
]);

const tDiff = diffTables(p.tables, d.tables);
const cDiff = diffColumns(p.columns, d.columns, tDiff.missing);
const eDiff = diffEnums(p.enums, d.enums);
const fDiff = diffFunctions(p.functions, d.functions);

const line = '═'.repeat(60);
console.log(`\n${line}`);
console.log('  Schema diff  Phoenix → ArenaSolP-Prod');
console.log(`${line}\n`);

// ── Tables ──
if (tDiff.missing.length) {
  console.log(`\n🔴 TABLES missing in Prod  (${tDiff.missing.length})\n`);
  tDiff.missing.forEach(t => console.log(`   • ${t}`));
  console.log('\n   Run the corresponding supabase-*.sql file from the repo for each.');
} else {
  console.log('✅ Tables: all present in Prod');
}

if (tDiff.extra.length) {
  console.log(`\n⚠️  Tables only in Prod (not in Phoenix) — review manually:\n`);
  tDiff.extra.forEach(t => console.log(`   • ${t}`));
}

// ── Columns ──
if (cDiff.missing.length) {
  console.log(`\n🔴 COLUMNS missing in Prod  (${cDiff.missing.length})\n`);
  const byTable = {};
  for (const c of cDiff.missing) (byTable[c.table_name] ??= []).push(c);
  for (const [tbl, cols] of Object.entries(byTable).sort()) {
    console.log(`   Table: ${tbl}`);
    for (const c of cols) {
      const nn  = c.is_nullable === 'NO' ? ' NOT NULL' : '';
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
      console.log(`     ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${c.column_name} ${c.data_type}${nn}${def};`);
    }
  }
} else {
  console.log('✅ Columns: all present in Prod');
}

if (cDiff.changed.length) {
  console.log(`\n⚠️  COLUMNS with type differences  (${cDiff.changed.length})\n`);
  for (const c of cDiff.changed) {
    console.log(`   ${c.key}`);
    console.log(`     Phoenix → ${c.phoenix.data_type}   Prod → ${c.prod.data_type}`);
  }
}

// ── Enums ──
if (eDiff.length) {
  console.log(`\n🔴 ENUM differences  (${eDiff.length})\n`);
  for (const e of eDiff) {
    if (e.status === 'missing') {
      console.log(`   CREATE TYPE ${e.name} AS ENUM (${e.values.map(v => `'${v}'`).join(', ')});`);
    } else {
      for (const v of e.values)
        console.log(`   ALTER TYPE ${e.name} ADD VALUE IF NOT EXISTS '${v}';`);
    }
  }
} else if (p.enums?.length) {
  console.log('✅ Enums: all present in Prod');
}

// ── Functions ──
if (fDiff.length) {
  console.log(`\n🔴 FUNCTIONS/RPCs missing in Prod  (${fDiff.length})\n`);
  fDiff.forEach(f => console.log(`   • ${f}`));
  console.log('\n   Check supabase-rpc-functions.sql and re-run any that are missing.');
} else if (p.functions?.length) {
  console.log('✅ Functions: all present in Prod');
}

console.log(`\n${line}\n`);

const total = tDiff.missing.length + cDiff.missing.length + eDiff.length + fDiff.length;
if (total === 0) {
  console.log('🎉 No differences found — Prod schema matches Phoenix!\n');
} else {
  console.log(`⚡ Total items to migrate: ${total}  (tables: ${tDiff.missing.length}, columns: ${cDiff.missing.length}, enums: ${eDiff.length}, functions: ${fDiff.length})\n`);
}
