import { ProviderError } from './provider.ts';
import type { Provider, GenerateRequest, GenerateOptions } from './provider.ts';
import { consumeStream, isAbort, type FetchLike, type ParsedLine } from './httpStream.ts';

export type { FetchLike };

interface OllamaChatChunk {
  readonly message?: { readonly content?: string };
  readonly done?: boolean;
  readonly error?: string;
}

/** Parses one NDJSON line of an Ollama `/api/chat` stream. Pure and testable. */
export function parseChatLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let chunk: OllamaChatChunk;
  try {
    chunk = JSON.parse(trimmed) as OllamaChatChunk;
  } catch {
    return null;
  }
  if (chunk.error) {
    return { content: '', done: true, error: chunk.error };
  }
  return { content: chunk.message?.content ?? '', done: chunk.done === true };
}

export class OllamaProvider implements Provider {
  readonly id = 'ollama';

  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async generate(request: GenerateRequest, options: GenerateOptions): Promise<string> {
    const url = `${this.endpoint.replace(/\/+$/, '')}/api/chat`;
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
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: options.signal,
      });
    } catch (error) {
      if (isAbort(error)) {
        throw new ProviderError('Generation cancelled.', 'aborted');
      }
      throw new ProviderError(
        `Could not reach Ollama at ${this.endpoint}. Is it running? Try \`ollama serve\`.`,
        'unreachable',
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (response.status === 404 || /not found|no such model|try pulling/i.test(detail)) {
        throw new ProviderError(
          `Model "${request.model}" not found. Pull it with \`ollama pull ${request.model}\`.`,
          'model-missing',
        );
      }
      throw new ProviderError(`Ollama returned HTTP ${response.status}. ${detail}`.trim(), 'http');
    }

    if (!response.body) {
      throw new ProviderError('Ollama returned an empty response.', 'unknown');
    }

    return consumeStream(response.body, parseChatLine, options.onToken);
  }
}
