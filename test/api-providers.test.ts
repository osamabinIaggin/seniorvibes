import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenAiLine, OpenAiProvider } from '../src/openai.ts';
import { parseAnthropicLine, AnthropicProvider } from '../src/anthropic.ts';
import { ProviderError } from '../src/provider.ts';
import type { FetchLike } from '../src/httpStream.ts';

const req = { system: 's', user: 'u', model: 'm' };

function okFetch(bodyText: string): FetchLike {
  return async () => new Response(bodyText, { status: 200 });
}
function statusFetch(status: number): FetchLike {
  return async () => new Response('error body', { status });
}

// --- OpenAI-compatible parsing ----------------------------------------------

test('parseOpenAiLine — extracts delta content', () => {
  assert.deepEqual(parseOpenAiLine('data: {"choices":[{"delta":{"content":"hi"}}]}'), {
    content: 'hi',
    done: false,
  });
});

test('parseOpenAiLine — [DONE] terminates', () => {
  assert.deepEqual(parseOpenAiLine('data: [DONE]'), { content: '', done: true });
});

test('parseOpenAiLine — non-data lines and comments are ignored', () => {
  assert.equal(parseOpenAiLine('event: ping'), null);
  assert.equal(parseOpenAiLine(': keep-alive'), null);
  assert.equal(parseOpenAiLine(''), null);
});

test('OpenAiProvider — missing key fails fast with auth', async () => {
  const provider = new OpenAiProvider('https://api.openai.com/v1', undefined, okFetch(''));
  await assert.rejects(provider.generate(req, {}), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.kind, 'auth');
    return true;
  });
});

test('OpenAiProvider — accumulates streamed SSE content', async () => {
  const body =
    'data: {"choices":[{"delta":{"content":"const "}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"x = 1;"}}]}\n\n' +
    'data: [DONE]\n';
  const provider = new OpenAiProvider('https://api.openai.com/v1', 'sk-test', okFetch(body));
  assert.equal(await provider.generate(req, {}), 'const x = 1;');
});

test('OpenAiProvider — 401 maps to auth, 404 to model-missing', async () => {
  const a = new OpenAiProvider('https://x', 'k', statusFetch(401));
  await assert.rejects(a.generate(req, {}), (e: unknown) => (e as ProviderError).kind === 'auth');
  const b = new OpenAiProvider('https://x', 'k', statusFetch(404));
  await assert.rejects(
    b.generate(req, {}),
    (e: unknown) => (e as ProviderError).kind === 'model-missing',
  );
});

// --- Anthropic parsing ------------------------------------------------------

test('parseAnthropicLine — text_delta yields content', () => {
  assert.deepEqual(
    parseAnthropicLine(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
    ),
    { content: 'Hi', done: false },
  );
});

test('parseAnthropicLine — message_stop terminates; other events are no-ops', () => {
  assert.deepEqual(parseAnthropicLine('data: {"type":"message_stop"}'), { content: '', done: true });
  assert.deepEqual(parseAnthropicLine('data: {"type":"message_start"}'), {
    content: '',
    done: false,
  });
});

test('parseAnthropicLine — error event surfaces the message', () => {
  assert.deepEqual(parseAnthropicLine('data: {"type":"error","error":{"message":"overloaded"}}'), {
    content: '',
    done: true,
    error: 'overloaded',
  });
});

test('AnthropicProvider — missing key fails fast with auth', async () => {
  const provider = new AnthropicProvider('https://api.anthropic.com', undefined, okFetch(''));
  await assert.rejects(provider.generate(req, {}), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.kind, 'auth');
    return true;
  });
});

test('AnthropicProvider — accumulates streamed text deltas', async () => {
  const body =
    'event: content_block_delta\n' +
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"return "}}\n\n' +
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"42;"}}\n\n' +
    'data: {"type":"message_stop"}\n';
  const provider = new AnthropicProvider('https://api.anthropic.com', 'sk-ant', okFetch(body));
  assert.equal(await provider.generate(req, {}), 'return 42;');
});

test('AnthropicProvider — 429 maps to rate-limit', async () => {
  const provider = new AnthropicProvider('https://api.anthropic.com', 'k', statusFetch(429));
  await assert.rejects(
    provider.generate(req, {}),
    (e: unknown) => (e as ProviderError).kind === 'rate-limit',
  );
});
