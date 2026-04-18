# RFC: Tauri Desktop Build with Local LLM Models

**Status:** Draft
**Author:** Markus Murakaru
**Date:** 2026-04-18

---

## Summary

Ship offline.cat as a native desktop application (macOS, Windows, Linux) built with Tauri v2, embedding llama.cpp as an in-process inference engine via the `llama-cpp-2` Rust crate. A user-selectable catalog of eight small open-weight models (≤ ~6 GB quantized, mix of Chinese and Western) replaces the hard dependency on Chrome's Translator API for users who can't or don't want to use Chrome. The existing browser build continues to work unchanged against Chrome's Translator API; the two targets share a single codebase, selecting the translation engine at runtime from a common strategy interface. Distribution is via GitHub Releases with Tauri's built-in auto-updater, code-signed on macOS and Windows, unsigned on Linux.

---

## Strategic context

offline.cat currently exists only as a web application whose translation capability is gated behind Chrome 138+ with the Translator API language packs installed. That is a small fraction of the professional translator population. Firefox and Safari users are excluded entirely. Users on locked-down corporate machines who can't enable a Chrome feature flag are excluded. Users who prefer not to rely on a browser-vendor-specific API for production work are excluded.

The product promise - offline, private, no lock-in, professional CAT tooling - is credible in a browser but stronger as a desktop app. A shipped binary that a translator double-clicks, that keeps working after a browser update or Chrome policy change, that doesn't require explaining "you need Chrome 138 and you have to enable chrome://flags" in the onboarding flow, is a meaningfully better product for the target user.

### Why now

Three things converged in late 2025 and early 2026:

1. **Gemma 4 (April 2026)** ships E2B and E4B variants explicitly tuned for on-device use - 1.5 GB and 2.5 GB quantized, 256K context, 140+ language coverage, multimodal. The intelligence-per-parameter gap between small local models and Chrome's Translator quality has closed for practical translation workloads.
2. **Qwen 3.5 (2026)** ships 0.8B / 2B / 4B / 9B dense small variants, all GGUF-available, 262K context, Apache 2.0. The 9B variant scores 82.5 MMLU-Pro and 81.7 GPQA Diamond, beating prior-generation 30B models at a third the size. Chinese labs are now the strongest source of small multilingual models.
3. **llama.cpp Rust bindings (`llama-cpp-2`)** have matured to the point where embedding inference directly into a Tauri binary is practical, avoiding the 200 MB Ollama sidecar footprint and single-binary UX.

At the same time, the RFC 0003 Rust-WASM parser work (in progress) proves that the project can take on Rust toolchain complexity without destabilizing the React side. Tauri reuses the same cargo-based workflow.

---

## Motivation

**1. Distribution.**
Shipping a desktop binary removes the Chrome feature-flag barrier, the "does my browser have the Translator API" question from onboarding, and the class of users who can't install browser flags on their work machine. The desktop build widens the addressable audience from "Chrome 138+ power users" to "anyone who can install a desktop app."

**2. Privacy story.**
The current site already runs entirely client-side, but users default to assuming otherwise because it's a web page. A native app with a visible process, no network traffic during translation, and offline operation by construction makes the privacy claim self-evident.

**3. Model choice.**
Chrome's Translator API is a black box - users can't pick between models, tune quality, or route per language pair. A local-LLM-backed desktop build exposes a curated catalog of eight small models spanning 1.3 GB to 5 GB, covering ultra-light on-device to mid-range 16 GB RAM machines, with a mix of Chinese and Western labs so users can pick the model whose training distribution best fits their language pair.

**4. Clean abstraction.**
The existing `translateSegments()` function at `app/lib/translator.ts:39` is the single entry point for every translation in the app. Swapping implementations behind it is a strategy-pattern refactor, not a rewrite. The sqlite-wasm TM, the ICE parser layer, the canvas editor (RFC 0002), and the forthcoming Rust-WASM parsers (RFC 0003) are all untouched.

