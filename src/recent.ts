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
