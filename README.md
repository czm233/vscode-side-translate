# Side Translate

Side Translate is a VS Code extension MVP that translates the current Markdown
or plain text document into an editable side preview opened beside the editor.

## Features

- Adds a translate button to the editor title area for Markdown and plain text.
- Translates the current selection, or the full document when there is no selection.
- Detects Chinese-to-English or English-to-Chinese direction automatically.
- Preserves basic Markdown structure and skips fenced code blocks.
- Uses a no-key fastest mode by default, racing Bing Translator and DeepL Free and returning the first successful result.
- Bing Translator, DeepL Free, and Google Translate are available as explicit configurable providers.
- Translates the document in one request where possible, while protecting Markdown code blocks, inline code, and URLs.
- Lets you edit translated Chinese blocks in the side preview, back-translate them, and replace the matching source block.

## Data Disclosure

Side Translate sends selected text or opened document text to the configured
third-party translation provider.

The default `fastest` provider sends text to both Bing Translator and DeepL Free,
then uses the first successful result. If configured explicitly, Side Translate
can also send text to Google Translate.

Do not use this extension with confidential or restricted documents unless your
organization allows sending that content to the selected third-party translation
service.

## Development

```bash
npm install
npm run compile
npm test
npm run marketplace:check
```

Press `F5` in VS Code to launch an Extension Development Host.

`npm run marketplace:check` intentionally fails until `package.json` has a real
Marketplace publisher, a real repository URL, and a LICENSE file.