---

## What exists today

### Translation entry point

`app/lib/translator.ts` is the sole integration point with Chrome's Translator API:

```typescript
// app/lib/translator.ts:23
declare const Translator: TranslatorConstructor | undefined;

export async function translateSegments(
  segments: { id: string; source: string }[],
  sourceLanguage: string,
  targetLanguage: string,
  signal: AbortSignal,
  onProgress: (result: TranslateResult) => void,
): Promise<TranslateResult[]> { /* ... */ }
```

`useTranslation` at `app/hooks/useTranslation.ts:47` calls `translateSegments` directly. No abstraction, no wrapper. This is good news - there's exactly one seam to introduce.

### Build target

`react-router.config.ts` sets `ssr: false`. The app is already an SPA. `vite.config.ts` injects COOP/COEP headers for sqlite-wasm OPFS. Assets resolve at `/` today; Tauri's custom protocol needs relative paths.

### i18n

`app/lib/i18n.ts:9` reads the initial locale from `window.location.pathname.split("/")[1]`. URL-based locale routing was added in commit `f9ac53f`. In a Tauri webview loaded from a custom protocol, the pathname is still present but the URL pattern differs, and language shouldn't be coupled to pathname in the desktop build.

### Storage

`app/lib/db-worker.ts` uses sqlite-wasm with OPFS via `new sqlite3.oo1.OpfsDb(...)`. OPFS is supported in both Chromium and WebKit webviews. No change required.

---

## Proposal

### Runtime

**Tauri v2.** Rust-based shell, OS webview for rendering (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux). Picked over Electron because the shipped binary is an order of magnitude smaller (~15 MB vs ~120 MB) and because the Rust side gives us a clean home for the model runtime without a separate node-process tier. Picked over a pure native rewrite because the existing React + sqlite-wasm + ICE + canvas editor stack is working well and a webview preserves it unchanged.

### Inference engine: llama.cpp via `llama-cpp-2`

Inference runs in-process inside the Tauri binary via the `llama-cpp-2` Rust crate, which wraps llama.cpp with safe Rust bindings. No sidecar binary (which would have added ~200 MB per platform for Ollama), no HTTP layer, no separate process lifecycle to manage. Per-platform GPU backends are enabled via Cargo features:

| Platform | Feature flags | Backend |
|----------|---------------|---------|
| macOS | `metal` | Metal (Apple Silicon and Intel) |
| Windows | `cuda`, `vulkan` | CUDA if NVIDIA present, else Vulkan, else CPU |
| Linux | `cuda`, `vulkan` | CUDA if NVIDIA present, else Vulkan, else CPU |

Llama.cpp's native kernels are ~95% of the performance of MLC-LLM on Apple Silicon and parity elsewhere. MLC-LLM was evaluated (see Alternatives) but rejected due to the per-hardware model compilation step and immature Rust bindings.

### Engine abstraction

A `TranslationEngine` strategy interface replaces the direct Chrome API call. Two implementations ship:

```typescript
// app/lib/engines/types.ts
export interface TranslationEngine {
  id: "chrome" | "llama-cpp";
  isAvailable(source: string, target: string): Promise<boolean>;
  translate(
    segments: { id: string; source: string }[],
    source: string,
    target: string,
    signal: AbortSignal,
    onProgress: (r: TranslateResult) => void,
  ): Promise<TranslateResult[]>;
}
```

- `ChromeTranslatorEngine` (`app/lib/engines/chrome-translator.ts`) - extracted verbatim from today's `translator.ts`.
- `LlamaCppEngine` (`app/lib/engines/llama-cpp.ts`) - a thin client that invokes Tauri commands.

Runtime selection happens in `app/lib/engines/registry.ts`:

