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
  /** The instruction text after the sentinel (trimmed, cut at any second sentinel). */
  readonly text: string;
}

/** A maximal run of adjacent directive lines, generated together as one prompt. */
export interface DirectiveBlock {
  /** The directives, ordered top to bottom. */
  readonly directives: readonly Directive[];
  /** First directive line (zero-based). */
  readonly startLine: number;
  /** Last directive line (zero-based); generated code is inserted below this. */
  readonly endLine: number;
  /** Combined instruction text, one directive per line. */
  readonly text: string;
  /** Indent of the first directive line. */
  readonly indent: string;
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
 * A second occurrence of the sentinel on the same line terminates the directive;
 * anything after it on that line is ignored.
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
  // Cut at a second same-line sentinel (split takes the sentinel literally).
  const text = match.groups.directive.split(sentinel)[0].trim();
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

/**
 * From an anchor line, collect the maximal run of adjacent directive lines around it
 * (walking up and down), or null if the anchor line is not a directive.
 *
 * @param getLineText returns the raw text of a given zero-based line
 * @param lineCount   total number of lines in the document
 * @param anchorLine  the triggered line
 * @param sentinel    the configured trigger token
 */
export function collectDirectiveBlock(
  getLineText: (lineNumber: number) => string,
  lineCount: number,
  anchorLine: number,
  sentinel: string,
): DirectiveBlock | null {
  if (parseDirective(getLineText(anchorLine), anchorLine, sentinel) === null) {
    return null;
  }

  let startLine = anchorLine;
  while (startLine - 1 >= 0 && parseDirective(getLineText(startLine - 1), startLine - 1, sentinel)) {
    startLine--;
  }

  let endLine = anchorLine;
  while (
    endLine + 1 < lineCount &&
    parseDirective(getLineText(endLine + 1), endLine + 1, sentinel)
  ) {
    endLine++;
  }

  const directives: Directive[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const directive = parseDirective(getLineText(i), i, sentinel);
    if (directive) {
      directives.push(directive);
    }
  }

  return {
    directives,
    startLine,
    endLine,
    text: directives.map((d) => d.text).join('\n'),
    indent: directives[0].indent,
  };
}
