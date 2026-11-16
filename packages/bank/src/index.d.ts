// Types for @openstage/bank (BANK-1, the reader's view of an OpenAssess bank, format 1).

export type QuestionType =
  | "multipleChoice" | "multipleResponse" | "trueFalse" | "fillInBlank" | "matching" | "ordering"
  | "numeric" | "shortAnswer" | "essay" | "hotspot" | "calculated";
export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
export type Difficulty = "easy" | "medium" | "hard";
export type Status = "draft" | "reviewed" | "approved" | "retired";
export type BankErrorCode = "not-a-zip" | "no-manifest" | "damaged-manifest" | "not-a-bank" | "no-version" | "newer-format";

/** Text from the bank: `html` cleaned to the subset (BANK-1 section 5.2), and the same as plain text. */
export interface Text {
  html: string;
  text: string;
}

export interface Option {
  id: string;
  text: Text;
  correct: boolean;
  /** Kept in place when the others are shuffled. */
  fixed: boolean;
  feedback?: Text;
}

export interface Picture {
  id: string;
  /** Its path in the bank; pass it to `bank.media()` for the bytes. */
  file: string;
  mime: string;
  /** Its description; empty when it is decorative or has none. */
  alt: string;
  decorative: boolean;
  width?: number;
  height?: number;
  /** Whether the bank holds the file. */
  present: boolean;
}

export interface Equation {
  id: string;
  latex: string;
  mathml: string;
  source?: "omml" | "typed" | "latex" | "image";
}

export type Key =
  | { correct: string[]; partialCredit?: boolean }
  | { correct: boolean | null }
  | { caseSensitive: boolean; blanks: Array<{ id: string; label?: string; accepted: string[] }> }
  | { caseSensitive: boolean; accepted: string[] }
  | { pairs: Array<{ id: string; left: Text; right: string }>; distractors: string[] }
  | { items: Array<{ id: string; text: Text; position: number }> }
  | { mode: "exact" | "range" | "tolerance"; value?: number; min?: number; max?: number; tolerance?: number; units?: string }
  | { modelAnswer?: Text; rubric: Array<{ criterion: string; points: number; description?: string }>; expectedWords?: number }
  | { mediaRef: string; regions: object[]; alternative?: Text }
  | { formula: string; variables: object[]; tolerance: number; toleranceIsPercent: boolean };

export interface Metadata {
  objective?: string;
  chapter?: string;
  section?: string;
  page?: string;
  bloom?: BloomLevel;
  difficulty?: Difficulty;
  tags: string[];
  author?: string;
  status: Status;
  custom?: Record<string, string>;
}

export interface HistoryEntry {
  at: string;
  by: string;
  change: string;
  fromVersion?: number;
  toVersion?: number;
}

export interface Question {
  id: string;
  /** The question's version: 1, then one more for each saved edit. */
  revision: number;
  type: QuestionType;
  typeName: string;
  title: string;
  stem: Text;
  points: number;
  /** The options of a multiple choice or multiple response question, in the bank's order. */
  options?: Option[];
  shuffle?: boolean;
  key: Key;
  /** Whether the bank records an answer for it (BANK-1 section 8.2). */
  hasKey: boolean;
  feedback: { general?: Text; correct?: Text; incorrect?: Text };
  metadata: Metadata;
  folder: { id: string; name: string; path: string[] } | null;
  pictures: Picture[];
  equations: Equation[];
  history: HistoryEntry[];
  lastChanged: { at: string; by: string } | null;
  usage: { tests: string[]; timesGiven: number; lastGiven: string | null };
  /** OpenAssess's own notes on the question that nobody dismissed. */
  findings: Array<{ code: string; severity: "error" | "warn" | "info"; message: string }>;
  origin?: object;
  /** The question as it is stored, NOT cleaned: never put its HTML on a page. */
  raw: object;
}

export interface Folder {
  id: string;
  name: string;
  /** The names from the top folder down to this one. */
  path: string[];
  parentId: string | null;
  depth: number;
  /** The questions in this folder itself (not its sub-folders), in order. */
  questionIds: string[];
}

export interface Problem {
  file: string;
  questionId?: string;
  message: string;
  /** True when what the file holds was not read at all. */
  skipped: boolean;
}

export interface Bank {
  format: "openassess-bank";
  formatVersion: number;
  bankId: string;
  title: string;
  description?: string;
  subject?: string;
  created: string;
  modified: string;
  generator: string;
  folders: Folder[];
  /** In folder order (top to bottom, each folder before the ones inside it), then those in no folder by id. */
  questions: Question[];
  tests: Array<{ id: string; name: string; created: string; questionIds: string[] }>;
  administrations: Array<{ id: string; testId: string; testName: string; date: string; sheets: number; questionIds: string[] }>;
  problems: Problem[];
  /** A file of the bank (a picture's `file`): its bytes, or null when the bank does not hold it. */
  media(file: string): Promise<Uint8Array | null>;
}

export interface ReadOptions {
  /** Unpacks raw deflate data, for a place with no DecompressionStream and no node:zlib. */
  inflateRaw?: (data: Uint8Array, limit: number) => Uint8Array | Promise<Uint8Array>;
  /** The most question files read (200,000). */
  maxQuestions?: number;
}

export class BankError extends Error {
  code: BankErrorCode;
}

export const BANK_FORMAT: "openassess-bank";
export const BANK_FORMAT_VERSION: 1;
export const EXTENSION: ".openassess";
export const SPEC_REVISION: string;
export const QUESTION_TYPES: QuestionType[];
export const TYPE_NAMES: Record<QuestionType, string>;
export const BLOOM_LEVELS: BloomLevel[];
export const DIFFICULTIES: Difficulty[];
export const STATUSES: Status[];
export const ALLOWED_TAGS: Record<string, string[]>;

export function readBank(bytes: Uint8Array | ArrayBuffer, options?: ReadOptions): Promise<Bank>;
export function readQuestion(raw: unknown, file?: string): { question: Question; notes: string[]; file: string } | { problem: string };
export function cleanHtml(html: string): { html: string; removed: number };
export function htmlToText(html: string, sidecars?: { pictures?: Array<Pick<Picture, "id" | "alt" | "decorative">>; equations?: Array<Pick<Equation, "id" | "latex">> }): string;
export function decodeEntities(text: string): string;