```typescript
export function getActiveEngine(): TranslationEngine {
  if (typeof window === "undefined") return chromeTranslatorEngine;
  if ((window as { isTauri?: boolean }).isTauri === true) {
    return llamaCppEngine;
  }
  return chromeTranslatorEngine;
}
```

`window.isTauri` has been the blessed runtime detection flag since Tauri 2.0.0-beta.9. Earlier unofficial checks (`__TAURI__`, `__TAURI_INTERNALS__`) are not guaranteed to exist across all configurations.

`app/lib/translator.ts` becomes a three-line shim that re-exports `translateSegments` pointing at the active engine. `useTranslation` (`app/hooks/useTranslation.ts`) is untouched - the signature is preserved.

### Model catalog

Eight small open-weight models, mixed Chinese and Western lab origins, top picks from 2026 benchmarks:

| # | Model | Lab | Origin | HF repo (verified) | ~Q4 size | Context | Notes |
|---|-------|-----|--------|---------------------|----------|---------|-------|
| 1 | Gemma 4 E2B | Google | US | `unsloth/gemma-4-E2B-it-GGUF` | 1.5 GB | 256K | Best ultra-light; 140 languages; on-device tuned |
| 2 | Qwen 3.5 2B | Alibaba | CN | `unsloth/Qwen3.5-2B-GGUF` | 1.3 GB | 262K | Chinese ultra-light; Apache 2.0 |
| 3 | Gemma 4 E4B | Google | US | `unsloth/gemma-4-E4B-it-GGUF` | 2.5 GB | 256K | Balanced Western default; 140 languages |
| 4 | Phi-4-mini 3.8B | Microsoft | US | `unsloth/Phi-4-mini-instruct-GGUF` | 2.5 GB | 128K | 83.7% ARC-C, top small-model reasoning |
| 5 | Qwen 3.5 4B | Alibaba | CN | `unsloth/Qwen3.5-4B-GGUF` | 2.5 GB | 262K | Chinese balanced; strong CJK |
| 6 | Llama 3.3 8B | Meta | US | `unsloth/Llama-3.3-8B-Instruct-GGUF` | ~5 GB | 128K | Western mid-tier; widely supported; safe generalist |
| 7 | GLM-4 9B | Zhipu / Z.AI | CN | `zai-org/GLM-4-9B-0414-GGUF` (to verify) | ~5 GB | 128K | Strong Chinese + English; MGSM leader in family |
| 8 | Qwen 3.5 9B | Alibaba | CN | `unsloth/Qwen3.5-9B-GGUF` | ~5 GB | 262K | 82.5 MMLU-Pro, 81.7 GPQA; long-form pick |

Origin balance: five Western (all US), three Chinese. Mistral Small 3 was considered for European representation but its smallest variant is 24B (~14 GB Q4), violating the small-models constraint. Ministral 3B exists but overlaps with Qwen 3.5 4B and Phi-4-mini without adding benchmark value. Llama 3.3 8B replaces the Mistral slot as the community-default mid-tier generalist. The size ladder spans 1.3 GB to 5 GB so every user's laptop fits at least half the catalog, and there is no 15-30 GB power-user tier.

**Long-form content note.** Kimi K2 / K2.5 (Moonshot AI) was evaluated for long-form content. Its 1T-parameter MoE architecture with 32B activated parameters means even at 2-bit quantization it weighs ~250 GB, out of scope for local consumer hardware. Long-form content is instead served by Qwen 3.5 9B (262K context) and Gemma 4 E4B (256K context), both of which comfortably fit a book-length document in a single context window.

**Availability verification.** Exact HuggingFace repository names and GGUF quant filenames for Gemma 4 E2B/E4B, Qwen 3.5 sizes, Mistral Small 3, and GLM-4 9B are subject to change. `app/lib/models.ts` encodes each entry with a `hf_repo` and `hf_file`, and the Rust downloader verifies SHA256 against a catalog-shipped hash. If a repo is renamed or a file reorganized, the catalog is patched; the rest of the code stays fixed.

