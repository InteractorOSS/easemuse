// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Protected-characteristic redaction for matching and ranking inputs (FR-AI-09). Age, gender, race,
 * nationality, religion, disability, marital status and photos must never be an input to match
 * analysis or ranking: structured fields are dropped and the matching words in resume text are
 * removed BEFORE the model sees anything. Korean labels are covered because resumes from Korea
 * commonly carry them (birth date, gender, marital status, photo).
 */

export type ProtectedCategory =
  | 'age'
  | 'gender'
  | 'race'
  | 'nationality'
  | 'religion'
  | 'disability'
  | 'marital_status'
  | 'photo';

/** Field names (normalised: lowercase, letters and digits only) that identify a protected attribute. */
const PROTECTED_KEYS: Record<string, ProtectedCategory> = {
  dateofbirth: 'age',
  dob: 'age',
  birthdate: 'age',
  birthday: 'age',
  birthyear: 'age',
  age: 'age',
  yearofbirth: 'age',
  gender: 'gender',
  sex: 'gender',
  pronouns: 'gender',
  genderidentity: 'gender',
  race: 'race',
  ethnicity: 'race',
  ethnicorigin: 'race',
  skincolor: 'race',
  nationality: 'nationality',
  citizenship: 'nationality',
  countryofbirth: 'nationality',
  placeofbirth: 'nationality',
  birthplace: 'nationality',
  religion: 'religion',
  religiousaffiliation: 'religion',
  faith: 'religion',
  disability: 'disability',
  disabilitystatus: 'disability',
  handicap: 'disability',
  healthstatus: 'disability',
  maritalstatus: 'marital_status',
  marital: 'marital_status',
  familystatus: 'marital_status',
  children: 'marital_status',
  numberofchildren: 'marital_status',
  spouse: 'marital_status',
  photo: 'photo',
  photograph: 'photo',
  photourl: 'photo',
  picture: 'photo',
  avatar: 'photo',
  profilepicture: 'photo',
  headshot: 'photo',
  image: 'photo',
  imageurl: 'photo',
};

const normaliseKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export function isProtectedKey(key: string): boolean {
  return normaliseKey(key) in PROTECTED_KEYS;
}

export interface Redacted<T> {
  value: T;
  /** Which categories were found and removed (for the audit trail, never the removed values). */
  removed: ProtectedCategory[];
}

/**
 * Removes protected fields from structured data, at any depth. `workAuthorization` and similar
 * job-related facts are NOT protected characteristics and stay.
 */
export function redactStructured<T>(input: T): Redacted<T> {
  const removed = new Set<ProtectedCategory>();
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const category = PROTECTED_KEYS[normaliseKey(key)];
        if (category) {
          removed.add(category);
          continue;
        }
        out[key] = walk(child);
      }
      return out;
    }
    return value;
  };
  return { value: walk(input) as T, removed: [...removed] };
}

/** True when structured data still holds a protected field (use as a guard on prompt inputs). */
export function containsProtectedField(input: unknown): boolean {
  return redactStructured(input).removed.length > 0;
}

/** Throws when a prompt input would carry a protected attribute: a bug in the caller, caught early. */
export function assertNoProtectedFields(input: unknown, where = 'AI input'): void {
  const { removed } = redactStructured(input);
  if (removed.length > 0)
    throw new Error(`${where} contains protected fields: ${removed.join(', ')}`);
}

interface LabelRule {
  category: ProtectedCategory;
  /** Matches a labelled line such as "Date of Birth: 12 March 1990" or "성별: 남". */
  label: RegExp;
}

const LABEL = String.raw`(?:^|\n)[ \t>*_-]*`;
const SEP = String.raw`[ \t]*[:：=\-–—][ \t]*[^\n]*`;

