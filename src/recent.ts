/**
 * Marker-less replace tracking. Instead of leaving fence comments in the buffer, the
 * extension remembers the exact text it generated. On re-run it looks at the lines
 * directly below the directive block and, if they match a remembered block verbatim,
 * replaces them. Any mismatch (the user edited the block, a reformat ran, or the state
 * was lost on reload) falls back to a fresh insert — never a destructive overwrite.
 *
 * Pure module — no `vscode` — so it is unit-testable.
 */

export interface ReplaceableBlock {
  /** First line of the matched block (zero-based). */
  readonly startLine: number;
  /** Last line of the matched block (zero-based). */
  readonly endLine: number;
  /** The remembered text that matched. */
  readonly text: string;
}

/**
 * Finds a remembered generated block that sits verbatim at `startLine`, or null.
 * @param known previously generated texts for this document
 */
export function findReplaceableBlock(
  getLineText: (lineNumber: number) => string,
  lineCount: number,
  startLine: number,
  known: Iterable<string>,
): ReplaceableBlock | null {
  for (const text of known) {
    const lines = text.split('\n');
    if (startLine + lines.length > lineCount) {
      continue;
    }
    let matches = true;
    for (let i = 0; i < lines.length; i++) {
      if (getLineText(startLine + i) !== lines[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { startLine, endLine: startLine + lines.length - 1, text };
    }
  }
  return null;
}

/**
 * Searches a window of lines around `guessLine` for a contiguous run matching `texts`
 * verbatim. Used to re-locate the directive line(s) before auto-removal, so a line shift
 * during the delay never causes the wrong lines to be deleted.
 */
export function locateBlock(
  getLineText: (lineNumber: number) => string,
  lineCount: number,
  guessLine: number,
  texts: readonly string[],
  window = 50,
): ReplaceableBlock | null {
  if (texts.length === 0) {
    return null;
  }
  const from = Math.max(0, guessLine - window);
  const to = Math.min(lineCount - texts.length, guessLine + window);
  for (let start = from; start <= to; start++) {
    let matches = true;
    for (let i = 0; i < texts.length; i++) {
      if (getLineText(start + i) !== texts[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { startLine: start, endLine: start + texts.length - 1, text: texts.join('\n') };
    }
  }
  return null;
}
