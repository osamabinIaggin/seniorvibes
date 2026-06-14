/**
 * Prompt assembly. Pure module — no `vscode`. Builds the system/user pair sent to the
 * provider from the directive block and its surrounding file context. Locked in SPEC.md §4.
 */

export interface PromptInput {
  readonly languageId: string;
  /** Workspace-relative file path, for the model's situational awareness. */
  readonly filePath: string;
  /** The directive instructions, in order. */
  readonly directives: readonly string[];
  /** Lines of code immediately above the insertion point. */
  readonly contextAbove: readonly string[];
  /** Lines of code immediately below the insertion point. */
  readonly contextBelow: readonly string[];
  /** Optional project conventions (AGENTS.md / .seniorvibes.md). */
  readonly projectPrompt?: string;
  /** Real signatures of symbols the directive references (from the language server). */
  readonly groundedSymbols?: readonly { name: string; signature: string; source: string }[];
}

export interface AssembledPrompt {
  readonly system: string;
  readonly user: string;
}

function section(title: string, body: string): string {
  return `--- ${title} ---\n${body}`;
}

export function assemblePrompt(input: PromptInput): AssembledPrompt {
  const { languageId, filePath, directives, contextAbove, contextBelow, projectPrompt } = input;
  const groundedSymbols = input.groundedSymbols ?? [];

  let system =
    `You are seniorvibes, a code-generation assistant embedded directly inside a source file.\n` +
    `Write ONLY the new ${languageId} code that satisfies the instruction(s). Rules:\n` +
    `- Output raw code only: no markdown fences, no explanations, no prose.\n` +
    `- Do NOT repeat, restate, or rewrite any of the surrounding code shown for context — ` +
    `it is already in the file. Emit only the NEW lines to insert.\n` +
    `- Match the surrounding indentation and style. Your output is inserted verbatim at the ` +
    `marked point, so it must be valid ${languageId}.`;

  if (projectPrompt && projectPrompt.trim().length > 0) {
    system += `\n\n--- project conventions ---\n${projectPrompt.trim()}`;
  }

  const parts: string[] = [`File: ${filePath} (language: ${languageId})`];
  if (contextAbove.length > 0) {
    parts.push(section('context above — already in the file, do NOT repeat', contextAbove.join('\n')));
  }
  if (contextBelow.length > 0) {
    parts.push(section('context below — already in the file, do NOT repeat', contextBelow.join('\n')));
  }
  if (groundedSymbols.length > 0) {
    const body = groundedSymbols
      .map((s) => `${s.signature}   // ${s.name} — from ${s.source}`)
      .join('\n');
    parts.push(
      section(
        'known symbols — real definitions in this project, use these signatures EXACTLY',
        body,
      ),
    );
  }
  const numbered = directives.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const allOf =
    directives.length > 1
      ? `instructions — implement ALL ${directives.length}, in order, skipping none`
      : 'instructions';
  parts.push(section(allOf, numbered));
  parts.push(
    `Write only the NEW ${languageId} code to insert between the context above and below. ` +
      `${directives.length > 1 ? 'Produce code for every numbered instruction. ' : ''}` +
      `Do not repeat any surrounding code. Output only the code.`,
  );

  return { system, user: parts.join('\n\n') };
}
