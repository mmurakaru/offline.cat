# offline.cat desktop (Tauri)

The Rust workspace that powers the desktop build. The web build continues to work from the same frontend codebase - this directory only matters when you run `npm run tauri:dev` or `npm run tauri:build`.

See [rfc/0004-tauri-desktop-local-models.md](../rfc/0004-tauri-desktop-local-models.md) for architecture and rationale.

## First-time setup

1. **Install the Rust toolchain.** The frontend Node dependencies are already in `package.json`, but cargo/rustc are not bundled with npm:

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Install the C++ build toolchain.** `llama-cpp-sys-2` compiles llama.cpp from source via CMake, so it needs a C++ compiler and CMake on PATH:

   ```bash
   xcode-select --install   # Xcode Command Line Tools (C++ compiler) - macOS only, skip if `xcode-select -p` already prints a path
   brew install cmake       # CMake build system
   ```

   On Linux, install the equivalent via your distro's package manager (`sudo apt-get install build-essential cmake` on Debian/Ubuntu). On Windows, install Visual Studio Build Tools with the C++ workload and a CMake from the Visual Studio installer or directly.

3. **Generate an updater signing key pair.** Tauri's auto-updater uses Minisign (Ed25519); the public key ships in the binary, the private key stays local:

   ```bash
   npx tauri signer generate -w ~/.tauri/offline-cat.key
   ```

   Paste the generated public key into `src-tauri/tauri.conf.json` - replace the placeholder `REPLACE_WITH_PUBKEY_AFTER_tauri_signer_generate` under `plugins.updater.pubkey`.

4. **Add GitHub repository secrets** before cutting a signed release. Unsigned builds still work locally for testing.

   | Secret | Used for |
   |---|---|
   | `TAURI_SIGNING_PRIVATE_KEY` | Updater artifact signing (Minisign) |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passphrase for the key above |
   | `APPLE_CERTIFICATE` | macOS Developer ID cert (base64 of `.p12`) |
   | `APPLE_CERTIFICATE_PASSWORD` | Passphrase for the `.p12` |
   | `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
   | `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | Notarization via notarytool |
   | `WINDOWS_CERTIFICATE` | Authenticode cert (base64 of `.pfx`) |
   | `WINDOWS_CERTIFICATE_PASSWORD` | Passphrase for the `.pfx` |

4. **Cut a release.** The GitHub Actions workflow at `.github/workflows/release.yml` fires on tag push:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

   The homepage download button on offline.cat points at `github.com/mmurakaru/offline.cat/releases/latest/download/…`, so downloads start working the moment the first tag finishes building.

## Local development

```bash
# Run the app in dev mode (hot reload for the frontend, rebuilds Rust on change)
npm run tauri:dev

# Build release bundles for the current platform
npm run tauri:build
```

Logs: `RUST_LOG=offline_cat_lib=debug npm run tauri:dev`.

## Tests

Rust-side tests cover the pure functions in `engine.rs` (chat-template formatting, stop-marker detection, output cleaning) and the HTTP-level behaviour of `downloader.rs` (happy path, HTTP Range resume, SHA256 mismatch cleanup, server errors, cancellation). The downloader tests spin up a local HTTP mock via [`wiremock`](https://crates.io/crates/wiremock) - no real HuggingFace traffic.

```bash
# From the project root
cd src-tauri && cargo test --lib --no-default-features

# Or with cargo-nextest for faster output (one-time install: `cargo install cargo-nextest --locked`)
cd src-tauri && cargo nextest run --lib --no-default-features

# Run a single test
cd src-tauri && cargo test --lib --no-default-features -- download_resumes_from_existing_partial

# Show println! output during tests
cd src-tauri && cargo test --lib --no-default-features -- --nocapture
```

`--no-default-features` keeps the suite fast by skipping the Metal/CUDA/Vulkan GPU backends - none of the unit or integration tests need them. Frontend tests (vitest) live separately; see the top-level `package.json` scripts.

## Layout

```
src-tauri/
├── Cargo.toml               # llama-cpp-2, tauri, reqwest, tokio
├── tauri.conf.json          # bundle + updater config
├── capabilities/default.json
├── icons/                   # generated from public/favicon via `npx tauri icon`
└── src/
    ├── main.rs              # entrypoint
    ├── lib.rs               # app builder, plugin registration
    ├── catalog.rs           # 8-model catalog (HF repo + chat template)
    ├── engine.rs            # llama.cpp lifecycle + inference loop
    ├── downloader.rs        # HF-backed streaming downloader
    ├── commands.rs          # #[tauri::command] handlers
    └── state.rs             # shared app state
```

## GPU backend feature flags

llama.cpp's platform-appropriate GPU backend is selected at build time via Cargo features:

| Host | Build command |
|---|---|
| macOS (Apple Silicon or Intel) | `npm run tauri:build -- --features metal` |
| Windows or Linux with NVIDIA | `npm run tauri:build -- --features cuda` |
| Cross-vendor GPU | `npm run tauri:build -- --features vulkan` |
| CPU only (fallback) | `npm run tauri:build` |

The release workflow selects the right feature per matrix job automatically.

## Model storage

Downloaded `.gguf` files live under the OS app-data directory:

- macOS: `~/Library/Application Support/cat.offline.app/models/`
- Windows: `%APPDATA%/cat.offline.app/models/`
- Linux: `~/.local/share/cat.offline.app/models/`

Model files survive app updates. `npm run tauri:build` never bundles models - they're downloaded on first use from HuggingFace via `src/downloader.rs`.
