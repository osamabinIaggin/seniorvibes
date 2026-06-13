import * as vscode from 'vscode';
import { parseDirective } from './directive';

/**
 * Maintains two context keys:
 *  - `seniorvibes.onDirectiveLine`    — cursor sits on a directive line (scopes Shift+Enter)
 *  - `seniorvibes.atDirectiveLineEnd` — cursor is at the END of a directive line with no
 *    selection (scopes the Enter continuation, so we only hijack Enter when the user has
 *    finished a directive and is starting the next).
 */
export class DirectiveContextKey {
  constructor(private readonly getSentinel: () => string) {}

  register(context: vscode.ExtensionContext): void {
    this.update(vscode.window.activeTextEditor);
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => this.update(editor)),
      vscode.window.onDidChangeTextEditorSelection((event) => this.update(event.textEditor)),
    );
  }

  update(editor: vscode.TextEditor | undefined): void {
    let onDirectiveLine = false;
    let atDirectiveLineEnd = false;

    if (editor) {
      const selection = editor.selection;
      const line = selection.active.line;
      const lineText = editor.document.lineAt(line).text;
      onDirectiveLine = parseDirective(lineText, line, this.getSentinel()) !== null;
      atDirectiveLineEnd =
        onDirectiveLine &&
        selection.isEmpty &&
        selection.active.character === lineText.length;
    }

    void vscode.commands.executeCommand(
      'setContext',
      'seniorvibes.onDirectiveLine',
      onDirectiveLine,
    );
    void vscode.commands.executeCommand(
      'setContext',
      'seniorvibes.atDirectiveLineEnd',
      atDirectiveLineEnd,
    );
  }
}
