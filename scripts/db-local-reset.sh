#!/usr/bin/env bash
# Tạo lại database kiểm thử cục bộ (PostgreSQL thường) và áp toàn bộ migrations.
# Dùng: PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/db-local-reset.sh
# KHÔNG dùng script này cho Supabase thật.
set -euo pipefail
DB="${TEST_DB_NAME:-minhky_test}"
case "$DB" in *test*) ;; *) echo "Tên database phải chứa 'test' để tránh chạy nhầm." >&2; exit 1;; esac
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/local/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
echo "Đã áp migrations vào $DB"
