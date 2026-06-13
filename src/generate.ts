import * as vscode from 'vscode';
import { getSettings, getHighlight, type Settings } from './config';
import { collectDirectiveBlock } from './directive';
import { assemblePrompt } from './prompt';
import { shapeOutput } from './output';
import { findReplaceableBlock, locateBlock } from './recent';
import { flashRange } from './highlight';
import { OllamaProvider } from './ollama';
import { ProviderError, type Provider } from './provider';

/** Per-document memory of generated blocks, so a re-run can find and replace them. */
const generatedByDoc = new Map<string, Set<string>>();

function knownFor(uri: string): Set<string> {
  let set = generatedByDoc.get(uri);
  if (!set) {
    set = new Set();
    generatedByDoc.set(uri, set);
  }
  return set;
}

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
 * on re-run) clean code below the directives — with a brief highlight on the new code.
 */
export async function runGenerate(editor: vscode.TextEditor, anchorLine: number): Promise<void> {
  const settings = getSettings();
  const document = editor.document;
  const uri = document.uri.toString();
  const getLine = (n: number): string => document.lineAt(n).text;

  const block = collectDirectiveBlock(getLine, document.lineCount, anchorLine, settings.sentinel);
  if (!block) {
    void vscode.window.showWarningMessage('seniorvibes: no directive on this line.');
    return;
  }

  const known = knownFor(uri);
  const existing = findReplaceableBlock(getLine, document.lineCount, block.endLine + 1, known);
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

  const edit = new vscode.WorkspaceEdit();
  let insertStart: number;
  if (existing) {
    const endLength = document.lineAt(existing.endLine).text.length;
    edit.replace(
      document.uri,
      new vscode.Range(existing.startLine, 0, existing.endLine, endLength),
      shaped,
    );
    insertStart = existing.startLine;
    known.delete(existing.text);
  } else {
    const endLength = document.lineAt(block.endLine).text.length;
    edit.insert(document.uri, new vscode.Position(block.endLine, endLength), `\n${shaped}`);
    insertStart = block.endLine + 1;
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    void vscode.window.showWarningMessage('seniorvibes: could not apply the edit.');
    return;
  }
  known.add(shaped);

  // Highlight the freshly written code, then let it fade back to normal.
  const insertEnd = insertStart + shaped.split('\n').length - 1;
  if (insertEnd < document.lineCount) {
    const range = new vscode.Range(insertStart, 0, insertEnd, document.lineAt(insertEnd).text.length);
    flashRange(editor, range, getHighlight());
  }

  // Leave the directive in place briefly, then auto-remove it for clean output —
  // unless the cursor is resting on it (the user's signal to keep/tweak/re-run).
  if (settings.removeDirective) {
    const directiveTexts = sliceLines(document, block.startLine, block.endLine + 1);
    scheduleDirectiveCleanup(editor, document, block.startLine, directiveTexts, settings.removeDirectiveDelayMs);
  }
}

function scheduleDirectiveCleanup(
  editor: vscode.TextEditor,
  document: vscode.TextDocument,
  guessLine: number,
  directiveTexts: string[],
  delayMs: number,
): void {
  if (delayMs <= 0) {
    return;
  }
  setTimeout(() => void removeDirectiveIfIdle(editor, document, guessLine, directiveTexts), delayMs);
}

async function removeDirectiveIfIdle(
  editor: vscode.TextEditor,
  document: vscode.TextDocument,
  guessLine: number,
  directiveTexts: string[],
): Promise<void> {
  if (document.isClosed) {
    return;
  }
  const located = locateBlock(
    (n) => document.lineAt(n).text,
    document.lineCount,
    guessLine,
    directiveTexts,
  );
  if (!located) {
    return; // directive was edited or moved out of range — leave it alone
  }

  // Cursor protection: if the caret is on any directive line, keep it.
  const active = editor.selection.active.line;
  if (active >= located.startLine && active <= located.endLine) {
    return;
  }

  const start = new vscode.Position(located.startLine, 0);
  const end =
    located.endLine + 1 < document.lineCount
      ? new vscode.Position(located.endLine + 1, 0)
      : new vscode.Position(located.endLine, document.lineAt(located.endLine).text.length);
  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, new vscode.Range(start, end));
  await vscode.workspace.applyEdit(edit);
}
