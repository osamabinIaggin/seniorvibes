import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAlpha } from '../src/color.ts';

test('withAlpha — 6-digit hex to rgba', () => {
  assert.equal(withAlpha('#3fb950', 0.5), 'rgba(63, 185, 80, 0.5)');
});

test('withAlpha — 3-digit hex expands', () => {
  assert.equal(withAlpha('#fff', 1), 'rgba(255, 255, 255, 1)');
});

test('withAlpha — rgb/rgba input gets its alpha replaced', () => {
  assert.equal(withAlpha('rgba(63,185,80,0.18)', 0), 'rgba(63, 185, 80, 0)');
  assert.equal(withAlpha('rgb(1, 2, 3)', 0.25), 'rgba(1, 2, 3, 0.25)');
});

test('withAlpha — alpha is clamped to [0,1]', () => {
  assert.equal(withAlpha('#000000', 2), 'rgba(0, 0, 0, 1)');
  assert.equal(withAlpha('#000000', -1), 'rgba(0, 0, 0, 0)');
});

test('withAlpha — named/unknown colors are returned unchanged', () => {
  assert.equal(withAlpha('rebeccapurple', 0.5), 'rebeccapurple');
});
