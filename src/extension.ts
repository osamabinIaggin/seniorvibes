import * as vscode from 'vscode';
import { getSentinel } from './config';
import { collectDirectiveBlock } from './directive';
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
  const contextKey = new DirectiveContextKey(getSentinel);
  contextKey.register(context);

  const codeLens = new DirectiveCodeLensProvider(getSentinel);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ scheme: 'file' }, { scheme: 'untitled' }],
      codeLens,
    ),
  );

  // generate — Phase 2 echoes the parsed (possibly compounded) directive block.
  // Invoked with a line number from CodeLens, or without one from the keybinding.
  context.subscriptions.push(
    vscode.commands.registerCommand('seniorvibes.generate', (lineArg?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const anchor = typeof lineArg === 'number' ? lineArg : editor.selection.active.line;
      const block = collectDirectiveBlock(
        (n) => editor.document.lineAt(n).text,
        editor.document.lineCount,
        anchor,
        getSentinel(),
      );
      if (!block) {
        void vscode.window.showWarningMessage('seniorvibes: no directive on this line.');
        return;
      }
      const count = block.directives.length;
      const joined = block.directives.map((d) => d.text).join('  ⏎  ');
      void vscode.window.showInformationMessage(
        `seniorvibes parsed → "${joined}"  (lang ${editor.document.languageId}, ` +
          `${count} directive${count > 1 ? 's' : ''}, insert below line ${block.endLine + 1})`,
      );
    }),
  );

  // continueDirective — Enter at the end of a directive line starts the next directive,
  // pre-filled with the sentinel, so multi-line (compound) directives are quick to write.
  context.subscriptions.push(
    vscode.commands.registerCommand('seniorvibes.continueDirective', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const sentinel = getSentinel();
      const position = editor.selection.active;
      const lineText = editor.document.lineAt(position.line).text;
      const indent = /^[ \t]*/.exec(lineText)?.[0] ?? '';
      const prefix = `${indent}${sentinel} `;
      const inserted = await editor.edit((edit) => edit.insert(position, `\n${prefix}`));
      if (inserted) {
        const next = new vscode.Position(position.line + 1, prefix.length);
        editor.selection = new vscode.Selection(next, next);
      }
    }),
  );

  // React to sentinel changes: refresh lenses and recompute the context keys.
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