### Model catalog entry shape

```typescript
// app/lib/models.ts
export interface CatalogEntry {
  id: string;                        // "gemma-4-e2b"
  label: string;                     // "Gemma 4 E2B"
  lab: string;                       // "Google"
  origin: "US" | "EU" | "CN";
  sizeBytes: number;                 // expected Q4 size for RAM-fit hints
  contextTokens: number;
  hfRepo: string;                    // "google/gemma-4-e2b-gguf"
  hfFile: string;                    // "gemma-4-e2b-Q4_K_M.gguf"
  sha256: string;
  recommendedFor: string[];          // ["general", "low-ram", "long-form"]
}

export const MODEL_CATALOG: CatalogEntry[] = [ /* eight entries */ ];
```

### Rust workspace layout

```
src-tauri/
├── Cargo.toml                     # llama-cpp-2, tauri, reqwest, tokio, futures, sha2
├── tauri.conf.json                # bundle, updater, capabilities
├── build.rs
├── icons/
└── src/
    ├── main.rs                    # Tauri entrypoint, state wiring
    ├── engine.rs                  # LlamaModel + LlamaContext lifecycle
    ├── downloader.rs              # HF-backed GGUF downloader, resume, hash check
    └── commands.rs                # #[tauri::command] handlers
```

### Model downloader

A thin HuggingFace-backed downloader written in Rust, not a dependency. Streams a single GGUF file from `https://huggingface.co/{hf_repo}/resolve/main/{hf_file}` via `reqwest`, writes to `{app_data_dir}/models/{id}.gguf.partial` atomically, verifies SHA256 on completion, renames to the final filename. Resumable on interrupt via HTTP Range. Progress streamed to the frontend via a Tauri v2 `Channel<T>`:

```rust
// src-tauri/src/downloader.rs (sketch)
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum DownloadEvent {
    Started { total_bytes: u64 },
    Progress { bytes_downloaded: u64 },
    Finished,
    Failed { message: String },
}

#[tauri::command]
async fn download_model(
    id: String,
    on_event: tauri::ipc::Channel<DownloadEvent>,
    state: tauri::State<'_, AppState>,
) -> Result<(), DownloadError> {
    on_event.send(DownloadEvent::Started { total_bytes }).ok();
    // ... stream, hash, atomic rename ...
    on_event.send(DownloadEvent::Finished).ok();
    Ok(())
}
```

`Channel<T>` is the Tauri v2 recommendation for streamed data (ordered, type-safe, lower overhead than the event system). The frontend creates a channel, attaches `.onmessage`, and passes it as a command argument.

Storage layout:

```
{app_data_dir}/
  models/
    gemma-4-e2b.gguf
    qwen-3.5-4b.gguf
    ...
  active-model.txt            # id of the currently loaded model
```

### Settings UI

`app/routes/settings.tsx` renders the eight-model catalog grouped by size tier (≤2 GB, 2-4 GB, 4-6 GB), shows install status, download/remove buttons, progress bars, a radio to set the active model (persisted in `localStorage`), and RAM-fit warnings based on `navigator.deviceMemory`. First-run behaviour: if no model is installed, the user is routed to `/settings` before they can reach `/translate/:fileId`.

### First-run flow

1. App launches. Rust side checks `{app_data_dir}/models/` for any existing GGUF file.
2. If none: frontend routes to `/settings`, shows the catalog, prompts the user to pick a first model. Recommended default is Gemma 4 E4B (balanced).
3. Model downloads with visible progress. Hash verification on completion.
4. Rust loads the model into a `LlamaModel` + `LlamaContext` pair, cached in a `tokio::sync::Mutex<Option<ActiveModel>>`.
5. User can now translate. Active model selection persists across restarts.

---

## Tauri command protocol

The frontend and Rust side communicate via `#[tauri::command]` handlers. Three surfaces: catalog/state, model lifecycle, translation.

