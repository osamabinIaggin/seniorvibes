import * as vscode from 'vscode';
import { getSettings, type Settings } from './config';
import { collectDirectiveBlock } from './directive';
import { assemblePrompt } from './prompt';
import { hashDirectives, wrapGenerated, findExistingBlock } from './fence';
import { shapeOutput } from './output';
import { OllamaProvider } from './ollama';
import { ProviderError, type Provider } from './provider';

function makeProvider(settings: Settings): Provider {
  // Only Ollama is implemented in the MVP; the interface lets others drop in later.
  return new OllamaProvider(settings.ollamaEndpoint);
}

/** Inclusive `start`, exclusive `end`, clamped to the document. */
function sliceLines(document: vscode.TextDocument, start: number, end: number): string[] {
  const lines: string[] = [];
  for (let i = Math.max(0, start); i < Math.min(document.lineCount, end); i++) {
    lines.push(document.lineAt(i).text);
  }
  return lines;
}

async function readProjectPrompt(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  for (const name of ['.seniorvibes.md', 'AGENTS.md']) {
    try {
      const uri = vscode.Uri.joinPath(folders[0].uri, name);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder().decode(bytes);
    } catch {
      // not present — try the next candidate
    }
  }
  return undefined;
}

/**
 * The full generation flow for the directive block anchored at `anchorLine`:
 * collect the block, assemble the prompt with surrounding context, stream from the
 * provider under a cancellable progress notification, then atomically insert (or replace,
 * on re-run) a fenced block below the directives.
 */
export async function runGenerate(editor: vscode.TextEditor, anchorLine: number): Promise<void> {
  const settings = getSettings();
  const document = editor.document;
  const getLine = (n: number): string => document.lineAt(n).text;

  const block = collectDirectiveBlock(getLine, document.lineCount, anchorLine, settings.sentinel);
  if (!block) {
    void vscode.window.showWarningMessage('seniorvibes: no directive on this line.');
    return;
  }

  const existing = findExistingBlock(getLine, document.lineCount, block.endLine + 1);
  const belowStart = existing ? existing.endLine + 1 : block.endLine + 1;

  const { system, user } = assemblePrompt({
    languageId: document.languageId,
    filePath: vscode.workspace.asRelativePath(document.uri),
    directives: block.texts,
    contextAbove: sliceLines(document, block.startLine - settings.linesAbove, block.startLine),
    contextBelow: sliceLines(document, belowStart, belowStart + settings.linesBelow),
    projectPrompt: await readProjectPrompt(),
  });

  const provider = makeProvider(settings);
  const versionBefore = document.version;

  let raw: string;
  try {
    raw = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        title: `seniorvibes: generating (${settings.ollamaModel})`,
      },
      async (progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        let chars = 0;
        return provider.generate(
          { system, user, model: settings.ollamaModel },
          {
            signal: controller.signal,
            onToken: (chunk) => {
              chars += chunk.length;
              progress.report({ message: `${chars} chars` });
            },
          },
        );
      },
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.kind === 'aborted') {
        return; // user cancelled — leave the buffer untouched
      }
      void vscode.window.showErrorMessage(`seniorvibes: ${error.message}`);
      return;
    }
    void vscode.window.showErrorMessage(`seniorvibes: ${String(error)}`);
    return;
  }

  // Guard: if the document changed during generation, our line ranges may be stale.
  // Refuse to edit rather than risk corrupting the buffer.
  if (document.version !== versionBefore) {
    void vscode.window.showWarningMessage(
      'seniorvibes: the document changed during generation — re-run to insert.',
    );
    return;
  }

  const shaped = shapeOutput(raw, block.indent);
  if (shaped.trim().length === 0) {
    void vscode.window.showWarningMessage('seniorvibes: the model returned no code.');
    return;
  }

  const wrapped = wrapGenerated(block.indent, document.languageId, hashDirectives(block.texts), shaped);
  const edit = new vscode.WorkspaceEdit();
  if (existing) {
    const endLength = document.lineAt(existing.endLine).text.length;
    edit.replace(
      document.uri,
      new vscode.Range(existing.beginLine, 0, existing.endLine, endLength),
      wrapped,
    );
  } else {
    const endLength = document.lineAt(block.endLine).text.length;
    edit.insert(document.uri, new vscode.Position(block.endLine, endLength), `\n${wrapped}`);
  }
  await vscode.workspace.applyEdit(edit);
}
