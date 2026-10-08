// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

/**
 * Builds the smallest value that satisfies a zod schema (zod 4): required strings get a placeholder
 * that meets their length, numbers their lower bound, enums their first value, optional and
 * defaulted fields are left out, nullable ones are null. Used by the end-to-end test model (T-QA-06)
 * as the base for canned answers, so a schema change cannot silently break the stub: the result is
 * always checked against the real schema before it is returned.
 */
type Def = {
  type: string;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
  options?: z.ZodType[];
  innerType?: z.ZodType;
  in?: z.ZodType;
  entries?: Record<string, string | number>;
  values?: unknown[];
  items?: z.ZodType[];
  left?: z.ZodType;
  right?: z.ZodType;
  format?: string;
  getter?: () => z.ZodType;
  checks?: { _zod: { def: Record<string, unknown> } }[];
};

const defOf = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;

function bounds(def: Def) {
  const out: { min?: number; max?: number; greater?: number; less?: number; exact?: number } = {};
  for (const check of def.checks ?? []) {
    const c = check._zod.def;
    const value = c.value as number | undefined;
    if (c.check === 'min_length') out.min = c.minimum as number;
    if (c.check === 'max_length') out.max = c.maximum as number;
    if (c.check === 'length_equals') out.exact = c.length as number;
    if (c.check === 'greater_than' && value !== undefined)
      out.greater = c.inclusive ? value : value + 1;
    if (c.check === 'less_than' && value !== undefined) out.less = c.inclusive ? value : value - 1;
  }
  return out;
}

const SAMPLES: Record<string, () => string> = {
  email: () => 'person@example.com',
  url: () => 'https://example.com/page',
  uuid: () => randomUUID(),
  guid: () => randomUUID(),
  date: () => '2026-01-15',
  datetime: () => '2026-01-15T00:00:00.000Z',
};

export function sampleFromSchema(schema: z.ZodType): unknown {
  const def = defOf(schema);
  switch (def.type) {
    case 'string': {
      const named = def.format ? SAMPLES[def.format] : undefined;
      if (named) return named();
      const b = bounds(def);
      let text = 'Example';
      const need = b.exact ?? b.min ?? 0;
      while (text.length < need) text += ' text';
      return text.slice(0, b.exact ?? b.max ?? text.length);
    }
    case 'number':
    case 'int': {
      const b = bounds(def);
      return b.greater ?? b.less ?? 0;
    }
    case 'boolean':
      return false;
    case 'enum':
      return Object.values(def.entries ?? {})[0];
    case 'literal':
      return def.values?.[0];
    case 'null':
      return null;
    case 'nullable':
      return null;
    case 'optional':
    case 'default':
    case 'prefault':
      return undefined;
    case 'array': {
      const b = bounds(def);
      return Array.from({ length: b.min ?? 0 }, () => sampleFromSchema(def.element!));
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(def.shape ?? {})) {
        const value = sampleFromSchema(child);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    case 'union':
      return sampleFromSchema(def.options![0]!);
    case 'record':
      return {};
    case 'tuple':
      return (def.items ?? []).map((item) => sampleFromSchema(item));
    case 'pipe':
    case 'readonly':
    case 'catch':
      return sampleFromSchema(def.in ?? def.innerType!);
    case 'lazy':
      return sampleFromSchema(def.getter!());
    case 'intersection':
      return {
        ...(sampleFromSchema(def.left!) as object),
        ...(sampleFromSchema(def.right!) as object),
      };
    case 'date':
      return new Date('2026-01-15T00:00:00.000Z');
    default:
      return null;
  }
}
