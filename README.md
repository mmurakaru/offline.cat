# Welcome to offline.cat!

Free, offline, privacy-first CAT tool. Runs entirely on your device — browser or desktop. No server, no account, no lock-in.

## Why on-device?

offline.cat runs translation on your machine, not a cloud service. This means:

- **Private** - data never leaves the device
- **Fast** - no server round-trip
- **Offline** - works anywhere, no internet required
- **Free** - no API keys, no tokens, no billing

The **web build** uses Chrome's built-in Translator API. Requires Chrome 138+ with [on-device language packs](chrome://on-device-translation-internals/) installed.

The **desktop build** embeds llama.cpp and ships a catalog of small open-weight models ([Gemma 4](https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF), [Qwen 3.5](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), [Phi-4-mini](https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF), and more). Download for macOS / Windows / Linux from [Releases](https://github.com/mmurakaru/offline.cat/releases/latest).

## Built-in APIs (web)

- [Translation API](https://github.com/webmachinelearning/translation-api) - document translation
- [Streams API](https://github.com/whatwg/streams) - streaming translation results *(future)*
- [Writing Assistance APIs](https://github.com/webmachinelearning/writing-assistance-apis) - rewriting, summarization *(future)*
- [Proofreader API](https://github.com/webmachinelearning/proofreader-api) - grammar and spelling checks *(future)*
- [Prompt API](https://github.com/webmachinelearning/prompt-api) - free-form language model access *(future)*
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) - voice dictation

## Docs

- [React Router](https://reactrouter.com/)
- [SQLite Wasm](https://sqlite.org/wasm/doc/trunk/index.md)
- [Tauri v2](https://v2.tauri.app/) + desktop dev setup in [`src-tauri/README.md`](./src-tauri/README.md)

## Getting started

Install the dependencies:

```bash
npm install
```

### Development

Start the web dev server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

For the desktop app (requires Rust + cmake, see [`src-tauri/README.md`](./src-tauri/README.md)):

```bash
npm run tauri:dev
```

## Building for production

Create a production build:

```bash
npm run build
```

### Static hosting

Deploy to Cloudflare Pages:

```bash
npx wrangler pages deploy build/client
```

Or connect the repo to the Cloudflare Pages dashboard with:
- Build command: `npm run build`
- Output directory: `build/client`

## Releasing

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Commit, tag, and push:

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "release v<version>"
git tag v<version>
git push origin v<version>
```

The tag push triggers `.github/workflows/release.yml`, which builds and publishes signed desktop installers per platform plus `latest.json` for the auto-updater.

### Docker Deployment

To build and run using Docker:

```bash
docker build -t offline-cat .

# Run the container
docker run -p 3000:3000 offline-cat
```