### Commands

```rust
// src-tauri/src/commands.rs

#[tauri::command]
fn list_catalog(state: State<AppState>) -> Vec<CatalogEntryWithStatus> { /* ... */ }

#[tauri::command]
async fn download_model(
    id: String,
    on_event: Channel<DownloadEvent>,
    state: State<'_, AppState>,
) -> Result<(), DownloadError> { /* ordered progress via Channel<T> */ }

#[tauri::command]
async fn delete_model(id: String, state: State<'_, AppState>) -> Result<(), Error> { /* ... */ }

#[tauri::command]
async fn load_model(id: String, state: State<'_, AppState>) -> Result<(), Error> { /* ... */ }

#[tauri::command]
async fn unload_model(state: State<'_, AppState>) -> Result<(), Error> { /* ... */ }

#[tauri::command]
async fn translate(
    segments: Vec<Segment>,
    source_lang: String,
    target_lang: String,
    on_progress: Channel<TranslateProgress>,
    state: State<'_, AppState>,
) -> Result<Vec<TranslateResult>, TranslateError> { /* streams per-segment results via Channel<T> */ }

#[tauri::command]
fn cancel_translate(state: State<AppState>) { /* flips an AtomicBool checked inside the translate loop */ }
```

### Data boundary

```
React (app)                                   Rust (src-tauri)
-----------                                   ----------------
const onProgress = new Channel<...>()
onProgress.onmessage = (r) => updateUi(r)
invoke("translate", { segments, onProgress })  #[tauri::command] async fn translate(
    |                                              segments, ..., on_progress: Channel<...>
    |                                          ) {
    |                                              for segment in segments {
    |                                                  let prompt = format_prompt(...);
    |                                                  let translation = ctx.eval_and_sample(prompt);
    |                                                  on_progress.send(TranslateProgress {
onProgress.onmessage receives        <────────            id, translation
each segment as it completes                          }).ok();
                                                  }
                                              }
```

Temperature is pinned to 0 for determinism. The prompt template lives in `src-tauri/src/engine.rs` and is tuned per model family where necessary (chat template differences between Gemma, Qwen, Mistral, GLM, Phi). `app/lib/engines/prompts.ts` keeps a frontend-side fallback for test fixtures.

### Cancellation

`AbortSignal` on the frontend side triggers a `cancel_translate` invocation. The Rust loop checks an `AtomicBool` between segments and returns early. Partial results collected before cancellation are still committed.

---

## Migration order (phases)

**Phase 0 - RFC (this document).** Written before implementation starts; updated as decisions change.

**Phase 1 - Engine abstraction refactor.** Extract Chrome Translator into `app/lib/engines/chrome-translator.ts`, introduce `TranslationEngine` interface at `app/lib/engines/types.ts`, registry at `app/lib/engines/registry.ts`, rewrite `app/lib/translator.ts` as a shim. Web build continues to work end-to-end with zero behaviour change.

**Phase 2 - Tauri scaffold.** `src-tauri/` project, `npm run tauri:dev` runs the existing SPA inside a Tauri window. Fix Vite `base: "./"` for the `tauri://` protocol. Add `localStorage["lang"]` fallback in `app/lib/i18n.ts`. Guard service worker registration in `public/service-worker.js`. No model integration yet.

**Phase 3 - llama.cpp integration.** Link `llama-cpp-2`, implement `src-tauri/src/engine.rs` with a hardcoded test model path, prove end-to-end inference from a Tauri command.

**Phase 4 - Model downloader.** `src-tauri/src/downloader.rs` with streaming download, resume, SHA256 verification, progress events.

**Phase 5 - `LlamaCppEngine` + settings UI.** Wire `app/lib/engines/llama-cpp.ts` to Tauri commands, build `app/routes/settings.tsx`, first-run prompt, cancel handling, RAM-fit warnings.

