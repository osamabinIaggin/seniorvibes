/**
 * Post-processing of model output before insertion. Pure module — no `vscode`.
 * Two jobs: defensively strip markdown code fences the model may add despite
 * instructions, and re-indent the code to the directive's indentation.
 */

/**
 * Removes a single surrounding markdown code fence (``` or ~~~, with optional language
 * tag) if the output is wrapped in one. Leaves un-fenced output untouched.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.replace(/^\n+/, '').replace(/\n+$/, '');
  const lines = trimmed.split('\n');
  if (lines.length < 2) {
    return text.trim();
  }
  const fence = /^\s*(`{3,}|~{3,})/;
  const firstIsFence = fence.test(lines[0]);
  const lastIsFence = fence.test(lines[lines.length - 1]);
  if (firstIsFence && lastIsFence) {
    return lines.slice(1, -1).join('\n');
  }
  return trimmed;
}

/** Counts the leading whitespace characters of a line. */
function leadingWhitespaceLength(line: string): number {
  return (/^[ \t]*/.exec(line)?.[0] ?? '').length;
}

/**
 * Re-indents a block of code to `indent`: removes the code's own common leading
 * whitespace (dedent), then prefixes every non-empty line with `indent`. Empty lines
 * stay empty. Leading/trailing blank lines are dropped.
 */
export function reindent(code: string, indent: string): string {
  const lines = code.replace(/^\n+/, '').replace(/\n+$/, '').split('\n');
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return '';
  }
  const base = Math.min(...nonEmpty.map(leadingWhitespaceLength));
  return lines
    .map((line) => (line.trim().length === 0 ? '' : indent + line.slice(base)))
    .join('\n');
}

/**
 * Removes leading/trailing generated lines that merely duplicate the adjacent context
 * (compared by trimmed content, so indentation differences don't hide a duplicate).
 * Smaller models sometimes re-emit surrounding code despite instructions; this strips it
 * deterministically so insertion never duplicates existing lines.
 */
export function trimContextOverlap(
  code: string,
  contextAbove: readonly string[],
  contextBelow: readonly string[],
): string {
  const lines = code.split('\n');
  const eq = (a: string, b: string): boolean => a.trim() === b.trim();

  // Leading lines that repeat the tail of contextAbove.
  let lead = 0;
  for (let k = Math.min(lines.length, contextAbove.length); k >= 1; k--) {
    let match = true;
    for (let i = 0; i < k; i++) {
      if (!eq(lines[i], contextAbove[contextAbove.length - k + i])) {
        match = false;
        break;
      }
    }
    if (match) {
      lead = k;
      break;
    }
  }

  // Trailing lines that repeat the head of contextBelow.
  let trail = 0;
  const remaining = lines.length - lead;
  for (let k = Math.min(remaining, contextBelow.length); k >= 1; k--) {
    let match = true;
    for (let i = 0; i < k; i++) {
      if (!eq(lines[lines.length - k + i], contextBelow[i])) {
        match = false;
        break;
      }
    }
    if (match) {
      trail = k;
      break;
    }
  }

  return lines.slice(lead, lines.length - trail).join('\n');
}

/** Strip fences, trim context overlap, then re-indent in one step. */
export function shapeOutput(
  text: string,
  indent: string,
  contextAbove: readonly string[] = [],
  contextBelow: readonly string[] = [],
): string {
  const trimmed = trimContextOverlap(stripCodeFences(text), contextAbove, contextBelow);
  return reindent(trimmed, indent);
}
