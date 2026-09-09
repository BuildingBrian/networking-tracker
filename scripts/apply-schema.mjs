/**
 * Applies db/schema.sql to the database in DATABASE_URL, then prints the
 * resulting RLS configuration so the security requirements are verifiable.
 *
 *   npm run db:push
 *
 * Uses Neon's HTTP driver (port 443) rather than the Postgres wire protocol
 * (5432), so it works from sandboxed environments and CI runners that only
 * allow outbound HTTPS.
 */
import { readFile } from 'node:fs/promises';

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local — see the README.');
  process.exit(1);
}

/**
 * Splits SQL into top-level statements. Naively splitting on ";" would cut the
 * trigger function in half, so this tracks dollar-quoted bodies ($$ ... $$),
 * ordinary quoted strings, and comments, and only breaks at depth zero.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const rest = sql.slice(i);

    // Line comment
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }

    // Dollar-quoted block: $tag$ ... $tag$
    const dollar = /^\$([A-Za-z_]*)\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Single-quoted string, honouring '' escapes
    if (rest[0] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j += 1;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    if (rest[0] === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i += 1;
      continue;
    }

    current += sql[i];
    i += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

const sqlText = await readFile('db/schema.sql', 'utf8');
const statements = splitStatements(sqlText);
const sql = neon(url);

console.log(`Applying ${statements.length} statements from db/schema.sql…`);

for (const [index, statement] of statements.entries()) {
  try {
    await sql.query(statement);
  } catch (error) {
    const preview = statement.split('\n')[0].slice(0, 70);
    console.error(`\n✗ Statement ${index + 1} failed: ${preview}…`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

console.log('✓ Schema applied.\n');

// --- Verify the security posture actually landed --------------------------
const [flags] = await sql.query(
  `select relrowsecurity as enabled, relforcerowsecurity as forced
     from pg_class where oid = 'public.contacts'::regclass`,
);
console.log(`RLS enabled: ${flags.enabled}   forced: ${flags.forced}`);

const policies = await sql.query(
  `select policyname, cmd, qual, with_check
     from pg_policies
    where schemaname = 'public' and tablename = 'contacts'
    order by cmd, policyname`,
);
console.log(`\n${policies.length} policies on public.contacts:`);
for (const p of policies) {
  console.log(`  ${String(p.cmd).padEnd(6)} ${p.policyname}`);
  console.log(`         USING      ${p.qual ?? '—'}`);
  console.log(`         WITH CHECK ${p.with_check ?? '—'}`);
}

const columns = await sql.query(
  `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts'
    order by ordinal_position`,
);
console.log('\ncontacts columns:');
for (const c of columns) {
  const def = c.column_default ? ` default ${c.column_default}` : '';
  console.log(
    `  ${c.column_name.padEnd(14)} ${c.data_type.padEnd(26)} ${c.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'}${def}`,
  );
}