**Phase 6 - CI + signing + updater.** `.github/workflows/release.yml` with macOS/Windows/Linux matrix, code signing on macOS (Developer ID + notarytool) and Windows (Authenticode), Tauri updater manifest.

Each phase merges to `main` independently. The web build stays functional at every step.

---

## Performance expectations

### Inference throughput

Rough estimates for translation workloads (short sequential generations, 50-150 output tokens per segment) at Q4_K_M quantization:

| Model | M2/M3 MacBook (Metal) | RTX 4060 (CUDA) | CPU-only (8 cores) |
|-------|-----------------------|-----------------|---------------------|
| Gemma 4 E2B | 80-120 tok/s | 120-180 tok/s | 25-40 tok/s |
| Gemma 4 E4B | 50-80 tok/s | 80-120 tok/s | 15-25 tok/s |
| Phi-4-mini 3.8B | 50-80 tok/s | 80-120 tok/s | 15-25 tok/s |
| Qwen 3.5 4B | 50-80 tok/s | 80-120 tok/s | 15-25 tok/s |
| Mistral Small 3 ~7B | 30-50 tok/s | 50-80 tok/s | 8-15 tok/s |
| GLM-4 9B / Qwen 3.5 9B | 20-40 tok/s | 40-70 tok/s | 5-10 tok/s |

For a typical 100-segment document (average source length ~15 words, output ~20 tokens each), total translation time on an M-series Mac ranges from ~30 seconds on Gemma 4 E2B to ~3 minutes on Qwen 3.5 9B. Chrome's Translator API today is faster per segment but the comparison isn't apples-to-apples - Chrome uses a purpose-built MT model, while local LLMs give the user quality/speed knobs.

### Binary size

- Tauri shell + web assets: ~6-10 MB.
- Llama.cpp linked library: ~8-15 MB depending on backend features.
- Total installer: **15-25 MB per platform.**
- Models are not bundled. First-run download of the recommended default (Gemma 4 E4B) is ~2.5 GB.

### RAM footprint

Model memory ≈ Q4 file size × 1.2 (KV cache and overhead). Gemma 4 E2B fits comfortably on an 8 GB laptop; Qwen 3.5 9B requires 16 GB. The settings UI surfaces this via `navigator.deviceMemory` comparisons.

---

## Risks and mitigations

**1. Translation quality regression vs Chrome Translator.**
General-purpose LLMs are weaker than purpose-built MT systems on terminology consistency, especially across long documents. The translator deserves to know this up-front.
*Mitigations:* temperature 0, strict prompts ("output only the translation, no explanations, no code fences"), TM short-circuit still applies before the engine is called, future RFC for glossary injection from TM. The web build remains available for users who prefer Chrome Translator output.

**2. Catalog availability drift.**
HuggingFace repo names change, files get reorganized, quantization filenames vary per uploader. A hardcoded catalog will rot.
*Mitigations:* each catalog entry encodes `hf_repo`, `hf_file`, `sha256`. Downloader verifies hash; mismatch surfaces a clear error. A future `catalog-manifest.json` served from the offline.cat domain could let the app update its catalog without a binary update, similar to Tauri's updater manifest.

**3. GPU backend fragmentation.**
Llama.cpp's CUDA, Metal, and Vulkan backends have different maturity. A user with an exotic GPU may hit backend-specific bugs.
*Mitigations:* cascading fallback at runtime - if CUDA init fails, try Vulkan; if that fails, CPU. A telemetry-free startup log in the settings UI surfaces which backend was selected so the user can report issues.

**4. macOS and Windows signing costs.**
$99/year for Apple, $200-400/year for Authenticode. Real ongoing cost.
*Mitigations:* Linux ships unsigned from day 1. Apple signing is paid from project launch (required for distribution). Windows signing can be deferred to post-launch if SmartScreen friction is tolerable during early access; EV cert upgrade path exists when traction warrants it.

