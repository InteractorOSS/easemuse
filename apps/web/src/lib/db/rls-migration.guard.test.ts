// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static twin of rls.guard.db.test.ts (T-F-10): runs without a database. Every Prisma model with an
 * `agencyId` field must be covered by ENABLE + FORCE ROW LEVEL SECURITY and an `agency_isolation`
 * policy in the migrations, so a new model cannot merge without isolation.
 */
const PRISMA_DIR = path.resolve(__dirname, '../../../prisma');
const PLATFORM_MODELS_WITHOUT_RLS = ['JobRun', 'PlatformAuditLog'];

function modelsWithAgencyId(schema: string): string[] {
  const models: string[] = [];
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (/^\s+agencyId\s/m.test(match[2]!)) models.push(match[1]!);
  }
  return models;
}

function allMigrationSql(): string {
  const dir = path.join(PRISMA_DIR, 'migrations');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => readFileSync(path.join(dir, d.name, 'migration.sql'), 'utf8'))
    .join('\n');
}

describe('RLS migration guard', () => {
  const schema = readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  const sql = allMigrationSql();
  const tenantModels = modelsWithAgencyId(schema).filter(
    (m) => !PLATFORM_MODELS_WITHOUT_RLS.includes(m),
  );

  it('finds the tenant models (sanity)', () => {
    expect(tenantModels.length).toBeGreaterThan(30);
  });

  it.each(tenantModels)('%s has RLS enabled, forced and the agency_isolation policy', (model) => {
    expect(sql, `${model}: ENABLE`).toContain(`ALTER TABLE "${model}" ENABLE ROW LEVEL SECURITY;`);
    expect(sql, `${model}: FORCE`).toContain(`ALTER TABLE "${model}" FORCE ROW LEVEL SECURITY;`);
    expect(sql, `${model}: policy`).toMatch(
      new RegExp(`CREATE POLICY agency_isolation ON "${model}"`),
    );
  });

  it('only exempts platform models that really have agencyId and are not isolated', () => {
    const all = modelsWithAgencyId(schema);
    for (const model of PLATFORM_MODELS_WITHOUT_RLS) {
      expect(all, `${model} no longer has agencyId; drop it from the allowlist`).toContain(model);
      expect(sql, `${model} has RLS now; drop it from the allowlist`).not.toContain(
        `ALTER TABLE "${model}" ENABLE ROW LEVEL SECURITY`,
      );
    }
  });

  it('never writes the policy predicate without NULLIF (empty-string setting would raise)', () => {
    const naive = /current_setting\('app\.(agency|user)_id', true\)::uuid/;
    expect(sql).not.toMatch(naive);
  });
});
