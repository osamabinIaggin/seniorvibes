import * as vscode from 'vscode';

/**
 * Phase 1 skeleton. Proves the extension activates and a contributed command runs.
 * Real behaviour (directive detection, generation) arrives in later phases.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[seniorvibes] activated');

  const ping = vscode.commands.registerCommand('seniorvibes.ping', () => {
    void vscode.window.showInformationMessage('seniorvibes: pong — the extension is alive.');
  });

  context.subscriptions.push(ping);
}

export function deactivate(): void {
  console.log('[seniorvibes] deactivated');
}
