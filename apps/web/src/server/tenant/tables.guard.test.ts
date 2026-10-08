// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPORT_OMITTED_COLUMNS, KEPT_TABLES, TENANT_TABLES } from './tables';

/**
 * Guard (ADR-016, T-13-10): every Prisma model with an `agencyId` is in the tenant deletion list, the
 * list has no extras or duplicates, and it is ordered so that a table is deleted after every table that
 * has a foreign key to it. A new tenant table that is not added here fails this test.
 */
const schema = readFileSync(path.resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');
const models = new Map(
  [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => [m[1]!, m[2]!] as const),
);
const withAgencyId = [...models].filter(([, body]) => /^\s+agencyId\s/m.test(body)).map(([n]) => n);

describe('tenant table list', () => {
  it('finds the models (sanity)', () => {
    expect(withAgencyId.length).toBeGreaterThan(40);
  });

  it('contains every model that has an agencyId, except the platform audit log', () => {
    const expected = withAgencyId.filter((n) => !(KEPT_TABLES as readonly string[]).includes(n));
    expect([...TENANT_TABLES].sort()).toEqual(expected.sort());
  });

  it('only keeps tables that really have an agencyId and are not also deleted', () => {
    for (const kept of KEPT_TABLES) {
      expect(withAgencyId).toContain(kept);
      expect(TENANT_TABLES as readonly string[]).not.toContain(kept);
    }
  });

  it('lists each table once', () => {
    expect(new Set(TENANT_TABLES).size).toBe(TENANT_TABLES.length);
  });

  it('deletes a table only after every table that points at it', () => {
    const position = new Map(TENANT_TABLES.map((t, i) => [t as string, i]));
    for (const table of TENANT_TABLES) {
      for (const line of models.get(table)!.split('\n')) {
        const parent = /^\s+\w+\s+(\w+)\??\s+@relation\(fields:/.exec(line)?.[1];
        if (parent && position.has(parent)) {
          expect(
            position.get(table)!,
            `${table} has a foreign key to ${parent}, so it must be deleted first`,
          ).toBeLessThan(position.get(parent)!);
        }
      }
    }
  });

  it('only omits columns that exist', () => {
    for (const [table, columns] of Object.entries(EXPORT_OMITTED_COLUMNS)) {
      for (const column of columns) {
        expect(models.get(table)!, `${table}.${column}`).toMatch(
          new RegExp(`^\\s+${column}\\s`, 'm'),
        );
      }
    }
  });
});
