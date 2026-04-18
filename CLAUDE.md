# CLAUDE.md

CAT tool that runs entirely on-device. Two distribution targets from one codebase: a web build that uses Chrome's built-in Translator API, and a Tauri desktop build with a local llama.cpp inference engine. Engine is picked at runtime from a strategy interface in `app/lib/engines/`. See [README.md](README.md) for full project context.

For code style conventions, see [docs/STYLE.md](docs/STYLE.md).
