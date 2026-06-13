import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectiveCleanupMachine, type CleanupHost } from '../src/cleanup.ts';

class FakeHost implements CleanupHost {
  readonly log: string[] = [];
  setTimer(): void {
    this.log.push('set');
  }
  clearTimer(): void {
    this.log.push('clear');
  }
  delete(): void {
    this.log.push('delete');
  }
}

test('start on the directive pauses (no timer)', () => {
  const host = new FakeHost();
  new DirectiveCleanupMachine(host).start(true);
  assert.deepEqual(host.log, ['clear']);
});

test('start off the directive arms the timer', () => {
  const host = new FakeHost();
  new DirectiveCleanupMachine(host).start(false);
  assert.deepEqual(host.log, ['set']);
});

test('leaving the directive resets the countdown', () => {
  const host = new FakeHost();
  const m = new DirectiveCleanupMachine(host);
  m.start(true); // on directive: ['clear']
  m.cursorMoved(false); // left -> reset
  assert.deepEqual(host.log, ['clear', 'set']);
});

test('moving around while already off the directive does NOT restart the timer', () => {
  const host = new FakeHost();
  const m = new DirectiveCleanupMachine(host);
  m.start(false); // ['set']
  m.cursorMoved(false); // still off -> nothing
  m.cursorMoved(false); // still off -> nothing
  assert.deepEqual(host.log, ['set']);
});

test('returning to the directive pauses again, leaving resets again', () => {
  const host = new FakeHost();
  const m = new DirectiveCleanupMachine(host);
  m.start(true); // ['clear']
  m.cursorMoved(false); // left -> ['set']
  m.cursorMoved(true); // back on -> ['clear']
  m.cursorMoved(false); // left again -> ['set']
  assert.deepEqual(host.log, ['clear', 'set', 'clear', 'set']);
});

test('timer firing off the directive deletes; on the directive does nothing', () => {
  const host = new FakeHost();
  const m = new DirectiveCleanupMachine(host);
  m.start(false); // ['set']
  m.timerFired(true); // on directive -> no delete
  assert.deepEqual(host.log, ['set']);
  m.timerFired(false); // off -> delete
  assert.deepEqual(host.log, ['set', 'delete']);
});