**5. Auto-update security.**
A compromised updater can push arbitrary code.
*Mitigations:* Tauri's updater uses Ed25519-signed manifests. Private key is a GitHub Actions secret scoped to the release workflow only; public key is compiled into the binary. No unsigned update is ever trusted.

**6. Model download abuse.**
HuggingFace may rate-limit a popular app. First-run 2.5 GB downloads across many users hit hard.
*Mitigations:* downloader uses conservative timeouts and retries. If rate limiting becomes visible, mirror popular models on Cloudflare R2 and add `hf_mirror` to each catalog entry.

**7. Chrome engine divergence.**
As Chrome's Translator API evolves, the web and desktop builds may diverge in behaviour (supported language pairs, quality).
*Mitigations:* both engines implement the same `TranslationEngine` interface; divergence is surfaced as a UI feature flag ("this language pair is supported in the Chrome build but not by the currently selected model"). The engine layer is the only place this logic lives.

---

## Alternatives considered

**Ollama as a sidecar.**
Bundle the Ollama binary as a Tauri sidecar. Fastest to integrate: OpenAI-compatible HTTP API, `ollama pull` handles model downloads, huge library. Rejected because Ollama adds ~200 MB per platform to the installer and runs a persistent background server process. Ollama wraps llama.cpp internally, so performance is identical to embedding llama.cpp directly. For a single-feature app (local translation), the overhead isn't worth the developer-time savings.

**MLC-LLM.**
10-30% faster than llama.cpp on Apple Silicon via compiled Metal kernels. Rejected because MLC requires a per-hardware model compilation step and its Rust bindings are immature. Integration cost is weeks higher than llama.cpp for a performance delta most users won't perceive on segment-by-segment translation (where KV cache setup dominates short-generation latency).

**mistral.rs.**
Pure-Rust inference, no C++ FFI. Rejected because throughput on quantized GGUF is currently 70-90% of llama.cpp's. Worth revisiting in a year.

**Electron instead of Tauri.**
Ships a bundled Chromium, so the Chrome Translator API *might* work inside an Electron app without any local LLM work. Rejected because (a) Electron's bundled Chromium doesn't ship the Translator API language packs out of the box, (b) the installer is ~100 MB larger than Tauri's, and (c) we'd still end up wanting a local LLM option for users who don't have the language packs.

**WebLLM (MLC in-browser).**
Runs in-browser via WebGPU. Rejected for the desktop build because WebGPU support in Tauri webviews is uneven (WKWebView has it only in Safari 26+, WebKitGTK is shaky), negating the desktop-app rationale. WebLLM remains a plausible future target for the web build if Chrome Translator ever becomes unreliable.

**Require the user to install Ollama separately.**
Smallest installer. Rejected because the target user (professional translator) should not be asked to install a second tool to run a translation app.

---

## What doesn't change

- The React / React Router v7 frontend.
- The sqlite-wasm + OPFS storage layer (`app/lib/db.ts`, `app/lib/db-worker.ts`).
- The translation memory schema, scoring, and Levenshtein matching (`app/lib/translation-memory.ts`).
- The ICE parser abstraction (`app/lib/ice/parser-interface.ts`) and adapters.
- The parsers themselves, including the forthcoming Rust-WASM rewrite (RFC 0003).
- The canvas editor (RFC 0002).
- The file upload and segment editor UX.
- `useTranslation` (`app/hooks/useTranslation.ts`) - the signature it consumes is preserved.
- The web build and its dependency on Chrome's Translator API.

The desktop build is additive. Dropping it in the future would require reverting two phases (2 and 3-6); the engine abstraction (phase 1) is valuable on its own and would stay.

---

## Distribution

**Release channel:** GitHub Releases + Tauri's built-in auto-updater. No separate infrastructure.

**Bundles per platform:**

