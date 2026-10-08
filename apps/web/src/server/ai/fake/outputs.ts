// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  CHANNEL_LIMITS,
  INTAKE_TOPICS,
  JD_SECTIONS,
  MATCH_WEIGHT_KEYS,
  OUTREACH_TOKENS,
  QUALIFICATION_TOPICS,
  REPORT_SECTIONS,
  SCREENING_ITEMS,
  type BenchmarkCategory,
  type BenchmarkModelOutput,
  type CallQuestionsModelOutput,
  type CandidateProfileContent,
  type Claim,
  type CriterionResult,
  type Evidence,
  type FitLevel,
  type IntakeQuestionsModelOutput,
  type IntakeTopic,
  type JdSection,
  type MatchAnalysisModelOutput,
  type MatchLevel,
  type MatchWeightKey,
  type OutreachModelOutput,
  type PortfolioFitModelOutput,
  type QualificationLevel,
  type QualificationModelOutput,
  type QualificationTopic,
  type ReportSection,
  type ScreeningDraftContent,
  type ScreeningItem,
  type SearchCriteria,
  type SimilarCandidatesModelOutput,
  type StructuredJdModelOutput,
  type SubmissionReportModelOutput,
  type SuccessProfileModelOutput,
  type TailoredResumeModelOutput,
} from '@easemuse/core';
import type { CallQuestionsInput } from '../prompts/call-questions';
import type { VerifierOutput } from '../prompts/factcheck';
import type { IntakeQuestionsInput } from '../prompts/intake-questions';
import type { JdStructureInput } from '../prompts/jd-structure';
import type { BenchmarkInput } from '../prompts/market-benchmark';
import { renderCandidateForMatch, type MatchAnalyzeInput } from '../prompts/match-analyze';
import type { OutreachDraftInput } from '../prompts/outreach-draft';
import type { PoolSimilarInput } from '../prompts/pool-similar';
import type { PortfolioCheckInput } from '../prompts/portfolio-check';
import type { ProfileStructureInput } from '../prompts/profile-structure';
import type { QualifyNotesInput } from '../prompts/qualify-notes';
import { missingSections, type ReportDraftInput } from '../prompts/report-draft';
import type { ResumeTailorInput } from '../prompts/resume-tailor';
import type { ScreeningPrefillInput } from '../prompts/screening-prefill';
import type { SearchCriteriaInput } from '../prompts/search-criteria';
import type { SuccessProfileInput } from '../prompts/success-profile';

/**
 * Canned answers for the local fake model (AI_FAKE=on; never in production). One generator per AI
 * purpose: given the purpose's structured input, it returns an answer that passes the purpose's
 * schema and its `toContent` step, so the whole pipeline runs without a real model.
 *
 * The answers are demo data, so they are built from the input where that is easy (a line of the JD,
 * the candidate's listed skills) and are deterministic: the same input always gives the same answer,
 * which keeps end-to-end tests stable. Quotes are always real substrings of the source text, so the
 * grounding checks keep them as quotes. Names and contact details are never written: the real
 * prompts never see them either.
 */

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

/** Cuts to `max` characters; a prefix of a source line is still a substring of the source. */
const clip = (s: string, max: number) => s.trim().slice(0, max).trim();

/** Non-empty lines and sentences of a text, each a substring of it (trimmed only at the edges). */
function pieces(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'years',
  'year',
  'experience',
  'from',
  'into',
  'that',
  'this',
  'have',
  'has',
  'are',
  'not',
  'any',
  'all',
  'our',
  'their',
  'role',
  'work',
  'team',
]);

/** Significant lowercase words, for simple overlap checks between two texts. */
function wordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}+#]+/u)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w)),
  );
}

const overlaps = (a: string, b: Set<string>) => [...wordsOf(a)].some((w) => b.has(w));

/** A list for a schema that wants non-empty, bounded, unique strings. */
const tidyList = (values: (string | null | undefined)[], maxItem: number, maxCount: number) =>
  [...new Set(values.map((v) => clip(v ?? '', maxItem)).filter((v) => v.length > 0))].slice(
    0,
    maxCount,
  );

// ---------------------------------------------------------------------------------------------
// A1 jd.structure
// ---------------------------------------------------------------------------------------------

/** A JD line's section and priority, read from its wording (a crude stand-in for the model). */
function classifyJdLine(
  line: string,
): { section: JdSection; category: 'must_have' | 'preferred' | 'disqualifying' } | null {
  if (/\bno (agenc|recruit)|will not be considered|must not\b/i.test(line))
    return { section: 'required_qualifications', category: 'disqualifying' };
  if (/\b(prefer|preferred|a plus|nice to have|bonus|desirable)\b/i.test(line))
    return { section: 'preferred_qualifications', category: 'preferred' };
  if (/\d+\+?\s*(years|yrs)\b/i.test(line))
    return { section: 'years_of_experience', category: 'must_have' };
  if (/\b(degree|bachelor|master|phd|certif)/i.test(line))
    return { section: 'education_certification', category: 'must_have' };
  if (/\b(remote|hybrid|on-?site|office)\b/i.test(line))
    return { section: 'location', category: 'preferred' };
  if (/\b(required|must|need|essential|minimum)\b/i.test(line))
    return { section: 'required_qualifications', category: 'must_have' };
  return null;
}

