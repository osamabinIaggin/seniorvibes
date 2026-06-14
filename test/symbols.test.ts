import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidateIdentifiers, extractSignatureFromHover } from '../src/symbols.ts';

test('extractCandidateIdentifiers — picks PascalCase and camelCase', () => {
  const got = extractCandidateIdentifiers(
    'validate body with InviteDto, call this.inviteService.send(), throw ConflictException',
  );
  assert.ok(got.includes('InviteDto'));
  assert.ok(got.includes('inviteService'));
  assert.ok(got.includes('ConflictException'));
});

test('extractCandidateIdentifiers — ignores plain English words', () => {
  const got = extractCandidateIdentifiers('throw a not found error if the user is null');
  assert.deepEqual(got, []);
});

test('extractCandidateIdentifiers — backticks force extraction regardless of case', () => {
  const got = extractCandidateIdentifiers('implement `add` using `mathUtils`');
  assert.ok(got.includes('add'));
  assert.ok(got.includes('mathUtils'));
});

test('extractCandidateIdentifiers — skips builtins and short tokens', () => {
  const got = extractCandidateIdentifiers('return a Promise of Array, parse with JSON');
  assert.deepEqual(got, []);
});

test('extractCandidateIdentifiers — dotted chains yield each mixed-case segment', () => {
  const got = extractCandidateIdentifiers('call this.users.findOne to get the record');
  assert.ok(got.includes('findOne'));
  assert.ok(!got.includes('users')); // plain lowercase, not extracted
});

test('extractSignatureFromHover — pulls the fenced code block', () => {
  const md = '```typescript\nfunction findOne(id: string): Promise<User | null>\n```\n\nGets a user.';
  assert.equal(
    extractSignatureFromHover(md),
    'function findOne(id: string): Promise<User | null>',
  );
});

test('extractSignatureFromHover — falls back to first non-empty line when unfenced', () => {
  assert.equal(extractSignatureFromHover('class InviteDto\n\nA data transfer object'), 'class InviteDto');
});

test('extractSignatureFromHover — caps multi-line signatures', () => {
  const md = '```ts\nline1\nline2\nline3\nline4\nline5\n```';
  assert.equal(extractSignatureFromHover(md), 'line1\nline2\nline3\nline4');
});

test('extractSignatureFromHover — empty hover yields undefined', () => {
  assert.equal(extractSignatureFromHover(''), undefined);
});
