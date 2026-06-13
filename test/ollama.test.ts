import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatLine, OllamaProvider, type FetchLike } from '../src/ollama.ts';
import { ProviderError } from '../src/provider.ts';

test('parseChatLine — extracts content and done flag', () => {
  assert.deepEqual(parseChatLine('{"message":{"content":"hi"},"done":false}'), {
    content: 'hi',
    done: false,
  });
  assert.deepEqual(parseChatLine('{"message":{"content":""},"done":true}'), {
    content: '',
    done: true,
  });
});

test('parseChatLine — blank and invalid lines are null', () => {
  assert.equal(parseChatLine('   '), null);
  assert.equal(parseChatLine('not json'), null);
});

test('parseChatLine — error payload is surfaced', () => {
  assert.deepEqual(parseChatLine('{"error":"boom"}'), { content: '', done: true, error: 'boom' });
});

function ndjson(...objs: unknown[]): string {
  return objs.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

function okFetch(bodyText: string): FetchLike {
  return async () => new Response(bodyText, { status: 200 });
}

const req = { system: 's', user: 'u', model: 'm' };

test('OllamaProvider.generate — accumulates streamed content and reports chunks', async () => {
  const body = ndjson(
    { message: { content: 'const ' }, done: false },
    { message: { content: 'x = 1;' }, done: false },
    { message: { content: '' }, done: true },
  );
  const provider = new OllamaProvider('http://localhost:11434', okFetch(body));
  const chunks: string[] = [];
  const out = await provider.generate(req, { onToken: (c) => chunks.push(c) });
  assert.equal(out, 'const x = 1;');
  assert.deepEqual(chunks, ['const ', 'x = 1;']);
});

test('OllamaProvider.generate — stops at the first done line', async () => {
  const body = ndjson(
    { message: { content: 'kept' }, done: true },
    { message: { content: 'ignored' }, done: false },
  );
  const provider = new OllamaProvider('http://localhost:11434', okFetch(body));
  assert.equal(await provider.generate(req, {}), 'kept');
});

test('OllamaProvider.generate — 404 maps to model-missing', async () => {
  const fetchImpl: FetchLike = async () => new Response('model not found', { status: 404 });
  const provider = new OllamaProvider('http://localhost:11434', fetchImpl);
  await assert.rejects(provider.generate({ ...req, model: 'qwen' }, {}), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.kind, 'model-missing');
    assert.match(e.message, /ollama pull qwen/);
    return true;
  });
});

test('OllamaProvider.generate — connection failure maps to unreachable', async () => {
  const fetchImpl: FetchLike = async () => {
    throw new Error('ECONNREFUSED');
  };
  const provider = new OllamaProvider('http://localhost:11434', fetchImpl);
  await assert.rejects(provider.generate(req, {}), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.kind, 'unreachable');
    return true;
  });
});

test('OllamaProvider.generate — an error line mid-stream maps to http', async () => {
  const body = ndjson({ message: { content: 'partial' }, done: false }, { error: 'overloaded' });
  const provider = new OllamaProvider('http://localhost:11434', okFetch(body));
  await assert.rejects(provider.generate(req, {}), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.kind, 'http');
    return true;
  });
});
