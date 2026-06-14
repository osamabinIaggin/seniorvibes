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

interface OpenAiChunk {
  readonly choices?: ReadonlyArray<{ readonly delta?: { readonly content?: string } }>;
}

/** Parses one SSE line of an OpenAI-compatible `/chat/completions` stream. Pure. */
export function parseOpenAiLine(line: string): ParsedLine | null {
  const payload = sseData(line);
  if (payload === null) {
    return null;
  }
  if (payload === '[DONE]') {
    return { content: '', done: true };
  }
  let chunk: OpenAiChunk;
  try {
    chunk = JSON.parse(payload) as OpenAiChunk;
  } catch {
    return null;
  }
  return { content: chunk.choices?.[0]?.delta?.content ?? '', done: false };
}

/**
 * Works against any OpenAI-compatible Chat Completions endpoint — OpenAI, Groq, OpenRouter,
 * Together, Mistral, DeepSeek, LM Studio, vLLM — via a configurable base URL.
 */
export class OpenAiProvider implements Provider {
  readonly id = 'openai';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async generate(request: GenerateRequest, options: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw new ProviderError(
        'No API key set for the OpenAI-compatible provider. Run "seniorvibes: Set API Key".',
        'auth',
      );
    }
    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const body = JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      stream: true,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
        signal: options.signal,
      });
    } catch (error) {
      if (isAbort(error)) {
        throw new ProviderError('Generation cancelled.', 'aborted');
      }
      throw new ProviderError(
        `Could not reach the OpenAI-compatible API at ${this.baseUrl}.`,
        'unreachable',
      );
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await response.text().catch(() => ''), request.model);
    }
    if (!response.body) {
      throw new ProviderError('The API returned an empty response.', 'unknown');
    }

    return consumeStream(response.body, parseOpenAiLine, options.onToken);
  }
}
