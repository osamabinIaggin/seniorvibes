import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commentStyle,
  hashDirectives,
  wrapGenerated,
  findExistingBlock,
} from '../src/fence.ts';
import { stripCodeFences, reindent, shapeOutput } from '../src/output.ts';
import { assemblePrompt } from '../src/prompt.ts';

// --- fence / comment style ---------------------------------------------------

test('commentStyle — line-comment languages', () => {
  assert.deepEqual(commentStyle('typescript'), { prefix: '//', suffix: '' });
  assert.deepEqual(commentStyle('python'), { prefix: '#', suffix: '' });
  assert.deepEqual(commentStyle('sql'), { prefix: '--', suffix: '' });
  assert.deepEqual(commentStyle('unknown-lang'), { prefix: '//', suffix: '' });
});

test('commentStyle — block-only languages', () => {
  assert.deepEqual(commentStyle('html'), { prefix: '<!--', suffix: '-->' });
  assert.deepEqual(commentStyle('css'), { prefix: '/*', suffix: '*/' });
});

test('hashDirectives — deterministic and input-sensitive', () => {
  assert.equal(hashDirectives(['a', 'b']), hashDirectives(['a', 'b']));
  assert.notEqual(hashDirectives(['a', 'b']), hashDirectives(['a', 'c']));
});

test('wrapGenerated — line comment fences', () => {
  const out = wrapGenerated('  ', 'typescript', 'abc', 'const x = 1;');
  assert.equal(out, '  // seniorvibes:begin abc\nconst x = 1;\n  // seniorvibes:end abc');
});

test('wrapGenerated — block comment fences (html)', () => {
  const out = wrapGenerated('', 'html', 'xyz', '<p></p>');
  assert.equal(out, '<!-- seniorvibes:begin xyz -->\n<p></p>\n<!-- seniorvibes:end xyz -->');
});

test('findExistingBlock — detects a prior block directly below', () => {
  const lines = [
    '$# do x',
    '// seniorvibes:begin abc',
    'const x = 1;',
    '// seniorvibes:end abc',
    'after',
  ];
  const b = findExistingBlock((n) => lines[n], lines.length, 1);
  assert.deepEqual(b, { beginLine: 1, endLine: 3 });
});

test('findExistingBlock — null when the start line is not a begin marker', () => {
  const lines = ['$# do x', 'const x = 1;'];
  assert.equal(findExistingBlock((n) => lines[n], lines.length, 1), null);
});

test('findExistingBlock — null when begin has no matching end', () => {
  const lines = ['// seniorvibes:begin abc', 'const x = 1;'];
  assert.equal(findExistingBlock((n) => lines[n], lines.length, 0), null);
});

// --- output sanitization -----------------------------------------------------

test('stripCodeFences — removes a fenced block with language tag', () => {
  assert.equal(stripCodeFences('```typescript\nconst x = 1;\n```'), 'const x = 1;');
});

test('stripCodeFences — removes a ~~~ fence', () => {
  assert.equal(stripCodeFences('~~~\nfoo\n~~~'), 'foo');
});

test('stripCodeFences — leaves un-fenced output untouched', () => {
  assert.equal(stripCodeFences('const x = 1;\nconst y = 2;'), 'const x = 1;\nconst y = 2;');
});

test('reindent — dedents then applies target indent, preserving relative indent', () => {
  const input = '  function f() {\n    return 1;\n  }';
  assert.equal(reindent(input, '    '), '    function f() {\n      return 1;\n    }');
});

test('reindent — blank lines stay blank, leading/trailing blanks dropped', () => {
  assert.equal(reindent('\na\n\nb\n', '  '), '  a\n\n  b');
});

test('shapeOutput — strips fences and re-indents in one pass', () => {
  assert.equal(shapeOutput('```ts\nif (x) {\n  y();\n}\n```', '  '), '  if (x) {\n    y();\n  }');
});

// --- prompt assembly ---------------------------------------------------------

test('assemblePrompt — system pins the language and forbids fences/prose', () => {
  const { system } = assemblePrompt({
    languageId: 'python',
    filePath: 'app/main.py',
    directives: ['add a healthcheck'],
    contextAbove: [],
    contextBelow: [],
  });
  assert.match(system, /ONLY raw python code/);
  assert.match(system, /Do NOT wrap it in markdown code fences/);
});

test('assemblePrompt — user carries file, directives and present context', () => {
  const { user } = assemblePrompt({
    languageId: 'typescript',
    filePath: 'src/x.ts',
    directives: ['do a', 'do b'],
    contextAbove: ['class X {'],
    contextBelow: ['}'],
  });
  assert.match(user, /File: src\/x\.ts \(language: typescript\)/);
  assert.match(user, /- do a\n- do b/);
  assert.match(user, /code above the insertion point/);
  assert.match(user, /code below the insertion point/);
});

test('assemblePrompt — omits empty context sections and includes project prompt', () => {
  const { system, user } = assemblePrompt({
    languageId: 'go',
    filePath: 'main.go',
    directives: ['x'],
    contextAbove: [],
    contextBelow: [],
    projectPrompt: 'Always return wrapped errors.',
  });
  assert.doesNotMatch(user, /code above the insertion point/);
  assert.match(system, /Always return wrapped errors\./);
});