| Platform | Artifact | Signing | Annual cost |
|----------|----------|---------|-------------|
| macOS arm64 + x64 | `.dmg` + `.app` | Apple Developer ID + notarytool | $99 |
| Windows x64 | `.msi` (WiX) or `.exe` (NSIS) | Authenticode OV or EV | $200-400 |
| Linux x64 | `.AppImage` + `.deb` | None | $0 |

**Updater:** `tauri-plugin-updater` signs artifacts with **Minisign** (Ed25519 under the hood). Key pair generated via `tauri signer generate`. Public key in `tauri.conf.json` under `plugins.updater.pubkey`; private key as a GitHub Actions secret (`TAURI_SIGNING_PRIVATE_KEY`). Manifest (`latest.json`) published as a GitHub Release asset. Updates are binary; models persist across updates in `app_data_dir()`. Requires companion plugins `tauri-plugin-dialog` (update prompt) and `tauri-plugin-process` (app relaunch).

**CI:** `.github/workflows/release.yml` with a matrix over `macos-14` (arm64), `macos-13` (x64), `windows-latest`, `ubuntu-22.04`. Each job: Rust + Node install, llama.cpp build with platform GPU backend, `npm run tauri:build`, sign + notarize (macOS) / sign (Windows), upload artifacts + `latest.json` to the release.

**Launch surfaces:**
1. GitHub Releases (day 1).
2. offline.cat direct download links (day 1).
3. Homebrew cask (`brew install --cask offline-cat`) - 1-2 weeks post-launch.
4. Winget manifest for Windows - 1-2 weeks post-launch.
5. Mac App Store / Microsoft Store - deferred; sandboxing restrictions on arbitrary model downloads make submission painful, not worth it at launch.

---

## Open questions

1. **Is a "download all eight models" option worth surfacing in the settings UI, or should we keep the flow one-at-a-time?** Argument for: users with fast connections prefer one action. Argument against: ~23 GB of combined models is aggressive for a click, and we'd want a confirmation modal that spells out disk cost.
2. **Should the settings UI let users paste a HuggingFace `repo/file` pair to sideload arbitrary GGUF models?** Powerful for expert users, risky for the catalog's curated-feel.
3. **Should the web build warn users about the desktop build when Chrome Translator isn't available, rather than just failing?** Low-effort UX win, but introduces a platform-detection surface to the web code.
4. **Do we ship a Linux ARM64 build?** AppImage on Raspberry Pi 5 class devices is technically possible but llama.cpp performance on ARM Linux is limited. Defer unless requested.
5. **Do we add Qwen-MT (Alibaba's translation specialist) as a ninth "dedicated MT" option?** Would need verification of small-variant availability; if yes, it likely outperforms general LLMs on pure translation. Possibly a follow-up RFC.

---

## References

- `app/lib/translator.ts` - today's Chrome Translator integration.
- `app/hooks/useTranslation.ts` - the consumer of `translateSegments`.
- `app/lib/i18n.ts` - locale detection that needs a localStorage fallback for Tauri.
- `vite.config.ts` - Vite build config, needs conditional `base` for Tauri.
- `react-router.config.ts` - already SPA-mode.
- `rfc/0002-document-canvas-editor.md` - canvas editor, untouched by this work.
- `rfc/0003-rust-wasm-parsers.md` - parser rewrite, untouched by this work.
- Tauri v2 documentation: https://v2.tauri.app/
- Tauri Channel API (streaming): https://v2.tauri.app/develop/calling-frontend/
- `llama-cpp-2` crate (v0.1.143): https://crates.io/crates/llama-cpp-2 / https://docs.rs/llama-cpp-2
- Llama-cpp-rs example (simple inference): https://github.com/utilityai/llama-cpp-rs/tree/main/examples/simple
- Tauri updater: https://v2.tauri.app/plugin/updater/
- Gemma 4 announcement: https://blog.google/technology/developers/gemma-4/
- Qwen 3.5 small series: https://qwen.ai/
- HuggingFace GGUF model hosting conventions.
