/**
 * Pure helpers for LSP grounding — no `vscode`, so they are unit-testable.
 *
 * `extractCandidateIdentifiers` pulls symbol-like names out of a directive (the things a
 * senior would name: `NotFoundException`, `inviteService`, `findOne`). `extractSignatureFromHover`
 * pulls the type signature out of a language-server hover's markdown.
 */

// Built-ins we never need to ground (they'd add noise and won't resolve to project symbols).
const BUILTINS = new Set([
  'Promise', 'Array', 'String', 'Number', 'Boolean', 'Object', 'Date', 'Map', 'Set',
  'JSON', 'Math', 'RegExp', 'Error', 'Record', 'Partial', 'Readonly', 'Awaited',
]);

/**
 * Extracts symbol-like identifiers from directive text: PascalCase and camelCase tokens
 * (which are unlikely to be plain English) plus anything explicitly backtick-quoted.
 * Plain lowercase words are ignored unless backticked, since they're indistinguishable
 * from prose.
 */
export function extractCandidateIdentifiers(text: string): string[] {
  const out = new Set<string>();

  // Explicit backtick-quoted symbols, any case.
  for (const m of text.matchAll(/`([A-Za-z_$][\w$]*)`/g)) {
    if (m[1].length >= 2 && !BUILTINS.has(m[1])) {
      out.add(m[1]);
    }
  }

  // Mixed-case identifiers (Pascal/camel), including dotted-chain segments.
  for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const tok = m[0];
    if (tok.length < 3 || BUILTINS.has(tok)) {
      continue;
    }
    const hasLower = /[a-z]/.test(tok);
    const isPascal = /^[A-Z]/.test(tok) && hasLower;
    const isCamel = /^[a-z]/.test(tok) && /[A-Z]/.test(tok);
    if (isPascal || isCamel) {
      out.add(tok);
    }
  }

  return [...out];
}

/**
 * Extracts a concise type signature from a hover's markdown. Prefers the first fenced
 * code block (where TS/JS servers put the signature); otherwise the first non-empty line.
 * Caps the result to a few lines so a giant hover doesn't bloat the prompt.
 */
export function extractSignatureFromHover(markdown: string): string | undefined {
  const fence = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(markdown);
  const body = (fence ? fence[1] : markdown).trim();
  if (body.length === 0) {
    return undefined;
  }
  const lines = body
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return undefined;
  }
  // A fenced block is the full signature (cap to a few lines); unfenced prose: lead line only.
  return fence ? lines.slice(0, 4).join('\n') : lines[0];
}
