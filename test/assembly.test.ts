import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCodeFences, reindent, shapeOutput } from '../src/output.ts';
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
