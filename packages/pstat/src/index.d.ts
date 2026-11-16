// Types for @openstage/pstat. The shapes follow specs/pstat/PSTAT-1.md.

export declare const EXTENSION: "pstat";
export declare const FORMAT: "PrismStatistics project";
export declare const VERSION: 1;
export declare const SPEC_REVISION: string;
export declare const ENTRY: "project.json";
export declare const MAX_UNPACKED: number;

export type Measure = "nominal" | "ordinal" | "scale";

export interface ValueLabel {
  value: number;
  label: string;
}

export interface Variable {
  id: number;
  name: string;
  label: string;
  measure: Measure;
  value_labels: ValueLabel[];
  missing_values: number[];
  missing_ranges?: Array<[number, number]>;
}

export type Column = { type: "numeric"; values: Array<number | null> } | { type: "text"; values: Array<string | null> };

export interface Dataset {
  name: string;
  variables: Variable[];
  columns: Column[];
  next_id: number;
}

export interface ImportReport {
  rows: number;
  variables: number;
  renamed: Array<[string, string]>;
  short_rows: number;
  long_rows?: number;
  skipped_blank_rows?: number;
  sheet?: string | null;
  other_sheets?: string[];
  notes?: string[];
  sas_formats?: Array<[string, string]>;
}

export interface Source {
  file_name: string;
  report: ImportReport;
}

export interface Project {
  format: "PrismStatistics project";
  version: number;
  app_version: string;
  dataset: Dataset;
  source?: Source | null;
  /** PrismStatistics's own; other writers write []. */
  operations: unknown[];
  /** PrismStatistics's own; other writers write []. */
  results: unknown[];
  report?: unknown;
  data_settings?: unknown;
  profile?: string;
}

export interface Problem {
  /** The spec's rule number (section 8), such as "D3". */
  rule: string;
  /** Where in project.json, such as "$.dataset.variables[2].name". */
  path: string;
  message: string;
}

export declare class PstatError extends Error {
  rule: string;
  constructor(rule: string, message: string);
}

/** One answer that earns a question's points, or the rule for a set of versions (PSTAT-1 section 7.2). */
export interface KeyEntry {
  versions?: number[];
  correct: string[];
  points: number;
  adjustment: "none" | "dropped" | "credit_all";
  partial_credit: boolean;
}

/** A question in assessment.json (PSTAT-1 section 7.2). */
export interface AssessmentQuestion {
  number: number;
  bank_id: string;
  revision: number;
  points_variable: number | null;
  answer_variable: number | null;
  type: "multiple_choice" | "select_all" | "true_false" | "other";
  options: string[];
  option_ids: string[];
  option_labels: { A: "True"; B: "False" } | null;
  key: KeyEntry[];
  details: { objective: string | null; chapter: string | null; section: string | null; page: string | null; bloom: string | null; difficulty: "easy" | "medium" | "hard" | null; tags: string[] };
}

/** The part of the OpenAssess item results 2 profile. */
export interface Assessment {
  part: "OpenAssess assessment";
  version: 1;
  test: { id: string; name: string; given: string | null; source: "scanned sheets" | "learning system report"; versions: string[]; questions: number; sheets_left_out: number };
  questions: AssessmentQuestion[];
}

/** The part of the PrismQDA case table 1 profile (PSTAT-1 section 7.3). */
export interface CaseTablePart {
  part: "PrismQDA case table";
  version: 1;
  project: { name: string; id: string };
  exported: string;
  codebook_version: number | null;
  sub_codes_counted: boolean;
  case_id_variable: number;
  case_name_variable: number | null;
  attributes: Array<{ variable: number; attribute_id: number; name: string; level: "nominal" | "ordinal" | "interval" | "ratio" | "date" | "text" }>;
  codes: Array<{ code_id: number; path: string[]; kind: "code" | "theme"; present_variable: number; count_variable: number }>;
}

export declare const PROFILE_ITEM_RESULTS: "OpenAssess item results 1";
export declare const PROFILE_ITEM_RESULTS_2: "OpenAssess item results 2";
export declare const PROFILE_CASE_TABLE: "PrismQDA case table 1";
/** Each profile's part: its entry's name, its `part` member and its version. */
export declare const PARTS: Record<string, { entry: string; part: string; version: number }>;

export declare function validName(name: unknown): boolean;
export declare function parseJson(text: string): { value: unknown; fractional: Set<string> };
export declare function checkProject(project: unknown, options?: { as?: "writer" | "reader"; fractional?: Set<string>; part?: unknown; partFractional?: Set<string> }): Problem[];
export declare function readPstat(bytes: Uint8Array): Project;
/** The part of the profile the file follows, parsed; null when it has none. */
export declare function readPart(bytes: Uint8Array, project?: Project): Assessment | CaseTablePart | null;
/** The file's bytes: project.json, then the profile's part when given. */
export declare function writePstat(project: Project, part?: Assessment | CaseTablePart): Uint8Array;
export declare function checkPstat(bytes: Uint8Array): Problem[];
/** The points an answer earns under a key entry; null for a dropped entry, undefined for type other. */
export declare function pointsFor(question: { type: string }, entry: KeyEntry, answer: string | null): number | null | undefined;
/** The key entry that applies to version number v. */
export declare function entryFor(question: AssessmentQuestion, v: number): KeyEntry | undefined;
/** Whether a string is an answer cell: capital letters in alphabetical order, each once, or "". */
export declare function isAnswer(s: unknown): boolean;
/** The variable name made from a case attribute's name (section 7.3). */
export declare function attributeName(name: string): string;
/** The variable names of a case table's attributes, in order, made distinct. */
export declare function attributeNames(names: string[], taken?: string[]): string[];