function jdStructure(input: JdStructureInput): StructuredJdModelOutput {
  const lines = pieces(input.jdText);
  const requirements: StructuredJdModelOutput['requirements'] = [];
  for (const line of lines) {
    const kind = classifyJdLine(line);
    if (kind && requirements.length < 8)
      requirements.push({ ...kind, text: clip(line, 500), quote: clip(line, 400) });
  }
  // A recruiter-entered skill counts only when the JD names it too (the prompt's rule).
  for (const skill of input.position.requiredSkills ?? []) {
    const at = input.jdText.toLowerCase().indexOf(skill.toLowerCase());
    if (at < 0 || requirements.length >= 12 || !skill.trim()) continue;
    const quote = input.jdText.slice(at, at + skill.length);
    requirements.push({
      section: 'technical_skills',
      text: clip(skill, 500),
      category: 'must_have',
      quote,
    });
  }
  const found = new Map<JdSection, string>();
  if (lines[0]) found.set('position_summary', clip(lines[0], 4000));
  for (const r of requirements)
    found.set(r.section, clip([found.get(r.section), r.text].filter(Boolean).join(' '), 4000));
  return {
    sections: Object.fromEntries(
      JD_SECTIONS.map((s) => [
        s,
        found.has(s)
          ? { status: 'found' as const, summary: found.get(s)! }
          : { status: 'missing' as const, summary: '' },
      ]),
    ) as StructuredJdModelOutput['sections'],
    requirements,
  };
}

// ---------------------------------------------------------------------------------------------
// A2 intake.questions
// ---------------------------------------------------------------------------------------------

const TOPIC_QUESTIONS: Record<IntakeTopic, (title: string) => string> = {
  business_reason: (t) => `Why is the ${t} position open now?`,
  key_challenges: (t) => `What is the hardest problem the new ${t} will face?`,
  expected_results: () => 'What should this person have achieved after six and twelve months?',
  must_have_experience: () => 'Which experience is truly essential, without exception?',
  preferred_experience: () => 'Which experience would make a candidate stand out?',
  exclusions: () => 'Is there any background you would not consider?',
  org_reporting: (t) => `Who does the ${t} report to, and who reports to them?`,
  compensation_range: () => 'What is the approved compensation range for this role?',
  interview_process: () => 'What are the interview stages, and who takes part in each?',
  expected_timeline: () => 'By when do you need the person to start?',
};

function intakeQuestions(input: IntakeQuestionsInput): IntakeQuestionsModelOutput {
  const title = clip(input.position.title, 120) || 'role';
  const gaps = JD_SECTIONS.filter((s) => input.structuredJd.sections[s]?.status === 'missing').map(
    (section) => ({
      topic: 'jd_gap' as const,
      section,
      question: `The JD says nothing about ${section.replace(/_/g, ' ')}. What should it say?`,
      reason: 'This section is missing from the JD.',
    }),
  );
  const topics = INTAKE_TOPICS.map((topic) => ({
    topic,
    question: TOPIC_QUESTIONS[topic](title),
    reason: `Standard intake topic: ${topic.replace(/_/g, ' ')}.`,
  }));
  return { questions: [...gaps, ...topics].slice(0, 60) };
}

// ---------------------------------------------------------------------------------------------
// A5 success_profile.create
// ---------------------------------------------------------------------------------------------

function successProfile(input: SuccessProfileInput): SuccessProfileModelOutput {
  const fromJd = input.structuredJd.requirements.map((r) => ({
    text: clip(r.text, 500),
    category: r.category,
    basis: 'jd' as const,
  }));
  const intakeValue = (topic: IntakeTopic) => input.intake[topic]?.value?.trim() ?? '';
  const fromIntake = [
    { topic: 'must_have_experience', category: 'must_have' },
    { topic: 'preferred_experience', category: 'preferred' },
    { topic: 'exclusions', category: 'disqualifying' },
  ] as const;
  const intakeCriteria = fromIntake
    .filter((x) => intakeValue(x.topic))
    .map((x) => ({
      text: clip(intakeValue(x.topic), 500),
      category: x.category,
      basis: 'intake' as const,
    }));
  const criteria = [...fromJd, ...intakeCriteria].filter((c) => c.text).slice(0, 60);
  const firstMust = criteria.find((c) => c.category === 'must_have');
  const summary = clip(
    `A ${input.position.title} for ${input.position.location}${firstMust ? ` who brings ${firstMust.text}` : ''}.`,
    1500,
  );
  const challenge = intakeValue('key_challenges');
  return {
    summary,
    criteria,
    expectations: {
      sixMonths: clip(intakeValue('expected_results'), 1500),
      twelveMonths: '',
    },
    keyChallenges: challenge ? [clip(challenge, 400)] : [],
  };
}

// ---------------------------------------------------------------------------------------------
// A6 search_criteria.create
// ---------------------------------------------------------------------------------------------

