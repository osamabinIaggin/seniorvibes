import * as vscode from 'vscode';

let storage: vscode.SecretStorage | undefined;

/** Wire up the OS-keychain-backed secret store. Call from `activate`. */
export function initSecrets(secrets: vscode.SecretStorage): void {
  storage = secrets;
}

function keyFor(provider: string): string {
  return `seniorvibes.apiKey.${provider}`;
}

export async function getApiKey(provider: string): Promise<string | undefined> {
  return storage ? storage.get(keyFor(provider)) : undefined;
}

export async function setApiKey(provider: string, value: string): Promise<void> {
  await storage?.store(keyFor(provider), value);
}

export async function clearApiKey(provider: string): Promise<void> {
  await storage?.delete(keyFor(provider));
}
