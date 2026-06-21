# NyxCode for VS Code

Syntax highlighting and editor configuration for [NyxCode](https://nyxcode.io) —
the AI-native, token-efficient full-stack language. One `.nyx` file = a full app.

## Features

- Syntax highlighting for `.nyx` files: keywords, declarations (`page`,
  `component`, `table`, `api`, `store`, …), control flow, the `??` / `?.`
  operators, `${…}` interpolation, hex colors, CSS units, routes, and components.
- Comment toggling (`//`, `/* */`), bracket matching, auto-closing pairs, and
  indentation rules.

## Install (local / development)

```bash
# from the repo root
cp -r editors/vscode ~/.vscode/extensions/nyxcode-0.53.0
# then reload VS Code
```

Or package it with [`vsce`](https://github.com/microsoft/vscode-vsce):

```bash
cd editors/vscode
npx @vscode/vsce package
code --install-extension nyxcode-0.53.0.vsix
```

## Grammar

The TextMate grammar in `syntaxes/nyxcode.tmLanguage.json` is derived directly
from the NyxCode lexer's keyword table, so highlighted keywords stay in sync with
the language. Scope name: `source.nyx`.
