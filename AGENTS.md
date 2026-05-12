# Repository Instructions

## Marketplace Publishing Gate

- Before preparing a VS Code Marketplace release, run `npm run marketplace:check`.
- Do not publish if the marketplace check fails.
- Keep README disclosure in sync with every translation provider. If document text can be sent to a third-party translation service, README must say so explicitly.
- Do not set `publisher` to `local` for a Marketplace release.
- Do not add Codex agent TOML files unless their `model` field is `gpt-5.5`.
