import * as vscode from 'vscode';

const DEFAULT_SENTINEL = '$#';

/** The configured trigger token, falling back to the default if unset/empty. */
export function getSentinel(): string {
  const value = vscode.workspace.getConfiguration('seniorvibes').get<string>('sentinel');
  return value && value.length > 0 ? value : DEFAULT_SENTINEL;
}
