import * as vscode from 'vscode';
import { extractCandidateIdentifiers, extractSignatureFromHover } from './symbols';

export interface GroundedSymbol {
  readonly name: string;
  readonly signature: string;
  readonly source: string;
}

const LSP_TIMEOUT_MS = 1500;
const MAX_CANDIDATES = 12;

/** Resolves to undefined if the underlying call doesn't settle within `ms`. */
function withTimeout<T>(work: Thenable<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    Promise.resolve(work),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

function hoverToMarkdown(hovers: vscode.Hover[] | undefined): string {
  if (!hovers) {
    return '';
  }
  const parts: string[] = [];
  for (const hover of hovers) {
    for (const content of hover.contents) {
      parts.push(typeof content === 'string' ? content : content.value);
    }
  }
  return parts.join('\n');
}

/**
 * Resolves the symbols a directive names to their real signatures, using the workspace's
 * language server. For each candidate identifier: find it via the workspace symbol
 * provider (preferring an exact name match in the current file), then read its hover at
 * the definition to get the true signature. Best-effort and bounded — any failure or
 * miss is silently skipped so generation is never blocked.
 */
export async function gatherGroundedSymbols(
  directiveTexts: readonly string[],
  fromUri: vscode.Uri,
  maxSymbols: number,
): Promise<GroundedSymbol[]> {
  const candidates = [
    ...new Set(directiveTexts.flatMap((t) => extractCandidateIdentifiers(t))),
  ].slice(0, MAX_CANDIDATES);
  const results: GroundedSymbol[] = [];

  for (const name of candidates) {
    if (results.length >= maxSymbols) {
      break;
    }
    try {
      const symbols = await withTimeout(
        vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          name,
        ),
        LSP_TIMEOUT_MS,
      );
      const exact = (symbols ?? []).filter((s) => s.name === name);
      if (exact.length === 0) {
        continue;
      }
      const pick =
        exact.find((s) => s.location.uri.toString() === fromUri.toString()) ?? exact[0];

      const hovers = await withTimeout(
        vscode.commands.executeCommand<vscode.Hover[]>(
          'vscode.executeHoverProvider',
          pick.location.uri,
          pick.location.range.start,
        ),
        LSP_TIMEOUT_MS,
      );
      const signature = extractSignatureFromHover(hoverToMarkdown(hovers));
      if (!signature) {
        continue;
      }
      results.push({
        name,
        signature,
        source: vscode.workspace.asRelativePath(pick.location.uri),
      });
    } catch {
      // language server unavailable or symbol unresolved — skip
    }
  }

  return results;
}
