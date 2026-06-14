# Contributing

```bash
npm install
npm run verify   # type-check + lint + tests + build (the gate; keep it green)
npm run watch    # rebuild on change — then F5 to launch the Extension Development Host
npm run vsix     # package a .vsix
```

- Pure logic lives in `vscode`-free modules (`directive`, `output`, `prompt`, `recent`,
  `cleanup`, `symbols`, `color`, `httpStream`, the provider line-parsers) and is unit-tested with
  `node:test`. Keep it that way — push the testable logic out of the `vscode` wiring.
- `verify` must pass before every commit. Provider streaming, parsing, and error paths are covered
  by tests against an injected `fetch`.
