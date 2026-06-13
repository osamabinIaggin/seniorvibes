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

/** Convenience: strip fences then re-indent in one step. */
export function shapeOutput(text: string, indent: string): string {
  return reindent(stripCodeFences(text), indent);
}
