import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findReplaceableBlock, locateBlock } from '../src/recent.ts';

function lines(arr: string[]) {
  return { get: (n: number) => arr[n], count: arr.length };
}

test('findReplaceableBlock — matches a remembered block verbatim below the directive', () => {
  const arr = ['$# do x', 'function f() {', '  return 1;', '}', 'after'];
  const known = ['function f() {\n  return 1;\n}'];
  const b = findReplaceableBlock(lines(arr).get, arr.length, 1, known);
  assert.deepEqual(b, { startLine: 1, endLine: 3, text: known[0] });
});

test('findReplaceableBlock — null when the block was edited (no verbatim match)', () => {
  const arr = ['$# do x', 'function f() {', '  return 2;', '}'];
  const known = ['function f() {\n  return 1;\n}'];
  assert.equal(findReplaceableBlock(lines(arr).get, arr.length, 1, known), null);
});

test('findReplaceableBlock — null when nothing is remembered (e.g. after reload)', () => {
  const arr = ['$# do x', 'function f() {}'];
  assert.equal(findReplaceableBlock(lines(arr).get, arr.length, 1, []), null);
});

test('findReplaceableBlock — single-line block', () => {
  const arr = ['$# do x', 'const x = 1;'];
  const b = findReplaceableBlock(lines(arr).get, arr.length, 1, ['const x = 1;']);
  assert.deepEqual(b, { startLine: 1, endLine: 1, text: 'const x = 1;' });
});

test('findReplaceableBlock — does not match past the end of the document', () => {
  const arr = ['$# do x', 'a'];
  assert.equal(findReplaceableBlock(lines(arr).get, arr.length, 1, ['a\nb\nc']), null);
});

test('locateBlock — finds the directive at its guessed line', () => {
  const arr = ['x', '$# do a', '$# do b', 'code'];
  const b = locateBlock(lines(arr).get, arr.length, 1, ['$# do a', '$# do b']);
  assert.deepEqual(b, { startLine: 1, endLine: 2, text: '$# do a\n$# do b' });
});

test('locateBlock — finds the directive after it shifted down', () => {
  const arr = ['new', 'lines', 'added', '$# do a', 'code'];
  // guess was line 1, but content moved to line 3
  const b = locateBlock(lines(arr).get, arr.length, 1, ['$# do a']);
  assert.equal(b?.startLine, 3);
});

test('locateBlock — null when the directive text no longer matches', () => {
  const arr = ['$# do a EDITED', 'code'];
  assert.equal(locateBlock(lines(arr).get, arr.length, 0, ['$# do a']), null);
});

test('locateBlock — respects the search window', () => {
  const arr = Array.from({ length: 200 }, (_, i) => (i === 150 ? '$# far' : `line ${i}`));
  assert.equal(locateBlock((n) => arr[n], arr.length, 0, ['$# far'], 50), null);
  assert.equal(locateBlock((n) => arr[n], arr.length, 150, ['$# far'], 50)?.startLine, 150);
});
