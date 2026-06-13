import { ProviderError } from './provider.ts';
import type { Provider, GenerateRequest, GenerateOptions } from './provider.ts';

/** Minimal fetch signature, injectable so the streaming path is testable. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface OllamaChatChunk {
  readonly message?: { readonly content?: string };
  readonly done?: boolean;
  readonly error?: string;
}

export interface ParsedChatLine {
  readonly content: string;
  readonly done: boolean;
  readonly error?: string;
}

/** Parses one NDJSON line of an Ollama `/api/chat` stream. Pure and testable. */
export function parseChatLine(line: string): ParsedChatLine | null {
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

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function* readChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
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

    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';

    const consume = (line: string): boolean => {
      const parsed = parseChatLine(line);
      if (!parsed) {
        return false;
      }
      if (parsed.error) {
        throw new ProviderError(`Ollama error: ${parsed.error}`, 'http');
      }
      if (parsed.content.length > 0) {
        output += parsed.content;
        options.onToken?.(parsed.content);
      }
      return parsed.done;
    };

    try {
      for await (const chunk of readChunks(response.body)) {
        buffer += decoder.decode(chunk, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (consume(line)) {
            return output;
          }
        }
      }
      consume(buffer);
      return output;
    } catch (error) {
      if (isAbort(error)) {
        throw new ProviderError('Generation cancelled.', 'aborted');
      }
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(`Failed reading Ollama stream: ${String(error)}`, 'unknown');
    }
  }
}
