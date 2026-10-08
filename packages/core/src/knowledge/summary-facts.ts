// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  patternSummaryContentSchema,
  type PatternSummaryContent,
  type PatternSummaryModelOutput,
  type SummaryStatement,
} from '../artifacts/pattern-summary';
import { isSmallSample, mentionsProtected } from './guardrails';
import type { EntryRef, PatternReports, PatternQuestion, RateRow } from './patterns';

/** One numbered fact the model may cite: a count out of the records, with those records behind it. */
export interface SummaryFact {
  id: string;
  question: PatternQuestion;
  label: string;
  n: number;
  hits: number;
  rate: number | null;
  small: boolean;
  refs: EntryRef[];
  refCount: number;
}

const MAX_FACTS = 90;

const fromRow = (
  question: PatternQuestion,
  label: string,
  r: Pick<RateRow, 'n' | 'hits' | 'rate' | 'small' | 'refs' | 'refCount'>,
): Omit<SummaryFact, 'id'> => ({
  question,
  label,
  n: r.n,
  hits: r.hits,
  rate: r.rate,
  small: r.small,
  refs: r.refs,
  refCount: r.refCount,
});

/**
 * Turns the pattern reports into the numbered facts of A18. Only counts and the labels of
 * job-related groups go in: no names, no free text, no comments. A fact whose label mentions a
 * protected characteristic is left out.
 */
