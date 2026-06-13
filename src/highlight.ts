import * as vscode from 'vscode';

export interface HighlightStyle {
  readonly kind: 'foreground' | 'background' | 'none';
  readonly color: string;
  readonly durationMs: number;
}

/**
 * Briefly highlights a range of freshly generated code, then clears it so the text
 * returns to normal syntax coloring. Disposing the decoration type removes it.
 */
export function flashRange(
  editor: vscode.TextEditor,
  range: vscode.Range,
  style: HighlightStyle,
): void {
  if (style.kind === 'none' || style.durationMs <= 0) {
    return;
  }
  const decoration = vscode.window.createTextEditorDecorationType(
    style.kind === 'background'
      ? { backgroundColor: style.color, isWholeLine: true }
      : { color: style.color },
  );
  editor.setDecorations(decoration, [range]);
  setTimeout(() => decoration.dispose(), style.durationMs);
}
