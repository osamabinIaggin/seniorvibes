# seniorvibes

> Senior devs vibe coding.

A VS Code extension where a **one-line directive** becomes a small, reviewable,
correctly-grounded block of code — placed exactly where you asked for it.
Control over magic.

Write a directive on its own line:

```ts
$# add a POST /users/:id/invite endpoint — validate body with InviteDto, call this.inviteService.send(), return 201, throw ConflictException if already invited
```

Press **Shift+Enter** (on the directive line) and the code is generated and inserted
right below it, grounded in the real symbols in your project.

## Status

Early MVP, built in phases. See [PHASES.md](./PHASES.md) for the build plan and
[SPEC.md](./SPEC.md) for the locked specification.

## Requirements (MVP)

- [Ollama](https://ollama.com) running locally (`http://localhost:11434`) with a
  code model pulled, e.g. `ollama pull qwen2.5-coder`.

## How it works (MVP)

- Trigger token `$#` marks a line as a directive.
- **Shift+Enter** on a directive line generates; normal newline everywhere else.
- Generated code is wrapped in comment fences so re-running replaces it (no duplicates).
- **Tier-1 grounding:** identifiers you mention are resolved through VS Code's language
  server and their real signatures are fed to the model — so references are correct,
  not hallucinated.
- Local-only: nothing leaves your machine.
