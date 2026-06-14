import * as vscode from 'vscode';
import { getSettings, getHighlight, type Settings } from './config';
import { collectDirectiveBlock } from './directive';
import { assemblePrompt } from './prompt';
import { shapeOutput } from './output';
import { findReplaceableBlock, locateBlock } from './recent';
import { DirectiveCleanupMachine } from './cleanup';
import { flashRange } from './highlight';
import { OllamaProvider } from './ollama';
import { ProviderError, type Provider } from './provider';
import { gatherGroundedSymbols } from './grounding';

/** Per-document memory of generated blocks, so a re-run can find and replace them. */
const generatedByDoc = new Map<string, Set<string>>();

let channel: vscode.OutputChannel | undefined;
function log(message: string): void {
  if (!channel) {
    channel = vscode.window.createOutputChannel('seniorvibes');
  }
  channel.appendLine(message);
}

/** Documents currently generating, so overlapping runs in the same file are rejected. */
const inProgress = new Set<string>();
/** Active directive-cleanup controllers, disposed on deactivate. */
const activeCleanups = new Set<DirectiveCleanup>();

/** Wires generation resources into the extension lifecycle. Call from `activate`. */
export function registerGenerate(context: vscode.ExtensionContext): void {
  if (!channel) {
    channel = vscode.window.createOutputChannel('seniorvibes');
  }
  context.subscriptions.push(
    channel,
    vscode.workspace.onDidCloseTextDocument((doc) => generatedByDoc.delete(doc.uri.toString())),
    { dispose: () => [...activeCleanups].forEach((c) => c.dispose()) },
  );
}

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
  const uri = editor.document.uri.toString();
  if (inProgress.has(uri)) {
    void vscode.window.showInformationMessage('seniorvibes: already generating in this file.');
    return;
  }
  inProgress.add(uri);
  try {
    await doGenerate(editor, anchorLine);
  } finally {
    inProgress.delete(uri);
  }
}

async function doGenerate(editor: vscode.TextEditor, anchorLine: number): Promise<void> {
  const settings = getSettings();
  const document = editor.document;
  const uri = document.uri.toString();
  const getLine = (n: number): string => document.lineAt(n).text;

  const block = collectDirectiveBlock(getLine, document.lineCount, anchorLine, settings.sentinel);
  if (!block) {
    void vscode.window.showWarningMessage('seniorvibes: no directive on this line.');
    return;
  }

  // Capture the version before ANY await (grounding / project-prompt / generation), so the
  // guard below covers the whole read→generate→write window and never inserts on stale lines.
  const versionBefore = document.version;
  const known = knownFor(uri);
  const existing = findReplaceableBlock(getLine, document.lineCount, block.endLine + 1, known);
  const belowStart = existing ? existing.endLine + 1 : block.endLine + 1;

  const contextAbove = [
    ...sliceLines(document, block.startLine - settings.linesAbove, block.startLine),
    ...block.befores.filter((b) => b.trim().length > 0),
  ];
  const contextBelow = sliceLines(document, belowStart, belowStart + settings.linesBelow);

  const groundedSymbols = settings.groundingEnabled
    ? await gatherGroundedSymbols(block.texts, document.uri, settings.groundingMaxSymbols)
    : [];
  if (groundedSymbols.length > 0) {
    log(`grounded ${groundedSymbols.length} symbol(s): ${groundedSymbols.map((s) => s.name).join(', ')}`);
  }

  const { system, user } = assemblePrompt({
    languageId: document.languageId,
    filePath: vscode.workspace.asRelativePath(document.uri),
    directives: block.texts,
    contextAbove,
    contextBelow,
    projectPrompt: await readProjectPrompt(),
    groundedSymbols,
  });

  const provider = makeProvider(settings);

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

  const shaped = shapeOutput(raw, block.indent, contextAbove, contextBelow);
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
  // Update replace-tracking only after a confirmed apply; delete-before-add so a
  // regenerated-identical block stays tracked.
  if (existing) {
    known.delete(existing.text);
  }
  known.add(shaped);

  // Highlight the freshly written code, then let it fade back to normal.
  const insertEnd = insertStart + shaped.split('\n').length - 1;
  if (insertEnd < document.lineCount) {
    const range = new vscode.Range(insertStart, 0, insertEnd, document.lineAt(insertEnd).text.length);
    flashRange(editor, range, getHighlight());
  }

  // Leave the directive in place briefly, then auto-remove it for clean output. The
  // countdown pauses while the cursor is on the directive and resets when it leaves.
  if (settings.removeDirective && settings.removeDirectiveDelayMs > 0) {
    const directiveTexts = sliceLines(document, block.startLine, block.endLine + 1);
    new DirectiveCleanup(
      editor,
      document,
      block.startLine,
      directiveTexts,
      settings.removeDirectiveDelayMs,
    );
  }
}

/**
 * Wires real VS Code timers and selection events to the pure DirectiveCleanupMachine,
 * and re-locates the directive by exact text so a line shift never deletes the wrong lines.
 * Self-disposes once it deletes, the directive is edited/moved away, or the document closes.
 */
class DirectiveCleanup {
  private readonly machine: DirectiveCleanupMachine;
  private readonly subs: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly editor: vscode.TextEditor,
    private readonly document: vscode.TextDocument,
    private readonly guessLine: number,
    private readonly directiveTexts: string[],
    private readonly delayMs: number,
  ) {
    this.machine = new DirectiveCleanupMachine({
      setTimer: () => this.setTimer(),
      clearTimer: () => this.clearTimer(),
      delete: () => void this.performDelete(),
    });
    this.subs.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document === this.document) {
          this.onCursorMoved();
        }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (doc === this.document) {
          this.dispose();
        }
      }),
    );
    activeCleanups.add(this);
    this.machine.start(this.cursorOnDirective());
  }

  private located() {
    return locateBlock(
      (n) => this.document.lineAt(n).text,
      this.document.lineCount,
      this.guessLine,
      this.directiveTexts,
    );
  }

  private cursorOnDirective(): boolean {
    const located = this.located();
    if (!located) {
      return false;
    }
    const line = this.editor.selection.active.line;
    return line >= located.startLine && line <= located.endLine;
  }

  private onCursorMoved(): void {
    if (this.disposed) {
      return;
    }
    if (!this.located()) {
      this.dispose(); // edited or moved out of range — stop trying
      return;
    }
    this.machine.cursorMoved(this.cursorOnDirective());
  }

  private setTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.disposed || this.document.isClosed) {
        this.dispose();
        return;
      }
      this.machine.timerFired(this.cursorOnDirective());
    }, this.delayMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private async performDelete(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const located = this.located();
    if (!located) {
      this.dispose();
      return;
    }
    const start = new vscode.Position(located.startLine, 0);
    const end =
      located.endLine + 1 < this.document.lineCount
        ? new vscode.Position(located.endLine + 1, 0)
        : new vscode.Position(located.endLine, this.document.lineAt(located.endLine).text.length);
    const edit = new vscode.WorkspaceEdit();
    edit.delete(this.document.uri, new vscode.Range(start, end));
    await vscode.workspace.applyEdit(edit);
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clearTimer();
    for (const sub of this.subs) {
      sub.dispose();
    }
    activeCleanups.delete(this);
  }
}
