/**
 * Directive parsing — the heart of seniorvibes. Pure module: no `vscode` import,
 * so it can be unit-tested in isolation. Grammar is locked in SPEC.md §2.
 *
 * A sentinel is a directive boundary wherever it appears. A single line may carry
 * several directives (`$# a $# b $# c`); a sentinel only triggers when followed by
 * whitespace, so `$#glued` is treated as literal text, not a trigger.
 */

export interface LineParse {
  /** Zero-based line number. */
  readonly lineNumber: number;
  /** Leading whitespace of the line; generated code aligns to this. */
  readonly indent: string;
  /** Text before the FIRST sentinel on the line; captured and NEVER modified. */
  readonly before: string;
  /** Directive instruction texts on this line, in order (always ≥ 1). */
  readonly texts: readonly string[];
}

/** A maximal run of adjacent directive lines, generated together as one prompt. */
export interface DirectiveBlock {
  /** First directive line (zero-based). */
  readonly startLine: number;
  /** Last directive line (zero-based); generated code is inserted below this. */
  readonly endLine: number;
  /** Indent of the first directive line. */
  readonly indent: string;
  /** Every directive text across the block, in order. */
  readonly texts: readonly string[];
  /** The `before` code of each directive line (the code preceding the sentinel), in order. */
  readonly befores: readonly string[];
}

/** Escapes a string for safe literal use inside a RegExp (the default `$#` needs this). */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splitter for a (possibly user-customised) sentinel: matches the sentinel only when
 * it is followed by whitespace. Splitting a line on this yields `[before, ...directives]`.
 */
export function buildSplitRegex(sentinel: string): RegExp {
  return new RegExp(`${escapeRegExp(sentinel)}[ \\t]+`);
}

/**
 * Strips a trailing one-line comment closer (block-comment or HTML-comment end) so a
 * directive written inside such a comment doesn't carry the closer into the prompt.
 */
function stripTrailingCommentClose(text: string): string {
  return text.replace(/\s*(?:\*\/|-->)\s*$/, '').trimEnd();
}

/**
 * Parses a single line. Returns null if the line carries no directive; otherwise the
 * captured `before` text and one-or-more trimmed directive `texts`.
 *
 * Known limitation: a sentinel sitting inside a string literal still triggers (we do not
 * tokenize the line). Tracked for the Phase 6 tokenization work — see SPEC.md §2.
 */
export function parseLine(
  lineText: string,
  lineNumber: number,
  sentinel: string,
): LineParse | null {
  if (sentinel.length === 0) {
    return null;
  }
  const segments = lineText.split(buildSplitRegex(sentinel));
  if (segments.length < 2) {
    return null; // no `sentinel + whitespace` occurrence
  }
  const texts = segments
    .slice(1)
    .map((segment) => stripTrailingCommentClose(segment.trim()))
    .filter((segment) => segment.length > 0);
  if (texts.length === 0) {
    return null; // sentinel present but every directive was empty
  }
  const indent = /^[ \t]*/.exec(lineText)?.[0] ?? '';
  return {
    lineNumber,
    indent,
    before: segments[0],
    texts,
  };
}

/**
 * From an anchor line, collect the maximal run of adjacent directive lines around it
 * (walking up and down), flattening every directive across those lines into one block.
 * Returns null if the anchor line carries no directive.
 */
export function collectDirectiveBlock(
  getLineText: (lineNumber: number) => string,
  lineCount: number,
  anchorLine: number,
  sentinel: string,
): DirectiveBlock | null {
  if (parseLine(getLineText(anchorLine), anchorLine, sentinel) === null) {
    return null;
  }

  let startLine = anchorLine;
  while (startLine - 1 >= 0 && parseLine(getLineText(startLine - 1), startLine - 1, sentinel)) {
    startLine--;
  }

  let endLine = anchorLine;
  while (endLine + 1 < lineCount && parseLine(getLineText(endLine + 1), endLine + 1, sentinel)) {
    endLine++;
  }

  const texts: string[] = [];
  const befores: string[] = [];
  let indent = '';
  for (let i = startLine; i <= endLine; i++) {
    const parsed = parseLine(getLineText(i), i, sentinel);
    if (parsed) {
      if (i === startLine) {
        indent = parsed.indent;
      }
      texts.push(...parsed.texts);
      befores.push(parsed.before);
    }
  }

  return { startLine, endLine, indent, texts, befores };
}
