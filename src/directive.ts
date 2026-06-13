/**
 * Directive parsing — the heart of seniorvibes. Pure module: no `vscode` import,
 * so it can be unit-tested in isolation. Grammar is locked in SPEC.md §2.
 */

export interface Directive {
  /** Zero-based line number of the directive. */
  readonly lineNumber: number;
  /** Leading whitespace of the line; generated code aligns to this. */
  readonly indent: string;
  /** Everything on the line before the sentinel; captured and NEVER modified. */
  readonly before: string;
  /** The trimmed instruction text after the sentinel. */
  readonly text: string;
}

/** Escapes a string for safe literal use inside a RegExp (the default `$#` needs this). */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the directive matcher for a (possibly user-customised) sentinel.
 *   ^(?<before>.*?)<S>[ \t]+(?<directive>.*\S)[ \t]*$
 * `before` is lazy, so the FIRST sentinel followed by whitespace+content wins.
 */
export function buildDirectiveRegex(sentinel: string): RegExp {
  const s = escapeRegExp(sentinel);
  return new RegExp(`^(?<before>.*?)${s}[ \\t]+(?<directive>.*\\S)[ \\t]*$`);
}

/**
 * Parses a single line into a Directive, or null if the line is not a directive.
 * @param lineText   raw text of the line (no trailing newline)
 * @param lineNumber zero-based line number
 * @param sentinel   the configured trigger token
 */
export function parseDirective(
  lineText: string,
  lineNumber: number,
  sentinel: string,
): Directive | null {
  if (sentinel.length === 0) {
    return null;
  }
  const match = buildDirectiveRegex(sentinel).exec(lineText);
  if (!match?.groups) {
    return null;
  }
  const text = match.groups.directive.trim();
  if (text.length === 0) {
    return null;
  }
  const indent = /^[ \t]*/.exec(lineText)?.[0] ?? '';
  return {
    lineNumber,
    indent,
    before: match.groups.before,
    text,
  };
}
