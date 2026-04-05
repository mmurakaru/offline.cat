# Welcome to offline.cat!

Professional CAT tooling that runs entirely in the browser. No server, no account, no lock-in.

## Docs

- [React Router](https://reactrouter.com/)
- [SQLite Wasm](https://sqlite.org/wasm/doc/trunk/index.md)
- [Translator API](https://developer.mozilla.org/en-US/docs/Web/API/Translator_API)

## Getting Started

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

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t offline-cat .

# Run the container
docker run -p 3000:3000 offline-cat
```
