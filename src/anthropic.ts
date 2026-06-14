import { ProviderError } from './provider.ts';
import type { Provider, GenerateRequest, GenerateOptions } from './provider.ts';
import {
  consumeStream,
  isAbort,
  mapHttpError,
  sseData,
  type FetchLike,
  type ParsedLine,
} from './httpStream.ts';

const MAX_TOKENS = 4096;
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicEvent {
  readonly type?: string;
  readonly delta?: { readonly type?: string; readonly text?: string };
  readonly error?: { readonly message?: string };
}

/** Parses one SSE line of an Anthropic `/v1/messages` stream. Pure. */
export function parseAnthropicLine(line: string): ParsedLine | null {
  const payload = sseData(line);
  if (payload === null) {
    return null;
  }
  let event: AnthropicEvent;
  try {
    event = JSON.parse(payload) as AnthropicEvent;
  } catch {
    return null;
  }
  if (event.type === 'error') {
    return { content: '', done: true, error: event.error?.message ?? 'unknown error' };
  }
  if (event.type === 'message_stop') {
    return { content: '', done: true };
  }
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return { content: event.delta.text ?? '', done: false };
  }
  return { content: '', done: false };
}

/** First-class Claude support via the Anthropic Messages API. */
export class AnthropicProvider implements Provider {
  readonly id = 'anthropic';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async generate(request: GenerateRequest, options: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw new ProviderError(
        'No Anthropic API key set. Run "seniorvibes: Set API Key".',
        'auth',
      );
    }
    const url = `${this.baseUrl.replace(/\/+$/, '')}/v1/messages`;
    const body = JSON.stringify({
      model: request.model,
      max_tokens: MAX_TOKENS,
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
      stream: true,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body,
        signal: options.signal,
      });
    } catch (error) {
      if (isAbort(error)) {
        throw new ProviderError('Generation cancelled.', 'aborted');
      }
      throw new ProviderError(`Could not reach the Anthropic API at ${this.baseUrl}.`, 'unreachable');
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await response.text().catch(() => ''), request.model);
    }
    if (!response.body) {
      throw new ProviderError('Anthropic returned an empty response.', 'unknown');
    }

    return consumeStream(response.body, parseAnthropicLine, options.onToken);
  }
}