const SENIORITY_WORDS = /\b(junior|senior|staff|principal|lead|head|director|manager|vp|chief)\b/gi;

function searchCriteria(input: SearchCriteriaInput): SearchCriteria {
  const wanted = input.profile.criteria.filter(
    (c) => c.category === 'must_have' || c.category === 'preferred',
  );
  const skills = tidyList(
    wanted.map((c) => c.text),
    120,
    10,
  );
  const years = input.profile.criteria
    .map((c) => /(\d{1,2})\+?\s*(?:years|yrs)/i.exec(c.text)?.[1])
    .find(Boolean);
  const seniority = tidyList(
    [...input.position.title.matchAll(SENIORITY_WORDS)].map((m) => m[0]),
    120,
    5,
  );
  const title = clip(input.position.title, 120);
  const quoted = skills.slice(0, 3).map((s) => `"${s.replace(/"/g, '')}"`);
  return {
    jobTitles: tidyList([title], 120, 30),
    skills,
    industries: [],
    companies: [],
    geography: tidyList([input.position.location], 120, 30),
    yearsOfExperience: { min: years ? Math.min(60, Number(years)) : null, max: null },
    education: [],
    seniority,
    leadershipExperience: [],
    keywordSearch: clip(
      [`"${title.replace(/"/g, '')}"`, quoted.length ? `(${quoted.join(' OR ')})` : '']
        .filter(Boolean)
        .join(' AND '),
      1500,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// A7 profile.structure
// ---------------------------------------------------------------------------------------------

const TITLE_WORDS =
  /\b(engineer|developer|manager|director|lead|head|analyst|designer|consultant|specialist|officer|recruiter|scientist|architect|vp|president|coordinator|administrator|partner|associate)\b/i;
// "2019-present", "Mar 2019 to Jun 2021": an optional month name, so a company name is not taken for one.
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s';
// A year with an optional month name before it or month number after it ("2023-02").
const YEAR = `(?:${MONTH})?\\d{4}(?:[-/]\\d{1,2})?`;
const DATE_RANGE = new RegExp(
  `\\(?\\b(${YEAR})\\s*(?:-|–|to)\\s*(${YEAR}|present|current|now)\\b\\)?`,
  'i',
);
// An email address or a phone-like number (three digit groups), not a date range such as 2019-2023.
const CONTACT = /@|\+\d|\d{2,4}[\s.-]\d{3,4}[\s.-]\d{4}/;

/** Skills the fake recognises in free text. Real extraction is the model's job. */
const SKILL_VOCABULARY = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'Kotlin',
  'Go',
  'Rust',
  'SQL',
  'PostgreSQL',
  'React',
  'Node.js',
  'AWS',
  'GCP',
  'Azure',
  'Kubernetes',
  'Docker',
  'Excel',
  'Salesforce',
  'Workday',
  'SAP',
  'Figma',
  'payroll',
  'recruiting',
  'compliance',
];

/** Finds the vocabulary skills in the text, written as the text writes them. */
function skillsIn(text: string): string[] {
  const found: string[] = [];
  for (const skill of SKILL_VOCABULARY) {
    const escaped = skill.replace(/[.+]/g, '\\$&');
    // Short capitalised names ("Go", "SAP") match only as written, so "go" and "sap" do not count.
    const flags = skill.length <= 3 ? '' : 'i';
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, `u${flags}`).exec(text);
    if (m) found.push(m[0]);
  }
  return found;
}

/** "Senior HR Director at Northwind 2019-present" (or "**Title** | Company | dates") into its parts. */
function parseRoleLine(line: string) {
  const plain = line.replace(/\*\*|__/g, '').replace(/^#+\s*/, '');
  const range = DATE_RANGE.exec(plain);
  const withoutDates = (range ? plain.replace(range[0], '') : plain)
    .replace(/[\s,|–-]+$/, '')
    .trim();
  // A "|" or "at" separates title and company more reliably than a comma, which titles contain.
  const parts = [/\s+\|\s+/, /\s+(?:at|@)\s+/i, /,\s+/]
    .map((separator) => withoutDates.split(separator))
    .find((split) => split.length > 1) ?? [withoutDates];
  const [title, company] = parts;
  const end = range?.[2] ?? null;
  const current = end !== null && /present|current|now/i.test(end);
  return {
    title: clip(title ?? withoutDates, 160),
    company: company ? clip(company, 160) : null,
    start: range?.[1] ? clip(range[1], 40) : null,
    end: current || !end ? null : clip(end, 40),
    current,
  };
}

const quoteClaim = (line: string): Claim => ({
  text: clip(line, 400),
  evidence: [{ type: 'quote', source: 'resume', excerpt: clip(line, 500) }],
});

function profileStructure(input: ProfileStructureInput): CandidateProfileContent {
  // Lines with contact details are skipped everywhere: they never belong in a model answer.
  const lines = pieces(input.sourceText).filter((l) => !CONTACT.test(l));
  // Lines with dates are the job lines when a resume has them; otherwise any line with a job title.
  const titled = lines.filter((l) => TITLE_WORDS.test(l) && l.length <= 200);
  const dated = titled.filter((l) => DATE_RANGE.test(l));
  const roleLines = dated.length > 0 ? dated : titled;
  const roles = roleLines.slice(0, 5).map((line) => {
    const role = parseRoleLine(line);
    const next = lines[lines.indexOf(line) + 1];
    const summary = next && !roleLines.includes(next) ? clip(next, 1200) : '';
    return { ...role, company: role.company ?? '', summary };
  });
  const current = roles[0];
  const skillsLine = lines.find((l) => /^skills?\s*:/i.test(l));
  const listed = skillsLine ? skillsLine.replace(/^skills?\s*:/i, '').split(/[,;]/) : [];
  const leadership = lines.find((l) =>
    /\b(led|managed|manag\w+|head(ed)?)\b.*\b(team|reports|people)\b/i.test(l),
  );
  const teamSize = /team of (\d+)|(\d+)\s+(?:direct )?reports/i.exec(input.sourceText);
  const achievements = lines
    .filter((l) => /\d+%|\b(led|built|cut|grew|increased|reduced|launched|delivered)\b/i.test(l))
    .filter((l) => !roleLines.includes(l))
    .slice(0, 3);
  const degree = lines.find((l) => /\b(BA|BS|BSc|MA|MS|MSc|MBA|PhD|Bachelor|Master)\b/.test(l));
  return {
    // Names and contact details never reach the model, so the fake never fills them either.
    fullName: null,
    email: null,
    phone: null,
    currentPosition: {
      title: current?.title || null,
      company: current?.company || null,
    },
    careerHistory: roles,
    education: degree ? [{ school: '', degree: clip(degree, 160), year: null }] : [],
    coreSkills: tidyList(listed, 120, 40),
    industryExperience: [],
    technicalSkills: tidyList(skillsIn(input.sourceText), 120, 60),
    leadershipExperience: leadership ? clip(leadership, 800) : null,
    teamSize: teamSize ? (teamSize[1] ?? teamSize[2] ?? null) : null,
    careerProgression: null,
    majorAchievements: achievements.map(quoteClaim),
    location: null,
    workAuthorization: null,
    compensationExpectation: null,
    potentialMotivation: current
      ? {
          text: 'May be open to a role with a broader scope.',
          evidence: [
            { type: 'inferred', rationale: 'A reading of the career history, not a fact.' },
          ],
        }
      : null,
    potentialConcerns: [],
  };
}

// ---------------------------------------------------------------------------------------------
// A10 match.analyze
// ---------------------------------------------------------------------------------------------

const LEVEL_SCORE: Record<MatchLevel, number> = { strong: 88, partial: 65, gap: 30, unknown: 50 };

/** A quote copied from the rendered candidate text: the line that starts with `prefix`. */
function lineQuote(rendered: string, prefix: string): Evidence[] {
  const line = rendered.split('\n').find((l) => l.startsWith(prefix));
  return line ? [{ type: 'quote', source: 'profile', excerpt: clip(line, 500) }] : [];
}

function judge(
  key: MatchWeightKey,
  level: MatchLevel,
  summary: string,
  evidence: Evidence[],
  toConfirm: string[] = [],
): CriterionResult {
  return {
    key,
    level,
    score: LEVEL_SCORE[level],
    summary,
    evidence: evidence.length
      ? evidence.slice(0, 3)
      : [{ type: 'inferred', rationale: 'The profile does not state this.' }],
    toConfirm: toConfirm.slice(0, 3),
  };
}

function matchAnalyze(input: MatchAnalyzeInput): MatchAnalysisModelOutput {
  const c = input.candidate;
  const rendered = renderCandidateForMatch(c);
  const candidateWords = wordsOf(rendered);
  const criteriaText = input.successProfile.criteria.map((x) => x.text).join(' ');
  const skills = [...c.coreSkills, ...c.technicalSkills];
  const skillHit = skills.some((s) => overlaps(s, wordsOf(criteriaText)));
  const sameLocation =
    c.location !== null &&
    (c.location.toLowerCase().includes(input.position.location.toLowerCase()) ||
      input.position.location.toLowerCase().includes(c.location.toLowerCase()));

  const byKey: Record<MatchWeightKey, CriterionResult> = {
    coreCompetencies: skillHit
      ? judge('coreCompetencies', 'strong', 'The listed skills cover the profile criteria.', [
          ...lineQuote(rendered, 'Core skills:'),
          ...lineQuote(rendered, 'Technical skills:'),
        ])
      : skills.length
        ? judge('coreCompetencies', 'partial', 'Some related skills, not the named ones.', [
            ...lineQuote(rendered, 'Core skills:'),
            ...lineQuote(rendered, 'Technical skills:'),
          ])
        : judge(
            'coreCompetencies',
            'unknown',
            'The profile lists no skills.',
            [],
            ['Which of the core skills has the candidate used?'],
          ),
    relevantExperience: c.careerHistory.length
      ? judge(
          'relevantExperience',
          overlaps(input.position.title, candidateWords) ? 'strong' : 'partial',
          'Experience in related roles.',
          lineQuote(rendered, 'Job:'),
        )
      : judge(
          'relevantExperience',
          'unknown',
          'No career history is listed.',
          [],
          ['Walk through the recent roles.'],
        ),
    industryFunctional: c.industryExperience.length
      ? judge(
          'industryFunctional',
          'partial',
          'Industry background is listed.',
          lineQuote(rendered, 'Industry experience:'),
        )
      : judge(
          'industryFunctional',
          'unknown',
          'No industry background is stated.',
          [],
          ['Which industries has the candidate worked in?'],
        ),
    careerLevel:
      c.leadershipExperience || c.teamSize
        ? judge('careerLevel', 'strong', 'Leadership scope is stated.', [
            ...lineQuote(rendered, 'Leadership:'),
            ...lineQuote(rendered, 'Team size:'),
          ])
        : c.careerHistory.length
          ? judge(
              'careerLevel',
              'partial',
              'Seniority is not fully clear.',
              lineQuote(rendered, 'Job:'),
              ['What is the scope of the current role?'],
            )
          : judge(
              'careerLevel',
              'unknown',
              'Seniority is not stated.',
              [],
              ['What level is the current role?'],
            ),
    locationArrangement: c.location
      ? judge(
          'locationArrangement',
          sameLocation ? 'strong' : 'partial',
          sameLocation ? 'Based where the role is.' : 'Based elsewhere than the role.',
          lineQuote(rendered, 'Location:'),
          sameLocation ? [] : ['Is the candidate open to relocating?'],
        )
      : judge(
          'locationArrangement',
          'unknown',
          'Location is not stated.',
          [],
          ['Where is the candidate based?'],
        ),
    educationCertification: c.education.length
      ? judge(
          'educationCertification',
          'partial',
          'Education is listed.',
          lineQuote(rendered, 'Education:'),
        )
      : judge(
          'educationCertification',
          'unknown',
          'Education is not stated.',
          [],
          ['Which degrees or certifications does the candidate hold?'],
        ),
    compensationOther: c.compensationExpectation
      ? judge(
          'compensationOther',
          'partial',
          'A compensation expectation is stated.',
          lineQuote(rendered, 'Compensation expectation:'),
          ['Confirm the expectation against the range.'],
        )
      : judge(
          'compensationOther',
          'unknown',
          'Compensation expectation is not stated.',
          [],
          ['What compensation does the candidate expect?'],
        ),
  };

  const requirements = input.successProfile.criteria
    .filter((x) => x.category === 'must_have' || x.category === 'disqualifying')
    .slice(0, 80)
    .map((x) => {
      // A deal-breaker is never asserted by the fake: whether it applies is the recruiter's call.
      if (x.category === 'disqualifying')
        return { criterionId: x.id, status: 'unknown' as const, evidence: [] };
      const met = overlaps(x.text, candidateWords);
      return {
        criterionId: x.id,
        status: met ? ('met' as const) : ('unknown' as const),
        evidence: met
          ? [
              {
                type: 'inferred' as const,
                rationale: 'Words of the criterion appear in the profile.',
              },
            ]
          : [],
      };
    });

  return { criteria: MATCH_WEIGHT_KEYS.map((k) => byKey[k]), requirements };
}

// ---------------------------------------------------------------------------------------------
// A12 outreach.draft
// ---------------------------------------------------------------------------------------------

const WHY_NOW: Record<1 | 2 | 3, string> = {
  1: 'The team is hiring now, so it is a good moment to talk.',
  2: 'Following up on my earlier note in case it got buried.',
  3: 'This is my last message about it; the door stays open if the timing changes.',
};

function outreachDraft(input: OutreachDraftInput): OutreachModelOutput {
  const c = input.candidate;
  const p = input.position;
  const currentRole = [c.currentPosition.title, c.currentPosition.company]
    .filter(Boolean)
    .join(' at ');
  const skill = c.coreSkills[0];
  const whyYou = clip(
    currentRole
      ? `Your work as ${currentRole}${skill ? ` and your ${skill} background` : ''} stood out to me.`
      : `Your ${skill ?? 'professional'} background stood out to me.`,
    300,
  );
  const extras = [
    input.include.location
      ? `It is based in ${p.location}${p.workArrangement ? ` (${p.workArrangement})` : ''}.`
      : null,
    input.include.compensation && p.compensation ? `Compensation: ${p.compensation}.` : null,
    input.include.nextStep ? 'Would you be open to a short call?' : null,
  ].filter(Boolean);
  const whyRole = clip(`I am working on a ${p.title} role. ${extras.join(' ')}`, 500);
  const parts = [
    `Hi ${OUTREACH_TOKENS.firstName},`,
    whyYou,
    whyRole,
    WHY_NOW[input.touchNumber],
    `Best,\n${OUTREACH_TOKENS.recruiter}`,
  ];
  // Short channels lose the middle parts first; the greeting, the reason and the sign-off stay.
  const limit = CHANNEL_LIMITS[input.channel];
  let body = parts.join('\n\n');
  if (body.length > limit) body = [parts[0], parts[1], parts[3], parts[4]].join('\n\n');
  if (body.length > limit) body = [parts[0], parts[1], parts[4]].join('\n\n');
  return {
    subject: input.channel === 'email' ? clip(`${p.title}: a role that may fit you`, 150) : '',
    body: clip(body, Math.min(limit, 4000)),
  };
}

// ---------------------------------------------------------------------------------------------
// A13 call.questions
// ---------------------------------------------------------------------------------------------

const CALL_QUESTIONS: Record<QualificationTopic, (location: string) => string> = {
  interest: () => 'What caught your interest in this role?',
  motivation: () => 'What would make your next move worthwhile?',
  reasonForMove: () => 'Why are you open to a change right now?',
  satisfaction: () => 'What do you enjoy most and least about your current role?',
  compensation: () => 'What are your compensation expectations?',
  location: (l) => `How would working in ${l} suit you?`,
  workAuthorization: (l) => `Are you able to work in ${l}?`,
  availability: () => 'What notice period would you need to give?',
  interviewReadiness: () => 'When could you be available for interviews?',
  otherProcesses: () => 'Are you in other hiring processes at the moment?',
  decisionFactors: () => 'What will matter most when you decide?',
  counterofferRisk: () => 'How would you respond if your employer asked you to stay?',
};

function callQuestions(input: CallQuestionsInput): CallQuestionsModelOutput {
  const location = clip(input.position.location, 100) || 'the job location';
  const standard = QUALIFICATION_TOPICS.map((topic) => ({
    topic,
    question: CALL_QUESTIONS[topic](location),
  }));
  const open = input.toConfirm
    .map((point) => clip(point, 300))
    .filter(Boolean)
    .map((point) => ({
      topic: 'toConfirm' as const,
      question: `Could you tell me about this: ${point}`,
    }));
  return { questions: [...standard, ...open].slice(0, 40) };
}

// ---------------------------------------------------------------------------------------------
// A14 notes.qualify
// ---------------------------------------------------------------------------------------------

/** Which words in the notes speak to which field. A rough reading; the recruiter confirms each. */
const NOTE_CUES: Partial<Record<QualificationTopic, RegExp>> = {
  interest: /\b(keen|interested|excited|curious)\b/i,
  motivation: /\b(wants?|looking for|growth|scope|challenge)\b/i,
  reasonForMove: /\b(leav\w*|reorg\w*|layoff|restructur\w*|why move)\b/i,
  compensation: /\d+\s*k\b|\b(salary|comp\w*|pay|krw|usd|won)\b/i,
  location: /\b(relocat\w*|remote|hybrid|commute|based in)\b/i,
  workAuthorization: /\b(visa|permit|authori[sz]\w*|citizen\w*)\b/i,
  availability: /\b(notice|available|start)\b|\b\d+\s*(days|weeks)\b/i,
  interviewReadiness: /\b(interview\w*|evenings?|mornings?)\b/i,
  otherProcesses: /\b(other process\w*|offers?|elsewhere|final round)\b/i,
  counterofferRisk: /\bcounter\w*/i,
};

function levelFor(topic: QualificationTopic, fragment: string): QualificationLevel | null {
  if (topic === 'interest') return /\b(very|keen|excited)\b/i.test(fragment) ? 'high' : 'medium';
  if (topic === 'counterofferRisk') return 'medium';
  if (topic === 'interviewReadiness') return 'medium';
  return null;
}

function qualifyNotes(input: QualifyNotesInput): QualificationModelOutput {
  const fragments = input.notes
    .split(/[\n;,.]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const fields = Object.fromEntries(
    QUALIFICATION_TOPICS.map((topic) => {
      const cue = NOTE_CUES[topic];
      const fragment = cue ? fragments.find((f) => cue.test(f)) : undefined;
      if (!fragment) return [topic, { value: '', level: null, inferred: false }];
      // A counteroffer risk is a reading of the notes, never something the candidate said outright.
      return [
        topic,
        {
          value: clip(fragment, 400),
          level: levelFor(topic, fragment),
          inferred: topic === 'counterofferRisk',
        },
      ];
    }),
  ) as QualificationModelOutput['fields'];
  return { fields };
}

// ---------------------------------------------------------------------------------------------
// A15 resume.tailor
// ---------------------------------------------------------------------------------------------

function resumeTailor(input: ResumeTailorInput): TailoredResumeModelOutput {
  const p = input.profile;
  const wanted = wordsOf(input.successProfile.criteria.map((c) => c.text).join(' '));
  const skills = [...p.coreSkills, ...p.technicalSkills];
  // Skills the role asks for go first; the wording is copied, so nothing new is claimed.
  const ordered = [
    ...skills.filter((s) => overlaps(s, wanted)),
    ...skills.filter((s) => !overlaps(s, wanted)),
  ];
  const current = [p.currentPosition.title, p.currentPosition.company].filter(Boolean).join(' at ');
  const summary = clip(
    [
      current ? `${current}.` : '',
      ordered.length ? `Skills include ${ordered.slice(0, 3).join(', ')}.` : '',
      p.teamSize ? `Team size: ${p.teamSize}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    800,
  );
  return {
    summary,
    roles: p.careerHistory.slice(0, 40).flatMap((j, i) => {
      const bullets = pieces(j.summary)
        .map((s) => clip(s, 320))
        .slice(0, 6);
      return bullets.length ? [{ index: i + 1, bullets }] : [];
    }),
    skills: tidyList(ordered, 80, 30),
  };
}

// ---------------------------------------------------------------------------------------------
// A16 report.draft
// ---------------------------------------------------------------------------------------------

function reportDraft(input: ReportDraftInput): SubmissionReportModelOutput {
  const p = input.profile;
  const missing = new Set(missingSections(input));
  const current = [p.currentPosition.title, p.currentPosition.company].filter(Boolean).join(' at ');
  const jobs = p.careerHistory.map(
    (j) =>
      `${j.title} at ${j.company} (${j.start ?? '?'} to ${j.current ? 'present' : (j.end ?? '?')})`,
  );
  const a = input.analysis;
  const q = input.qualification;
  const confirmed = (topic: QualificationTopic) =>
    q?.[topic]?.value.trim() || 'Not discussed on the call.';
  const sections: Record<ReportSection, string> = {
    overview: `The candidate is put forward for the ${input.position.title} role in ${input.position.location}.`,
    currentPosition: current
      ? `The candidate is currently ${current}.`
      : 'The current role is not stated.',
    careerSummary: jobs.length ? jobs.join('; ') : 'The profile lists no roles.',
    keyQualifications:
      [
        [...p.coreSkills, ...p.technicalSkills].join(', '),
        ...p.education.map((e) => `${e.degree}, ${e.school}${e.year ? `, ${e.year}` : ''}`),
      ]
        .filter(Boolean)
        .join('\n') || 'No qualifications are listed.',
    achievements:
      p.majorAchievements.map((x) => x.text).join('\n') || 'No achievements are listed.',
    jdMatch: a ? a.criteria.map((c) => `${c.key}: ${c.level}. ${c.summary}`).join('\n') : '',
    recommendation: a
      ? a.criteria
          .filter((c) => c.level === 'strong')
          .map((c) => c.summary)
          .join('\n') || 'No criterion is rated strong.'
      : '',
    concerns: a
      ? [
          ...a.criteria
            .filter((c) => c.level === 'partial' || c.level === 'gap')
            .map((c) => c.summary),
          ...a.unmet.map((u) => `Unmet: ${u}`),
          ...a.toConfirm.map((t) => `To confirm: ${t}`),
        ].join('\n') || 'No concerns were recorded.'
      : '',
    compensation: confirmed('compensation'),
    location: confirmed('location'),
    workAuthorization: confirmed('workAuthorization'),
    motivation: confirmed('motivation'),
    interviewAvailability: confirmed('availability'),
  };
  // Sections without a source are not requested: the prompt asks for an empty string there.
  return Object.fromEntries(
    REPORT_SECTIONS.map((k) => [k, missing.has(k) ? '' : clip(sections[k], 3000)]),
  ) as SubmissionReportModelOutput;
}

// ---------------------------------------------------------------------------------------------
// A11 screening.prefill
// ---------------------------------------------------------------------------------------------

function screeningPrefill(input: ScreeningPrefillInput): ScreeningDraftContent {
  const p = input.profile;
  const roles = p.careerHistory.length;
  const latest = p.careerHistory[0];
  const near = (a: string, b: string) =>
    a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
  const item = (
    rating: 'strong' | 'adequate' | 'concern' | null,
    note: string,
  ): ScreeningDraftContent['items'][ScreeningItem] =>
    rating ? { rating, note: clip(note, 300) } : { rating: null, note: '' };
  const items: Record<ScreeningItem, ScreeningDraftContent['items'][ScreeningItem]> = {
    careerConsistency: roles
      ? item(
          'adequate',
          `The profile lists ${roles} role(s); the latest is ${latest!.title} at ${latest!.company}.`,
        )
      : item(null, ''),
    jobChanges: roles ? item('adequate', `${roles} role(s) are listed.`) : item(null, ''),
    employmentGaps: item(null, ''),
    scopeOfResponsibility: p.leadershipExperience
      ? item('adequate', p.leadershipExperience)
      : item(null, ''),
    teamSize: p.teamSize ? item('adequate', `Team size stated: ${p.teamSize}.`) : item(null, ''),
    reportingStructure: item(null, ''),
    accomplishments: p.majorAchievements[0]
      ? item('strong', p.majorAchievements[0].text)
      : item(null, ''),
    technicalCompetency: p.technicalSkills.length
      ? item('adequate', `Technical skills: ${p.technicalSkills.join(', ')}.`)
      : item(null, ''),
    leadershipCompetency: p.leadershipExperience
      ? item('adequate', p.leadershipExperience)
      : item(null, ''),
    compensationExpectation: p.compensationExpectation
      ? item('adequate', `Expectation stated: ${p.compensationExpectation}.`)
      : item(null, ''),
    location: p.location
      ? near(p.location, input.position.location)
        ? item('strong', `The candidate is in ${p.location}, where the role is.`)
        : item(
            'concern',
            `The candidate is in ${p.location}; the role is in ${input.position.location}.`,
          )
      : item(null, ''),
    workAuthorization: p.workAuthorization ? item('adequate', p.workAuthorization) : item(null, ''),
    relocation: item(null, ''),
    careerMotivation: item(null, ''),
  };
  return {
    items: Object.fromEntries(
      SCREENING_ITEMS.map((k) => [k, items[k]]),
    ) as ScreeningDraftContent['items'],
  };
}

// ---------------------------------------------------------------------------------------------
// A8 pool.similar and A9 portfolio.check
// ---------------------------------------------------------------------------------------------

function poolSimilar(input: PoolSimilarInput): SimilarCandidatesModelOutput {
  return {
    items: input.candidates.slice(0, 25).map((c) => {
      const first = (c.text.split('\n').find((l) => l.trim()) ?? '').replace(/^[^:]{1,40}:\s*/, '');
      const shortCard = c.text.split('\n').filter((l) => l.trim()).length < 2;
      return {
        ref: c.ref,
        reason: clip(
          first
            ? `The card shows ${clip(first, 120)}, which overlaps with the ${clip(input.position.title, 60)} profile.`
            : `The card has little detail to compare with the ${clip(input.position.title, 60)} profile.`,
          240,
        ),
        caveat: shortCard ? 'The card is short; open the profile to check the experience.' : null,
      };
    }),
  };
}

function portfolioCheck(input: PortfolioCheckInput): PortfolioFitModelOutput {
  const candidateWords = wordsOf(input.candidateText);
  return {
    items: input.positions.slice(0, 60).map((p) => {
      const titleWords = [...wordsOf(p.title)];
      const hits = titleWords.filter((w) => candidateWords.has(w)).length;
      const profileHit = overlaps(p.profileText, candidateWords);
      const fit: FitLevel =
        titleWords.length > 0 && hits === titleWords.length
          ? 'strong'
          : hits > 0 || profileHit
            ? 'moderate'
            : 'low';
      const reason = {
        strong: `The card covers the central terms of the ${clip(p.title, 80)} profile.`,
        moderate: `The card covers part of the ${clip(p.title, 80)} profile.`,
        low: `Little of the ${clip(p.title, 80)} profile is visible in the card.`,
      }[fit];
      return { ref: p.ref, fit, reason };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// A3 market.benchmark
// ---------------------------------------------------------------------------------------------

/** Where an "Our data" finding would change the JD. */
const SECTION_FOR: Record<BenchmarkCategory, JdSection> = {
  title: 'position_summary',
  responsibility: 'key_responsibilities',
  skill: 'technical_skills',
  experience: 'years_of_experience',
  industry: 'industry_experience',
  education: 'education_certification',
  compensation: 'compensation',
  location: 'location',
};

/**
 * The fake never searches the web (its client reports search unavailable), so it writes no web
 * findings: a web item without a real cited page would be dropped anyway. Suggestions rest only on
 * the agency's own data, which the input carries.
 */
function marketBenchmark(input: BenchmarkInput): BenchmarkModelOutput {
  return {
    web: [],
    suggestions: input.ourData.slice(0, 3).map((o) => {
      const section = SECTION_FOR[o.category];
      const update = o.category === 'compensation' || o.category === 'location';
      return {
        kind: update ? ('update_section' as const) : ('add_requirement' as const),
        section,
        text: clip(o.text, 1500),
        category: update ? null : ('preferred' as const),
        requirementId: null,
        rationale: clip(`The agency's past positions show: ${o.text}`, 500),
        basedOn: [o.id],
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// X1 factcheck.verify
// ---------------------------------------------------------------------------------------------

/** The fake verifier finds nothing; the deterministic step still runs for real. */
function factCheckVerify(): VerifierOutput {
  return { unsupported: [] };
}

// ---------------------------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------------------------

const GENERATORS: Record<string, (input: never) => unknown> = {
  'jd.structure': jdStructure,
  'intake.questions': intakeQuestions,
  'success_profile.create': successProfile,
  'search_criteria.create': searchCriteria,
  'profile.structure': profileStructure,
  'match.analyze': matchAnalyze,
  'outreach.draft': outreachDraft,
  'call.questions': callQuestions,
  'notes.qualify': qualifyNotes,
  'resume.tailor': resumeTailor,
  'report.draft': reportDraft,
  'screening.prefill': screeningPrefill,
  'pool.similar': poolSimilar,
  'portfolio.check': portfolioCheck,
  'market.benchmark': marketBenchmark,
  'factcheck.verify': factCheckVerify,
};

export function fakeOutput(purpose: string, input: unknown): unknown {
  const generate = Object.hasOwn(GENERATORS, purpose) ? GENERATORS[purpose] : undefined;
  if (!generate) throw new Error(`The fake model has no answer for ${purpose}`);
  return generate(input as never);
}
