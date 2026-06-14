import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCodeFences, reindent, shapeOutput, trimContextOverlap } from '../src/output.ts';
import { assemblePrompt } from '../src/prompt.ts';

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

// --- context overlap trimming ------------------------------------------------

test('trimContextOverlap — strips trailing lines that duplicate context below', () => {
  const code = '    if (!user) {\n      throw new NotFoundException();\n    }\n    return user;\n  }\n}';
  // model re-emitted the method/class closing braces that are already in the file
  const out = trimContextOverlap(code, [], ['  }', '}']);
  assert.equal(out, '    if (!user) {\n      throw new NotFoundException();\n    }\n    return user;');
});

test('trimContextOverlap — strips leading lines that duplicate context above', () => {
  const code = 'const x = 1;\nconsole.log(x);';
  const out = trimContextOverlap(code, ['const x = 1;'], []);
  assert.equal(out, 'console.log(x);');
});

test('trimContextOverlap — compares by trimmed content (ignores indentation)', () => {
  const out = trimContextOverlap('        }', [], ['}']);
  assert.equal(out, '');
});

test('trimContextOverlap — leaves non-overlapping code untouched', () => {
  const code = 'return a + b;';
  assert.equal(trimContextOverlap(code, ['class X {'], ['}']), 'return a + b;');
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
  assert.match(system, /ONLY the new python code/);
  assert.match(system, /no markdown fences/);
  assert.match(system, /Do NOT repeat/);
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
  assert.match(user, /1\. do a\n2\. do b/);
  assert.match(user, /implement ALL 2/);
  assert.match(user, /--- context above/);
  assert.match(user, /--- context below/);
});

test('assemblePrompt — renders grounded symbols with their signatures', () => {
  const { user } = assemblePrompt({
    languageId: 'typescript',
    filePath: 'src/x.ts',
    directives: ['throw NotFoundException'],
    contextAbove: [],
    contextBelow: [],
    groundedSymbols: [
      { name: 'NotFoundException', signature: 'class NotFoundException extends HttpException', source: 'src/errors.ts' },
    ],
  });
  assert.match(user, /known symbols/);
  assert.match(user, /class NotFoundException extends HttpException/);
  assert.match(user, /from src\/errors\.ts/);
});

test('assemblePrompt — omits the known-symbols section when there are none', () => {
  const { user } = assemblePrompt({
    languageId: 'typescript',
    filePath: 'src/x.ts',
    directives: ['do a'],
    contextAbove: [],
    contextBelow: [],
  });
  assert.doesNotMatch(user, /known symbols/);
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
  assert.doesNotMatch(user, /--- context above/);
  assert.match(system, /Always return wrapped errors\./);
});
