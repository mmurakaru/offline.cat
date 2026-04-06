# Welcome to offline.cat!

Professional CAT tooling that runs entirely in the browser. No server, no account, no lock-in.

## Why built-in APIs?

offline.cat uses the browser's built-in AI models instead of cloud APIs or bundled models. This means:

- **Private** - data never leaves the device
- **Fast** - no server round-trip
- **Offline** - works anywhere, no internet required
- **Free** - no API keys, no tokens, no billing

Requires Chrome 138+ with [on-device language packs](chrome://on-device-translation-internals/) installed.

Future consideration: hybrid mode where users can optionally bring their own model (cloud API or local) for higher quality output, while the built-in model remains the zero-config default.

## Built-in APIs

- [Translation API](https://github.com/webmachinelearning/translation-api) - document translation
- [Streams API](https://github.com/whatwg/streams) - streaming translation results *(future)*
- [Writing Assistance APIs](https://github.com/webmachinelearning/writing-assistance-apis) - rewriting, summarization *(future)*
- [Proofreader API](https://github.com/webmachinelearning/proofreader-api) - grammar and spelling checks *(future)*
- [Prompt API](https://github.com/webmachinelearning/prompt-api) - free-form language model access *(future)*
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) - voice dictation *(future)*

## Docs

- [React Router](https://reactrouter.com/)
- [SQLite Wasm](https://sqlite.org/wasm/doc/trunk/index.md)

## Getting started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

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

### Docker Deployment

To build and run using Docker:

```bash
docker build -t offline-cat .

# Run the container
docker run -p 3000:3000 offline-cat
```
