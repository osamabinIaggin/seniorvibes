import { ProviderError } from './provider.ts';

/** Minimal fetch signature, injectable so the streaming path is testable. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Parsed result of one streamed line, shared across providers. */
export interface ParsedLine {
  readonly content: string;
  readonly done: boolean;
  readonly error?: string;
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Maps a non-OK HTTP status to a classified, actionable ProviderError (for API providers). */
export function mapHttpError(status: number, detail: string, model: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      'Authentication failed — check your API key (run "seniorvibes: Set API Key").',
      'auth',
    );
  }
  if (status === 404) {
    return new ProviderError(
      `Model "${model}" not found, or the endpoint is wrong (HTTP 404). ${detail}`.trim(),
      'model-missing',
    );
  }
  if (status === 429) {
    return new ProviderError('Rate limited (HTTP 429). Try again shortly.', 'rate-limit');
  }
  return new ProviderError(`Provider returned HTTP ${status}. ${detail}`.trim(), 'http');
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

/**
 * Reads a response body line by line, parsing each with the provider's `parseLine`,
 * accumulating content and emitting chunks via `onToken`. Returns the full text. Used by
 * every provider so the fiddly buffering/abort logic lives in one place.
 */
export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  parseLine: (line: string) => ParsedLine | null,
  onToken?: (chunk: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  const consume = (line: string): boolean => {
    const parsed = parseLine(line);
    if (!parsed) {
      return false;
    }
    if (parsed.error) {
      throw new ProviderError(`Provider error: ${parsed.error}`, 'http');
    }
    if (parsed.content.length > 0) {
      output += parsed.content;
      onToken?.(parsed.content);
    }
    return parsed.done;
  };

  try {
    for await (const chunk of readChunks(body)) {
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
    throw new ProviderError(`Failed reading the response stream: ${String(error)}`, 'unknown');
  }
}

/** Extracts the JSON payload from an SSE `data:` line, or null for non-data lines. */
export function sseData(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice(5).trim();
  return payload.length > 0 ? payload : null;
}