export function summaryFacts(reports: PatternReports): SummaryFact[] {
  const raw: Omit<SummaryFact, 'id'>[] = [];
  const profile = (
    question: PatternQuestion,
    p: PatternReports['interviewProfiles'],
    what: string,
  ) => {
    raw.push(fromRow(question, `all candidates ${what}`, p.base));
    for (const [dim, rows] of [
      ['seniority', p.seniority],
      ['experience', p.experience],
      ['skill', p.skill],
      ['source', p.source],
    ] as const) {
      for (const r of rows.slice(0, dim === 'skill' ? 8 : 6))
        raw.push(fromRow(question, `${dim} "${r.label}", ${what}`, r));
    }
  };
  profile('interviewProfiles', reports.interviewProfiles, 'who were invited to interview');
  profile('hireProfiles', reports.hireProfiles, 'who were hired');

  for (const s of reports.sources) {
    const base = { n: s.submitted, small: s.small, refs: s.refs, refCount: s.refCount };
    raw.push(
      fromRow('sources', `source "${s.source}": submitted candidates who were interviewed`, {
        ...base,
        hits: s.interviewed,
        rate: s.qualityRate,
      }),
      fromRow('sources', `source "${s.source}": submitted candidates who were hired`, {
        ...base,
        hits: s.hired,
        rate: s.submitted === 0 ? null : Math.round((s.hired / s.submitted) * 100),
      }),
    );
  }

  for (const r of reports.jdResponse.byPosition.slice(0, 8))
    raw.push(fromRow('jdResponse', `position "${r.label}": contacted candidates who answered`, r));
  for (const r of reports.jdResponse.byArrangement)
    raw.push(
      fromRow('jdResponse', `work arrangement "${r.label}": contacted candidates who answered`, r),
    );
  for (const r of reports.jdResponse.byPay)
    raw.push(fromRow('jdResponse', `${r.label}: contacted candidates who answered`, r));

  for (const d of reports.dropOff.rows.slice(0, 8)) {
    raw.push(
      fromRow('dropOff', `left at stage "${d.stage}", of all who left`, {
        n: reports.dropOff.left,
        hits: d.count,
        rate: d.share,
        small: d.small,
        refs: d.refs,
        refCount: d.refCount,
      }),
    );
    for (const reason of d.reasons.slice(0, 3))
      raw.push(
        fromRow('dropOff', `left at stage "${d.stage}" with reason "${reason.code}"`, {
          n: d.count,
          hits: reason.count,
          rate: Math.round((reason.count / d.count) * 100),
          small: d.small,
          refs: d.refs,
          refCount: d.refCount,
        }),
      );
  }

  const hm = reports.hmPreferences;
  profile(
    'hmPreferences',
    hm.decided,
    'whom the hiring manager moved to interview, of those decided on',
  );
  for (const r of hm.ratings) {
    if (r.total === 0) continue;
    const noRefs = { refs: [] as EntryRef[], refCount: 0 };
    raw.push(
      fromRow('hmPreferences', `hiring manager rated ${r.criterion} "strong", of all its ratings`, {
        n: r.total,
        hits: r.strong,
        rate: Math.round((r.strong / r.total) * 100),
        small: r.small,
        ...noRefs,
      }),
      fromRow('hmPreferences', `hiring manager rated ${r.criterion} "gap", of all its ratings`, {
        n: r.total,
        hits: r.gap,
        rate: Math.round((r.gap / r.total) * 100),
        small: r.small,
        ...noRefs,
      }),
    );
  }

  const hc = reports.hireCharacteristics;
  for (const [dim, rows] of [
    ['seniority', hc.seniority],
    ['experience', hc.experience],
    ['skill', hc.skill.slice(0, 8)],
    ['source', hc.source],
  ] as const) {
    for (const r of rows.slice(0, 6))
      raw.push(
        fromRow('hireCharacteristics', `${dim} "${r.label}", among hires`, {
          ...r,
          n: hc.hires,
          hits: r.n,
          rate: hc.hires === 0 ? null : Math.round((r.n / hc.hires) * 100),
          small: isSmallSample(hc.hires),
        }),
      );
  }
  for (const c of hc.criteria) {
    if (c.hires.n > 0)
      raw.push(
        fromRow(
          'hireCharacteristics',
          `hires with a reviewed analysis: ${c.criterion} was strong`,
          c.hires,
        ),
      );
    if (c.others.n > 0)
      raw.push(
        fromRow(
          'hireCharacteristics',
          `submitted candidates not hired, with a reviewed analysis: ${c.criterion} was strong`,
          c.others,
        ),
      );
  }

  return raw
    .filter((f) => f.n > 0 && !mentionsProtected(f.label))
    .slice(0, MAX_FACTS)
    .map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

export type DropReason = 'unknown_fact' | 'no_fact' | 'number_not_in_facts' | 'protected';

export interface CheckedStatements {
  kept: SummaryStatement[];
  dropped: { text: string; reason: DropReason }[];
}

const NUMBER = /\d+(?:[.,]\d+)?/g;

/** The numbers a sentence may use for the facts it cites: the counts, the percentage and the numbers in the labels. */
function allowedNumbers(facts: SummaryFact[]): Set<string> {
  const allowed = new Set<string>();
  for (const f of facts) {
    allowed.add(String(f.n));
    allowed.add(String(f.hits));
    if (f.rate !== null) allowed.add(String(f.rate));
    for (const m of f.label.match(NUMBER) ?? []) allowed.add(m);
  }
  return allowed;
}

/**
 * The fact check of A18 (ADR-006: nothing is stated that the source does not support). Every
 * sentence must cite at least one real fact; every number in it must be one of the numbers of the
 * facts it cites; and it must not mention a protected characteristic. A sentence that fails is
 * removed, not repaired. The evidence of the sentences that remain is copied from the facts.
 */
export function checkStatements(
  output: PatternSummaryModelOutput,
  facts: SummaryFact[],
): CheckedStatements {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const kept: SummaryStatement[] = [];
  const dropped: CheckedStatements['dropped'] = [];
  for (const [i, s] of output.statements.entries()) {
    const cited = [...new Set(s.factIds)].map((id) => byId.get(id));
    if (cited.length === 0) {
      dropped.push({ text: s.text, reason: 'no_fact' });
      continue;
    }
    if (cited.some((f) => !f)) {
      dropped.push({ text: s.text, reason: 'unknown_fact' });
      continue;
    }
    const used = cited as SummaryFact[];
    if (mentionsProtected(s.text)) {
      dropped.push({ text: s.text, reason: 'protected' });
      continue;
    }
    const allowed = allowedNumbers(used);
    const numbers = (s.text.match(NUMBER) ?? []).map((m) => m.replace(',', '.'));
    if (numbers.some((m) => !allowed.has(m))) {
      dropped.push({ text: s.text, reason: 'number_not_in_facts' });
      continue;
    }
    kept.push({
      id: `s${i + 1}`,
      text: s.text,
      tentative: used.some((f) => f.small),
      evidence: used.map((f) => ({
        factId: f.id,
        label: f.label,
        n: f.n,
        hits: f.hits,
        rate: f.rate,
        small: f.small,
        refCount: f.refCount,
        refs: f.refs,
      })),
    });
  }
  return { kept, dropped };
}

/** Builds the stored draft from the model's answer, after the check. */
export function summaryContent(
  output: PatternSummaryModelOutput,
  facts: SummaryFact[],
  context: {
    clientId: string;
    clientName: string;
    asOf: string;
    records: number;
    positions: number;
    withheld: number;
  },
): PatternSummaryContent {
  const { kept, dropped } = checkStatements(output, facts);
  return patternSummaryContentSchema.parse({
    clientId: context.clientId,
    clientName: context.clientName,
    asOf: context.asOf,
    records: context.records,
    positions: context.positions,
    statements: kept,
    checks: { removed: dropped.length, withheld: context.withheld },
  });
}
