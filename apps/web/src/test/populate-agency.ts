// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';

/**
 * Puts one row into EVERY table that has an `agencyId` column, found from the live database catalog
 * (not from any list in the code), so a table that someone adds later and forgets in the tenant
 * export or deletion is caught: it will hold rows after the job and the test fails.
 *
 * Values are generated from the column types; foreign keys point at rows inserted earlier (parents
 * first, in the order the catalog's foreign keys dictate). Needs the owner connection (bypasses RLS).
 */
export async function populateAgency(
  admin: pg.Client,
  input: { agencyId: string; userId: string },
): Promise<Record<string, number>> {
  const { agencyId, userId } = input;
  const tables = (
    await admin.query<{ table_name: string }>(
      `SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema = 'public' AND c.column_name = 'agencyId' AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name`,
    )
  ).rows.map((r) => r.table_name);

  const fks = (
    await admin.query<{ child: string; col: string; parent: string }>(
      `SELECT cl.relname AS child, a.attname AS col, pl.relname AS parent
         FROM pg_constraint k
         JOIN pg_class cl ON cl.oid = k.conrelid
         JOIN pg_class pl ON pl.oid = k.confrelid
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
        WHERE k.contype = 'f' AND cardinality(k.conkey) = 1
          AND cl.relnamespace = 'public'::regnamespace`,
    )
  ).rows;

  // Parents before children.
  const order: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining].filter(
      (t) =>
        !fks.some(
          (f) =>
            f.child === t && f.parent !== t && remaining.has(f.parent) && tables.includes(f.parent),
        ),
    );
    if (ready.length === 0)
      throw new Error(`Foreign key cycle among: ${[...remaining].join(', ')}`);
    for (const t of ready.sort()) {
      order.push(t);
      remaining.delete(t);
    }
  }

  const inserted = new Map<string, string>(); // table -> id of the row inserted
  const counts: Record<string, number> = {};
  for (const table of order) {
    const columns = (
      await admin.query<{
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      )
    ).rows;
    const names: string[] = [];
    const values: string[] = [];
    for (const col of columns) {
      const required = col.is_nullable === 'NO' && col.column_default === null;
      if (col.column_name === 'agencyId') {
        names.push('"agencyId"');
        values.push(`'${agencyId}'::uuid`);
        continue;
      }
      if (!required) continue;
      const fk = fks.find((f) => f.child === table && f.col === col.column_name);
      let value: string;
      if (fk) {
        const parentId =
          fk.parent === 'Agency'
            ? agencyId
            : fk.parent === 'User'
              ? userId
              : inserted.get(fk.parent);
        if (!parentId)
          throw new Error(`${table}.${col.column_name}: no parent row in ${fk.parent}`);
        value = `'${parentId}'::uuid`;
      } else if (col.data_type === 'uuid') value = 'gen_random_uuid()';
      else if (col.data_type === 'text' || col.data_type === 'character varying')
        value = `'seed-' || gen_random_uuid()::text`;
      else if (
        col.data_type === 'integer' ||
        col.data_type === 'bigint' ||
        col.data_type === 'smallint'
      )
        value = '0';
      else if (col.data_type === 'numeric' || col.data_type === 'double precision') value = '0';
      else if (col.data_type === 'boolean') value = 'false';
      else if (col.data_type.startsWith('timestamp')) value = 'now()';
      else if (col.data_type === 'date') value = 'now()::date';
      else if (col.data_type === 'jsonb' || col.data_type === 'json') value = `'{}'`;
      else if (col.data_type === 'bytea') value = `'\\x00'::bytea`;
      else if (col.data_type === 'ARRAY') value = `'{}'`;
      else if (col.udt_name === 'vector') value = `array_fill(0, ARRAY[1024])::vector`;
      else if (col.data_type === 'USER-DEFINED') {
        const label = await admin.query<{ enumlabel: string }>(
          `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`,
          [col.udt_name],
        );
        if (!label.rows[0])
          throw new Error(`${table}.${col.column_name}: unknown type ${col.udt_name}`);
        value = `'${label.rows[0].enumlabel}'::"${col.udt_name}"`;
      } else throw new Error(`${table}.${col.column_name}: unsupported type ${col.data_type}`);
      names.push(`"${col.column_name}"`);
      values.push(value);
    }
    const hasId = columns.some((c) => c.column_name === 'id');
    const returning = hasId ? ' RETURNING id::text' : '';
    const result = await admin.query<{ id: string }>(
      `INSERT INTO "${table}" (${names.join(', ')}) VALUES (${values.join(', ')})${returning}`,
    );
    if (hasId && result.rows[0]) inserted.set(table, result.rows[0].id);
    counts[table] = 1;
  }
  return counts;
}
