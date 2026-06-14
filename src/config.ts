import * as vscode from 'vscode';
import type { HighlightStyle } from './highlight';

const DEFAULT_SENTINEL = '$#';

export interface Settings {
  readonly sentinel: string;
  readonly provider: string;
  readonly ollamaEndpoint: string;
  readonly ollamaModel: string;
  readonly linesAbove: number;
  readonly linesBelow: number;
  readonly removeDirective: boolean;
  readonly removeDirectiveDelayMs: number;
  readonly groundingEnabled: boolean;
  readonly groundingMaxSymbols: number;
}

/** The configured trigger token, falling back to the default if unset/empty. */
export function getSentinel(): string {
  const value = vscode.workspace.getConfiguration('seniorvibes').get<string>('sentinel');
  return value && value.length > 0 ? value : DEFAULT_SENTINEL;
}

/** All settings, with defaults applied. */
export function getSettings(): Settings {
  const c = vscode.workspace.getConfiguration('seniorvibes');
  return {
    sentinel: getSentinel(),
    provider: c.get<string>('provider') ?? 'ollama',
    ollamaEndpoint: c.get<string>('ollama.endpoint') ?? 'http://localhost:11434',
    ollamaModel: c.get<string>('ollama.model') ?? 'qwen2.5-coder',
    linesAbove: c.get<number>('context.linesAbove') ?? 40,
    linesBelow: c.get<number>('context.linesBelow') ?? 10,
    removeDirective: c.get<boolean>('directive.removeAfterGenerate') ?? true,
    removeDirectiveDelayMs: c.get<number>('directive.removeDelayMs') ?? 5000,
    groundingEnabled: c.get<boolean>('grounding.enabled') ?? true,
    groundingMaxSymbols: c.get<number>('grounding.maxSymbols') ?? 8,
  };
}

/** Style for the temporary highlight applied to freshly generated code. */
export function getHighlight(): HighlightStyle {
  const c = vscode.workspace.getConfiguration('seniorvibes');
  const kind = (c.get<string>('highlight.style') ?? 'foreground') as HighlightStyle['kind'];
  const userColor = c.get<string>('highlight.color') ?? '';
  const color = userColor || (kind === 'background' ? 'rgba(63,185,80,0.18)' : '#3fb950');
  return {
    kind,
    color,
    durationMs: c.get<number>('highlight.durationMs') ?? 5000,
  };
}
