// Types for @openstage/pstat. The shapes follow specs/pstat/PSTAT-1.md.

export declare const EXTENSION: "pstat";
export declare const FORMAT: "PrismStatistics project";
export declare const VERSION: 1;
export declare const SPEC_REVISION: string;
export declare const ENTRY: "project.json";
export declare const PROFILE_ITEM_RESULTS: "OpenAssess item results 1";
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

export declare function validName(name: unknown): boolean;
export declare function parseJson(text: string): { value: unknown; fractional: Set<string> };
export declare function checkProject(project: unknown, options?: { as?: "writer" | "reader"; fractional?: Set<string> }): Problem[];
export declare function readPstat(bytes: Uint8Array): Project;
export declare function writePstat(project: Project): Uint8Array;
export declare function checkPstat(bytes: Uint8Array): Problem[];
