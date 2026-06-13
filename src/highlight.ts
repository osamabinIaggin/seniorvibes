import * as vscode from 'vscode';
import { withAlpha } from './color';

export interface HighlightStyle {
  readonly kind: 'foreground' | 'background' | 'none';
  readonly color: string;
  readonly durationMs: number;
}

const FADE_STEPS = 12;
const HOLD_FRACTION = 0.55; // hold at full strength for this fraction, then fade out

/**
 * Highlights a range of freshly generated code, holds it, then smoothly fades it back to
 * normal syntax coloring by stepping the color's alpha down. Disposing each decoration
 * type removes it from the editor.
 */
export function flashRange(
  editor: vscode.TextEditor,
  range: vscode.Range,
  style: HighlightStyle,
): void {
  if (style.kind === 'none' || style.durationMs <= 0) {
    return;
  }

  const decorate = (alpha: number): vscode.TextEditorDecorationType => {
    const color = withAlpha(style.color, alpha);
    const type = vscode.window.createTextEditorDecorationType(
      style.kind === 'background'
        ? { backgroundColor: color, isWholeLine: true }
        : { color },
    );
    editor.setDecorations(type, [range]);
    return type;
  };

  let current = decorate(1);

  const holdMs = style.durationMs * HOLD_FRACTION;
  const stepMs = (style.durationMs * (1 - HOLD_FRACTION)) / FADE_STEPS;

  const stillVisible = (): boolean => vscode.window.visibleTextEditors.includes(editor);

  const tick = (step: number): void => {
    if (!stillVisible()) {
      current.dispose();
      return;
    }
    if (step > FADE_STEPS) {
      current.dispose();
      return;
    }
    const next = decorate(1 - step / FADE_STEPS);
    current.dispose();
    current = next;
    setTimeout(() => tick(step + 1), stepMs);
  };

  setTimeout(() => tick(1), holdMs);
}
