import * as vscode from 'vscode';
import { collectDirectiveBlock, parseLine } from './directive';

/**
 * Shows a `▶ seniorvibes: generate` CodeLens over the FIRST line of every directive
 * block — the discoverable, mouse-friendly trigger alongside Shift+Enter. Adjacent
 * directives share one lens (labelled with the count).
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
    const getLineText = (n: number): string => document.lineAt(n).text;
    const lenses: vscode.CodeLens[] = [];

    let i = 0;
    while (i < document.lineCount) {
      if (parseLine(getLineText(i), i, sentinel) === null) {
        i++;
        continue;
      }
      const block = collectDirectiveBlock(getLineText, document.lineCount, i, sentinel);
      if (!block) {
        i++;
        continue;
      }
      const count = block.texts.length;
      const title =
        count > 1 ? `▶ seniorvibes: generate (${count} directives)` : '▶ seniorvibes: generate';
      lenses.push(
        new vscode.CodeLens(new vscode.Range(block.startLine, 0, block.startLine, 0), {
          title,
          command: 'seniorvibes.generate',
          arguments: [block.startLine],
        }),
      );
      i = block.endLine + 1;
    }

    return lenses;
  }
}
