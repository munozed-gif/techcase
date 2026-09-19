#!/usr/bin/env bash
# Apply the full schema to a test Supabase project using psql.
#
# Usage:
#   export TEST_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
#   bash scripts/apply-schema-to-test.sh
#
# The TEST_DB_URL is the "Direct connection" string from:
#   Supabase Dashboard → your test project → Settings → Database → Connection string → URI
#
# You can also pass it inline:
#   TEST_DB_URL="..." bash scripts/apply-schema-to-test.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "${TEST_DB_URL:-}" ]]; then
  echo "ERROR: TEST_DB_URL is not set."
  echo "  export TEST_DB_URL=\"postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres\""
  exit 1
fi

run_sql() {
  local file="$1"
  echo "  → $(basename "$file")"
  psql "$TEST_DB_URL" -f "$file" -v ON_ERROR_STOP=0 --quiet 2>&1 | grep -v "^$" | grep -v "^NOTICE" || true
}

echo "Applying schema to test project..."
echo ""

# 1. Core schema first (creates all base tables)
run_sql "$ROOT/supabase-schema.sql"

# 2. Migrations in alphabetical order (each is idempotent / uses IF NOT EXISTS)
for f in "$ROOT"/supabase-*.sql; do
  [[ "$(basename "$f")" == "supabase-schema.sql" ]] && continue
  run_sql "$f"
done

echo ""
echo "Done. Your test project is ready."
