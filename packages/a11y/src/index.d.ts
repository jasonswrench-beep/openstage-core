// Types for @openstage/a11y (A11Y-1).

export type Status = "pass" | "fail" | "needs-review" | "not-tested" | "not-applicable";
export type Weight = "bold" | "normal" | "unknown";
export type Rgb = [number, number, number];
export type ColourInput = string | Rgb;

export interface Rule {
  id: string;
  kind: "machine" | "person";
  title: string;
  wcag: string[];
  basis: "requirement" | "practice";
  checks: Array<"source" | "html" | "epub" | "docx" | "pptx" | "pdf" | "vtt">;
  message: string;
  variants?: Record<string, string>;
  fix?: string;
}

export interface Catalogue {
  catalogue: "A11Y-1";
  revision: string;
  wcag: string;
  statuses: Array<{ id: Status; word: string; symbol: string }>;
  criteria: Record<string, { name: string; level: "A" | "AA" }>;
  rules: Rule[];
}

export interface Where {
  file?: string;
  id?: string;
  element?: string;
  line?: number;
  page?: number;
  slide?: number;
  object?: string;
  scheme?: "light" | "dark";
}

export interface Finding {
  rule: string;
  status: Status;
  wcag: string[];
  basis: string;
  variant?: string;
  where: Where;
  key: string;
  message: string;
  fix: string;
  params: Record<string, string>;
  count: number;
}

export interface RuleResult {
  rule: string;
  title: string;
  status: Status;
  wcag: string[];
  basis: string;
  checked: number;
  fail: number;
  needsReview: number;
  reason?: string;
}

export interface Summary {
  fail: number;
  needsReview: number;
  rulesFailed: number;
  rulesNeedReview: number;
  rulesPassed: number;
  rulesNotTested: number;
  rulesNotApplicable: number;
  checklist: number;
  ignored: number;
}

export interface Report {
  format?: string;
  revision?: string;
  summary: Summary;
  rules?: RuleResult[];
  findings: Finding[];
  checklist?: Array<{ rule: string; title: string; wcag: string[]; message: string }>;
  limits?: string[];
  blocking: string[];
}

export interface Settings {
  ignored: string[];
  ignoredFindings: string[];
  blockers: string[];
}

export interface TextContrast {
  ratio: number;
  minimum: number;
  large: boolean;
  status: "pass" | "fail" | "needs-review";
  variant?: "uncertain-bold";
}

export const CATALOGUE: Catalogue;
export const SPEC: "A11Y-1";
export const REVISION: string;
export const TEXT_MIN: 4.5;
export const LARGE_TEXT_MIN: 3;
export const GRAPHIC_MIN: 3;
export const SETTINGS_MEMBER: "accessibilityChecks";

export function rule(id: string): Rule | undefined;
export function statusWord(status: Status): string;
export function statusSymbol(status: Status): string;
export function fill(template: string, params?: Record<string, unknown>): string;
export function parseColor(text: ColourInput): { rgb: Rgb; alpha: number } | null;
export function hex(c: ColourInput): string;
export function luminance(c: ColourInput): number;
export function contrastRatio(a: ColourInput, b: ColourInput): number;
export function blend(top: ColourInput, under: ColourInput): string;
export function isLarge(sizePt: number, bold: boolean): boolean;
export function textContrast(foreground: ColourInput, background: ColourInput, options?: { sizePt?: number; sizePx?: number; weight?: Weight }): TextContrast;
export function graphicContrast(foreground: ColourInput, background: ColourInput): { ratio: number; minimum: number; status: "pass" | "fail" };
export function ratioWords(r: number): string;
export function minimumWords(m: number): string;
export function whereKey(where?: Where): string;
export function finding(ruleId: string, status: Status, where?: Where, params?: Record<string, unknown>, variant?: string): Finding;
export function summarize(findings: Finding[], options?: { format?: string; checked?: Record<string, number>; notTested?: Record<string, string> }): { rules: RuleResult[]; summary: Summary };
export function summaryLine(report: Pick<Report, "summary">, label: string): string;
export function readSettings(project: unknown): Settings;
export function hides(settings: Settings, f: Pick<Finding, "rule" | "key">): boolean;
export function blockingFindings(findings: Finding[], settings: Settings): Finding[];
export function applySettings<R extends Report>(report: R, settings: Settings): R;
