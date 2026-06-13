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

  let system =
    `You are seniorvibes, a code-generation assistant embedded directly inside a source file.\n` +
    `Output ONLY raw ${languageId} code. Do NOT wrap it in markdown code fences. ` +
    `Do NOT add explanations, comments about the task, or prose.\n` +
    `Match the surrounding code's style and indentation. Your output is inserted verbatim ` +
    `into the file at the marked point, so it must be valid ${languageId}.`;

  if (projectPrompt && projectPrompt.trim().length > 0) {
    system += `\n\n--- project conventions ---\n${projectPrompt.trim()}`;
  }

  const parts: string[] = [`File: ${filePath} (language: ${languageId})`];
  if (contextAbove.length > 0) {
    parts.push(section('code above the insertion point', contextAbove.join('\n')));
  }
  if (contextBelow.length > 0) {
    parts.push(section('code below the insertion point', contextBelow.join('\n')));
  }
  parts.push(section('instructions', directives.map((d) => `- ${d}`).join('\n')));
  parts.push(`Write the ${languageId} code to insert at the marked point. Output only the code.`);

  return { system, user: parts.join('\n\n') };
}
