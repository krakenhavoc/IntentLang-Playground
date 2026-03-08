# IntentLang Playground

Interactive web playground for [IntentLang](https://github.com/krakenhavoc/IntentLang) — write specs, validate them, and simulate runtime execution in the browser.

## Quick Start

```bash
# Install prerequisites
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Build and serve
make serve
```

## Build

```bash
make build    # compile WASM + bundle CodeMirror
make clean    # remove build artifacts
make serve    # build + dev server on localhost:8080

# With AI generation proxy (any OpenAI-compatible API):
AI_API_BASE=http://localhost:11434/v1 make serve
```

## Architecture

- `crates/playground-wasm/` — Rust WASM bindings wrapping IntentLang crates
- `web/` — Static site (vanilla JS + CodeMirror 6)
  - `app.js` — Main application logic
  - `editor.js` — CodeMirror setup with `.intent` syntax highlighting
  - `runtime.js` — WASM bridge (parse, check, execute, format)
  - `examples.js` — Preloaded example specs with request fixtures
  - `generate.js` — AI generation (optional, requires API key)

## Deployment

Static site on Cloudflare Pages:

```bash
npx wrangler pages deploy web/
```

## WASM API

The playground exposes four functions from the IntentLang toolchain:

- `check(source)` — Parse and validate a `.intent` spec
- `execute(source, request)` — Compile and run an action against state
- `inspect(source)` — Extract module info (entities, actions, invariants)
- `fmt(source)` — Format source to canonical style