const LABEL_RULES: LabelRule[] = [
  {
    category: 'age',
    label: new RegExp(
      `${LABEL}(?:date[ \\t]+of[ \\t]+birth|birth[ \\t]*date|birth[ \\t]*day|d\\.?o\\.?b\\.?|year[ \\t]+of[ \\t]+birth|age|생년월일|생일|출생|나이|연령)${SEP}`,
      'giu',
    ),
  },
  {
    category: 'gender',
    label: new RegExp(`${LABEL}(?:gender(?:[ \\t]+identity)?|sex|pronouns?|성별)${SEP}`, 'giu'),
  },
  {
    category: 'race',
    label: new RegExp(`${LABEL}(?:race|ethnicity|ethnic[ \\t]+origin|인종)${SEP}`, 'giu'),
  },
  {
    category: 'nationality',
    label: new RegExp(
      `${LABEL}(?:nationality|citizenship|country[ \\t]+of[ \\t]+birth|place[ \\t]+of[ \\t]+birth|birth[ \\t]*place|국적|출생지)${SEP}`,
      'giu',
    ),
  },
  {
    category: 'religion',
    label: new RegExp(`${LABEL}(?:religion|religious[ \\t]+affiliation|종교)${SEP}`, 'giu'),
  },
  {
    category: 'disability',
    label: new RegExp(`${LABEL}(?:disabilit(?:y|ies)|handicap|장애)${SEP}`, 'giu'),
  },
  {
    category: 'marital_status',
    label: new RegExp(
      `${LABEL}(?:marital[ \\t]+status|family[ \\t]+status|children|number[ \\t]+of[ \\t]+children|spouse|혼인|결혼|배우자|자녀)${SEP}`,
      'giu',
    ),
  },
  {
    category: 'photo',
    label: new RegExp(`${LABEL}(?:photo(?:graph)?|picture|headshot|사진)${SEP}`, 'giu'),
  },
];

/** Inline patterns that are not on a labelled line. */
const INLINE_RULES: { category: ProtectedCategory; pattern: RegExp }[] = [
  // Markdown images and inline data URIs (photos).
  { category: 'photo', pattern: /!\[[^\]]*\]\([^)]*\)/g },
  { category: 'photo', pattern: /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/gi },
  // "born on 12 March 1990", "born in 1990"
  { category: 'age', pattern: /\bborn\s+(?:on|in)\s+(?:\d{1,2}\s+)?(?:[A-Za-z]+\s+)?\d{4}\b/gi },
  // "34 years old", "34-year-old", "aged 34"
  { category: 'age', pattern: /\b(?:\d{1,2}[- ]years?[- ]old|aged\s+\d{1,2})\b/gi },
  // Numeric birth dates next to nothing else are rare; ISO dates after "DOB" are handled by the label rule.
];

/**
 * Removes protected characteristics from resume or profile TEXT. Labelled lines are dropped whole
 * and inline phrases are cut out; everything else, including employers, titles, dates of
 * employment, skills and education, is left alone (that is what the model is tested on).
 */
export function redactText(text: string): Redacted<string> {
  const removed = new Set<ProtectedCategory>();
  let out = `\n${text}`;
  for (const { category, label } of LABEL_RULES) {
    out = out.replace(label, () => {
      removed.add(category);
      return '\n';
    });
  }
  for (const { category, pattern } of INLINE_RULES) {
    out = out.replace(pattern, () => {
      removed.add(category);
      return '';
    });
  }
  return {
    value: out
      .slice(1)
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    removed: [...removed],
  };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A run of 8 or more digits that may carry spaces, dots, dashes, parentheses and a leading plus.
const PHONE = /(?<![\d])\+?\(?\d[\d\s().-]{6,}\d(?![\d])/g;

/**
 * Replaces email addresses and phone numbers in free text, for notes and pasted emails that go to a
 * model (names and contact details never do, FR-AI-09). Dates and short numbers such as "180-190k"
 * are left alone.
 */
export function scrubContactDetails(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, (match) => {
    const digits = match.replace(/\D/g, '');
    const isDate =
      /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(match) ||
      /^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/.test(match);
    return digits.length >= 8 && !isDate ? '[phone]' : match;
  });
}
