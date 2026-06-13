import * as vscode from 'vscode';
import { parseDirective } from './directive';

/**
 * Maintains the `seniorvibes.onDirectiveLine` context key, which scopes the
 * Shift+Enter keybinding so it only hijacks the newline on directive lines.
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
    if (editor) {
      const line = editor.selection.active.line;
      const text = editor.document.lineAt(line).text;
      onDirectiveLine = parseDirective(text, line, this.getSentinel()) !== null;
    }
    void vscode.commands.executeCommand(
      'setContext',
      'seniorvibes.onDirectiveLine',
      onDirectiveLine,
    );
  }
}
