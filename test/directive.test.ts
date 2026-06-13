import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, collectDirectiveBlock } from '../src/directive.ts';

const SENT = '$#';

/** Convenience: parse with the default sentinel on line 0. */
function p(line: string, sentinel = SENT) {
  return parseLine(line, 0, sentinel);
}

test('parseLine — line-start directive', () => {
  assert.deepEqual(p('$# add a function'), {
    lineNumber: 0,
    indent: '',
    before: '',
    texts: ['add a function'],
  });
});

test('parseLine — indented directive captures indent and before', () => {
  const d = p('    $# do x');
  assert.equal(d?.indent, '    ');
  assert.equal(d?.before, '    ');
  assert.deepEqual(d?.texts, ['do x']);
});

test('parseLine — inline after code leaves code in `before`, untouched', () => {
  const d = p('const x = 1;  $# add a null check');
  assert.equal(d?.before, 'const x = 1;  ');
  assert.deepEqual(d?.texts, ['add a null check']);
  assert.equal(d?.indent, '');
});

test('parseLine — multiple sentinels on one line split into multiple directives', () => {
  // The exact case that was previously losing data.
  assert.deepEqual(p('$# hello $# world $# create')?.texts, ['hello', 'world', 'create']);
});

test('parseLine — multiple directives inline after code', () => {
  const d = p('code();  $# add null check $# nfkw');
  assert.equal(d?.before, 'code();  ');
  assert.deepEqual(d?.texts, ['add null check', 'nfkw']);
});

test('parseLine — plain non-directive line is null', () => {
  assert.equal(p('const x = 1;'), null);
});

test('parseLine — a bare `#` does not match the `$#` sentinel', () => {
  assert.equal(p('# just a comment'), null);
});

test('parseLine — empty directive (only whitespace after sentinel) is null', () => {
  assert.equal(p('$#   '), null);
});

test('parseLine — sentinel with no following whitespace is not a trigger', () => {
  assert.equal(p('$#foo'), null);
});

test('parseLine — trailing empty directive is dropped', () => {
  assert.deepEqual(p('$# a $# ')?.texts, ['a']);
});

test('parseLine — single-character directive is allowed', () => {
  assert.deepEqual(p('$# x')?.texts, ['x']);
});

test('parseLine — trailing whitespace trimmed, internal whitespace preserved', () => {
  assert.deepEqual(p('$# foo   bar   ')?.texts, ['foo   bar']);
});

test('parseLine — a glued `$#` (no following space) stays literal in `before`', () => {
  const d = p('foo$#bar $# baz');
  assert.equal(d?.before, 'foo$#bar ');
  assert.deepEqual(d?.texts, ['baz']);
});

test('parseLine — trailing block-comment close is stripped', () => {
  assert.deepEqual(p('  /* $# refactor this loop to use reduce */')?.texts, [
    'refactor this loop to use reduce',
  ]);
});

test('parseLine — trailing HTML comment close is stripped', () => {
  assert.deepEqual(p('<!-- $# add a viewport meta tag -->')?.texts, ['add a viewport meta tag']);
});

test('parseLine — a block comment with no instruction is not a directive', () => {
  assert.equal(p('/* $# */'), null);
});

test('parseLine — multiple directives inside one block comment, closer stripped', () => {
  assert.deepEqual(p('/* $# do a $# do b */')?.texts, ['do a', 'do b']);
});

test('parseLine — realistic inline directive keeps preceding code in `before`', () => {
  const d = p('    const u = await repo.find(id);  $# throw NotFoundException if null');
  assert.equal(d?.before, '    const u = await repo.find(id);  ');
  assert.deepEqual(d?.texts, ['throw NotFoundException if null']);
});

test('parseLine — prompt with regex/JSON/$ does not falsely split', () => {
  assert.deepEqual(p('$# return /^[a-z]+$/ or { cost: "$5" }')?.texts, [
    'return /^[a-z]+$/ or { cost: "$5" }',
  ]);
});

test('parseLine — KNOWN LIMITATION: a $# inside a string literal still triggers (Phase 6 fix)', () => {
  // Documents current behavior so we notice if/when tokenization changes it.
  assert.deepEqual(p('logger.info("price is $# 5 dollars");')?.texts, ['5 dollars");']);
});

test('parseLine — custom sentinel', () => {
  assert.deepEqual(parseLine('  //ai do thing', 0, '//ai')?.texts, ['do thing']);
});

test('parseLine — custom sentinel with regex-special chars is escaped', () => {
  assert.deepEqual(parseLine('x >> go now', 0, '>>')?.texts, ['go now']);
});

test('parseLine — empty sentinel never matches', () => {
  assert.equal(parseLine('$# foo', 0, ''), null);
});

// --- block collection --------------------------------------------------------

/** Build a getLineText over an array of lines. */
function lines(arr: string[]) {
  return { get: (n: number) => arr[n], count: arr.length };
}

test('collectDirectiveBlock — single directive', () => {
  const { get, count } = lines(['$# a', 'code']);
  const b = collectDirectiveBlock(get, count, 0, SENT);
  assert.equal(b?.startLine, 0);
  assert.equal(b?.endLine, 0);
  assert.deepEqual(b?.texts, ['a']);
});

test('collectDirectiveBlock — three adjacent lines, anchored in the middle', () => {
  const { get, count } = lines(['$# a', '$# b', '$# c']);
  const b = collectDirectiveBlock(get, count, 1, SENT);
  assert.equal(b?.startLine, 0);
  assert.equal(b?.endLine, 2);
  assert.deepEqual(b?.texts, ['a', 'b', 'c']);
});

test('collectDirectiveBlock — flattens multiple directives per line', () => {
  const { get, count } = lines(['$# a $# b', '$# c']);
  const b = collectDirectiveBlock(get, count, 0, SENT);
  assert.equal(b?.startLine, 0);
  assert.equal(b?.endLine, 1);
  assert.deepEqual(b?.texts, ['a', 'b', 'c']);
});

test('collectDirectiveBlock — a non-directive line breaks the block', () => {
  const { get, count } = lines(['$# a', 'normal', '$# b']);
  assert.deepEqual(collectDirectiveBlock(get, count, 0, SENT)?.texts, ['a']);
  assert.deepEqual(collectDirectiveBlock(get, count, 2, SENT)?.texts, ['b']);
});

test('collectDirectiveBlock — anchor on a non-directive line is null', () => {
  const { get, count } = lines(['code only']);
  assert.equal(collectDirectiveBlock(get, count, 0, SENT), null);
});

test('collectDirectiveBlock — block at the last line (boundary)', () => {
  const { get, count } = lines(['code', '$# a']);
  const b = collectDirectiveBlock(get, count, 1, SENT);
  assert.equal(b?.startLine, 1);
  assert.equal(b?.endLine, 1);
});

test('collectDirectiveBlock — indent comes from the first directive line', () => {
  const { get, count } = lines(['  $# a', '    $# b']);
  assert.equal(collectDirectiveBlock(get, count, 1, SENT)?.indent, '  ');
});
