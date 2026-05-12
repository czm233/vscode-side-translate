# Repository Instructions

## Marketplace Publishing Gate

- After changing extension behavior, UI, commands, settings, or translation providers, run `npm run compile`, `npm test`, and `npm audit` before considering the work done.
- If the change touches `package.json`, README disclosure, provider behavior, publishing metadata, `.vscodeignore`, packaging, or Marketplace readiness, also run `npm run marketplace:check`.
- Before preparing a VS Code Marketplace release, run `npm run marketplace:check`.
- Do not publish if the marketplace check fails.
- Keep README disclosure in sync with every translation provider. If document text can be sent to a third-party translation service, README must say so explicitly.
- Do not set `publisher` to `local` for a Marketplace release.
- In the final response for any code change, report which checks were run and whether they passed.
- Do not add Codex agent TOML files unless their `model` field is `gpt-5.5`.
