/**
 * Comment-fence markers that wrap generated code so a re-run replaces the previous
 * output instead of duplicating it. Pure module — no `vscode`. Locked in SPEC.md §3.
 */

export interface CommentStyle {
  /** Opening comment token, e.g. `//`, `#`, `<!--`. */
  readonly prefix: string;
  /** Closing token for block-only comment languages, e.g. `-->`; empty for line comments. */
  readonly suffix: string;
}

const BLOCK_ONLY: Record<string, CommentStyle> = {
  html: { prefix: '<!--', suffix: '-->' },
  xml: { prefix: '<!--', suffix: '-->' },
  markdown: { prefix: '<!--', suffix: '-->' },
  vue: { prefix: '<!--', suffix: '-->' },
  svelte: { prefix: '<!--', suffix: '-->' },
  css: { prefix: '/*', suffix: '*/' },
  scss: { prefix: '/*', suffix: '*/' },
  less: { prefix: '/*', suffix: '*/' },
};

const HASH_LANGS = new Set([
  'python', 'ruby', 'shellscript', 'bash', 'yaml', 'toml', 'dockerfile', 'makefile',
  'r', 'perl', 'powershell', 'elixir', 'coffeescript', 'ini', 'properties',
]);
const DASH_LANGS = new Set(['sql', 'lua', 'haskell', 'ada', 'plsql']);
const SEMI_LANGS = new Set(['clojure', 'lisp', 'scheme', 'commonlisp', 'racket']);

/** The comment style to use for fence markers in a given language. */
export function commentStyle(languageId: string): CommentStyle {
  if (languageId in BLOCK_ONLY) {
    return BLOCK_ONLY[languageId];
  }
  if (HASH_LANGS.has(languageId)) {
    return { prefix: '#', suffix: '' };
  }
  if (DASH_LANGS.has(languageId)) {
    return { prefix: '--', suffix: '' };
  }
  if (SEMI_LANGS.has(languageId)) {
    return { prefix: ';', suffix: '' };
  }
  return { prefix: '//', suffix: '' };
}

const BEGIN = 'seniorvibes:begin';
const END = 'seniorvibes:end';

/** A short, stable hash of the directive texts (FNV-1a, base36). */
export function hashDirectives(texts: readonly string[]): string {
  const input = texts.join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function marker(indent: string, style: CommentStyle, kind: string, hash: string): string {
  const body = `${kind} ${hash}`;
  return style.suffix
    ? `${indent}${style.prefix} ${body} ${style.suffix}`
    : `${indent}${style.prefix} ${body}`;
}

/** Wraps already-indented generated code in begin/end fence markers. */
export function wrapGenerated(
  indent: string,
  languageId: string,
  hash: string,
  code: string,
): string {
  const style = commentStyle(languageId);
  return [marker(indent, style, BEGIN, hash), code, marker(indent, style, END, hash)].join('\n');
}

export interface ExistingBlock {
  /** Line of the begin marker (zero-based). */
  readonly beginLine: number;
  /** Line of the end marker (zero-based). */
  readonly endLine: number;
}

/**
 * Detects a previously generated fence block whose begin marker sits on `startLine`
 * (the line immediately below a directive block). Returns its line range, or null.
 * Matches any seniorvibes block regardless of hash, so an edited directive still replaces.
 */
export function findExistingBlock(
  getLineText: (lineNumber: number) => string,
  lineCount: number,
  startLine: number,
): ExistingBlock | null {
  if (startLine >= lineCount || !getLineText(startLine).includes(BEGIN)) {
    return null;
  }
  for (let i = startLine + 1; i < lineCount; i++) {
    if (getLineText(i).includes(END)) {
      return { beginLine: startLine, endLine: i };
    }
  }
  return null;
}
