import * as vscode from 'vscode';
import { getSentinel } from './config';
import { parseDirective } from './directive';
import { DirectiveContextKey } from './contextKey';
import { DirectiveCodeLensProvider } from './codeLensProvider';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[seniorvibes] activated');

  // --- Phase 1: liveness check -------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('seniorvibes.ping', () => {
      void vscode.window.showInformationMessage('seniorvibes: pong — the extension is alive.');
    }),
  );

  // --- Phase 2: directive detection + triggers ---------------------------------
  // Context key scopes the Shift+Enter keybinding to directive lines only.
  const contextKey = new DirectiveContextKey(getSentinel);
  contextKey.register(context);

  // CodeLens trigger over every directive line.
  const codeLens = new DirectiveCodeLensProvider(getSentinel);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ scheme: 'file' }, { scheme: 'untitled' }],
      codeLens,
    ),
  );

  // generate — Phase 2 echoes the parsed directive (no LLM yet).
  // Invoked with a line number from CodeLens, or without one from the keybinding
  // (in which case the cursor's line is used).
  context.subscriptions.push(
    vscode.commands.registerCommand('seniorvibes.generate', (lineArg?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const lineNumber = typeof lineArg === 'number' ? lineArg : editor.selection.active.line;
      const directive = parseDirective(
        editor.document.lineAt(lineNumber).text,
        lineNumber,
        getSentinel(),
      );
      if (!directive) {
        void vscode.window.showWarningMessage('seniorvibes: no directive on this line.');
        return;
      }
      const placement = directive.before.trim().length > 0 ? 'inline after code' : 'line start';
      void vscode.window.showInformationMessage(
        `seniorvibes parsed → "${directive.text}"  (lang ${editor.document.languageId}, ${placement}, indent ${directive.indent.length})`,
      );
    }),
  );

  // React to sentinel changes: refresh lenses and recompute the context key.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('seniorvibes.sentinel')) {
        codeLens.refresh();
        contextKey.update(vscode.window.activeTextEditor);
      }
    }),
  );
}

export function deactivate(): void {
  console.log('[seniorvibes] deactivated');
}
