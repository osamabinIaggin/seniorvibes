import * as vscode from 'vscode';
import { parseDirective } from './directive';

/**
 * Shows a `▶ seniorvibes: generate` CodeLens over every directive line —
 * the discoverable, mouse-friendly trigger alongside Shift+Enter.
 */
export class DirectiveCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  constructor(private readonly getSentinel: () => string) {}

  /** Force a re-query (used when the sentinel setting changes). */
  refresh(): void {
    this.changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const sentinel = this.getSentinel();
    const lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const directive = parseDirective(document.lineAt(i).text, i, sentinel);
      if (directive) {
        lenses.push(
          new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
            title: '▶ seniorvibes: generate',
            command: 'seniorvibes.generate',
            arguments: [i],
          }),
        );
      }
    }
    return lenses;
  }
}
