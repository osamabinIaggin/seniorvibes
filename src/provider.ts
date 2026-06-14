/**
 * Provider abstraction. The MVP ships one implementation (Ollama), but generation is
 * written against this interface so other backends can drop in later.
 */

export interface GenerateRequest {
  readonly system: string;
  readonly user: string;
  readonly model: string;
}

export interface GenerateOptions {
  /** Aborts the in-flight request. */
  readonly signal?: AbortSignal;
  /** Called with each streamed chunk of generated text (for progress). */
  readonly onToken?: (chunk: string) => void;
}

export type ProviderErrorKind =
  | 'unreachable'
  | 'model-missing'
  | 'auth'
  | 'rate-limit'
  | 'http'
  | 'aborted'
  | 'unknown';

/** A failure with a classified kind so the UI can show an actionable message. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface Provider {
  readonly id: string;
  /** Generates code, resolving with the full text. Streams chunks via `onToken`. */
  generate(request: GenerateRequest, options: GenerateOptions): Promise<string>;
}
