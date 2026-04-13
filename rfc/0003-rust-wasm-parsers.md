# RFC: Rust WASM Parser Rewrite

**Status:** Draft
**Author:** Markus Murakaru
**Date:** 2026-04-13

---

## Summary

Rewrite offline.cat's document parsers in Rust, compiled to WebAssembly via `wasm-pack`. The parsers run in the existing web worker. The rest of the app - React UI, SQLite storage, translation engine, worker protocol - doesn't change. The goal is faster parsing of large documents, particularly the XML parsing and tree traversal that dominate parse time for DOCX and PPTX.

---

## Strategic context

offline.cat parses four document formats: XLIFF, HTML, DOCX, and PPTX. The parsers are the foundation everything else builds on - the canvas editor (RFC 0002), TM population, and file reconstruction all depend on correct, fast extraction of translatable segments and document layout.

The current TypeScript parsers work. They're tested, they handle real documents, and they run in a web worker to keep the UI responsive. But they have a performance ceiling. A 100-slide PPTX with images and master slide inheritance means: unzip the archive, parse dozens of XML files, walk deeply nested OpenXML trees with optional chaining chains ten levels deep, build layout objects for every shape on every slide, and do it all in JavaScript's single-threaded GC'd runtime. For a professional translator working with large decks daily, this latency matters.

Rust compiled to WASM is the most mature, highest-performance path for moving CPU-bound work out of JavaScript while staying in the browser. The WASM toolchain (`wasm-pack`, `wasm-bindgen`) has years of production use. The XML and ZIP crates are battle-tested. The offline promise holds - no server, no native binaries, everything runs in the worker.

### Why now

The canvas editor (RFC 0002) increased the surface area of parsing. Before, parsers only needed to extract flat segment lists. Now they extract full document layouts - page dimensions, paragraph styles, shape geometry, text region positions, embedded images. The PPTX parser alone grew to 1,560 lines. As format support deepens (grouped shapes, master slide resolution, chart text extraction), this complexity compounds in TypeScript. Rust's type system and the performance headroom from WASM give a better foundation for that growth.

---

## Motivation

**1. Large document performance.**
A 50-page DOCX or 100-slide PPTX takes noticeable time to parse. The primary bottleneck is XML parsing: `fast-xml-parser` builds a full JavaScript object tree in memory, allocating a JS object for every XML element and a string for every attribute. For a large OpenXML document with tens of thousands of nodes, this creates heavy GC pressure. Rust's `quick-xml` does zero-copy parsing - it reads directly from the byte buffer without allocating strings for every node. No GC, no object overhead, predictable memory.

**2. Tree traversal correctness.**
The PPTX parser has hundreds of lines like `node?.['a:rPr']?.[0]?.['a:solidFill']?.[0]?.['a:srgbClr']?.[0]?.[':@']?.['@_val']`. Each `?.` is a potential silent failure - if the path doesn't match, you get `undefined` and move on without knowing you missed data. Rust's enums and pattern matching make this explicit: every branch is handled, and the compiler tells you when you forgot one.

**3. Lossless round-trip confidence.**
File reconstruction - modifying document XML and repacking the ZIP - is the riskiest operation in the app. A dropped attribute or misplaced namespace breaks the output file. Rust's type system and ownership model make it harder to accidentally discard structure during transformation.

**4. The parsing layer is isolated.**
The parsers sit behind the `FormatParser` interface (`app/lib/ice/parser-interface.ts`). Each format is an adapter registered in `app/lib/ice/adapters/registry.ts`. The worker calls `getParser(ext).parse(data)` and returns a `ParseResult` - it doesn't know or care whether the adapter wraps JavaScript or WASM. Swapping a format to Rust means writing a new adapter and changing one import line. The worker, the client API, and the entire UI stay untouched.

---

## What exists today

### Parser files

| File | Lines | Format | Approach |
|------|-------|--------|----------|
| `app/lib/parsers/xliff.ts` | 120 | XLIFF 1.2/2.0 | `fast-xml-parser` with `preserveOrder` |
| `app/lib/parsers/html.ts` | 122 | HTML | Regex-based tag tokenization |
| `app/lib/parsers/docx.ts` | 680 | DOCX (OpenXML) | `fast-xml-parser` + `fflate` |
| `app/lib/parsers/pptx.ts` | 1,590 | PPTX (OpenXML) | `fast-xml-parser` + `fflate` |
| `app/lib/distribute-text.ts` | 102 | - | Proportional text distribution across runs |
| `app/lib/html-preprocessor.ts` | 95 | HTML | Annotates HTML with `data-segment-id` |

### ICE abstraction layer

Each parser is wrapped by an adapter that implements the `FormatParser` interface (`app/lib/ice/parser-interface.ts`):

```typescript
interface FormatParser {
  extensions: string[];
  parse(data: Uint8Array): ParseResult;
  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array;
}
```

`ParseResult` contains segments, an `EditorModel` (discriminated union on `mode`: `"slide"` | `"page"` | `"html-preview"` | `"segment-list"`), and extracted images. The editor model types live in `app/lib/ice/editor-model.ts` with normalized naming (`sizePt`, `Shape`, `ParagraphStyle`).

Adapters (`app/lib/ice/adapters/`) wrap the raw parsers and map their output to the unified types. A registry (`app/lib/ice/adapters/registry.ts`) maps file extensions to adapters.

### Dependencies

- `fast-xml-parser` (v5.5.10) - XML parsing and building with `preserveOrder` mode
- `fflate` (v0.8.2) - ZIP compression/decompression

### Architecture

```
parser-client.ts: parseFile(data, ext)
  -> postMessage { action: "parse", data, ext }
  -> parser.worker.ts
    -> registry.getParser(ext).parse(data)
    -> returns { segments, editorModel, images }
  -> postMessage back to main thread
  -> convert image bytes to blob URLs
  -> return ParseFileResult
```

The worker handles two actions: `parse` (returns segments + editor model + images in one round-trip) and `reconstruct` (returns translated file bytes). The DOCX and PPTX parsers expose `*FromFiles` variants that accept a pre-unzipped file map, so each adapter only calls `unzipSync` once.

---

## Proposal

### Compilation path

```
Rust source (.rs)
  -> cargo + wasm-pack (build)
  -> .wasm + JS bindings (wasm-bindgen generated)
  -> Vite (bundle into worker)
```

`wasm-pack` wraps `cargo build --target wasm32-unknown-unknown` and `wasm-bindgen` to produce a `.wasm` file plus generated JS/TS bindings. The bindings handle type marshaling between JS and WASM automatically. This is the standard Rust-to-browser pipeline with years of production use.

### Rust dependencies (crates)

| Crate | Purpose | Why this one |
|-------|---------|-------------|
| `quick-xml` | XML parsing and writing | Zero-copy parsing from byte slices. Handles namespaces. Reads and writes XML without building a full DOM - you iterate events (start tag, text, end tag) and extract what you need. Used by `calamine`, `docx-rs`, and other document-processing crates. |
| `zip` | ZIP reading and writing | Wraps `flate2`/`miniz_oxide` (pure Rust DEFLATE). Reads ZIP entries by name, writes new archives. Mature, well-maintained. |
| `serde` + `serde_json` | JSON serialization | Standard Rust serialization. Derive macros generate (de)serialization code from struct definitions. Layout types serialize to JSON automatically for JS consumption. |
| `wasm-bindgen` | WASM-JS interop | Generates JS bindings from Rust function signatures. Handles `Uint8Array` <-> `Vec<u8>`, `String` <-> `JsValue` conversion. |

All dependencies are pure Rust - no C bindings, no system libraries. Everything compiles to WASM cleanly.

### Build toolchain

| Tool | Purpose |
|------|---------|
| `rustup` | Rust toolchain installer |
| `cargo` | Rust package manager and build system |
| `wasm-pack` | Builds Rust to WASM + generates JS bindings |
| `wasm32-unknown-unknown` target | WASM compilation target (installed via `rustup target add`) |

### Project layout

```
rust/
  Cargo.toml
  src/
    lib.rs                  # wasm-bindgen entry points
    segment.rs              # shared segment types + serde
    zip_archive.rs          # ZIP read/write helpers
    xml_util.rs             # quick-xml helpers (find child, extract attribute, collect text)
    xliff_parser.rs
    html_parser.rs
    docx_parser.rs
    pptx_parser.rs
    distribute_text.rs      # proportional text distribution across runs
```

The `rust/` directory lives at the project root alongside `app/`. `wasm-pack build` produces output in `rust/pkg/` which Vite imports.

---

## Type design

Rust structs must serialize to JSON that matches the `EditorModel` types in `app/lib/ice/editor-model.ts`. The `#[serde(rename_all = "camelCase")]` attribute handles the naming convention.

### Core types

```rust
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSegment {
    pub id: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedImage {
    pub media_path: String,
    pub bytes: Vec<u8>,
    pub content_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub segments: Vec<ParsedSegment>,
    pub editor_model: EditorModel,
    pub images: Vec<ParsedImage>,
}

pub type Translations = HashMap<String, String>;
```

### Editor model types (mirrors `editor-model.ts`)

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "mode")]
pub enum EditorModel {
    #[serde(rename = "slide")]
    Slide { slides: Vec<Slide> },
    #[serde(rename = "page")]
    Page { page_dimensions: PageDimensions, blocks: Vec<DocumentBlock> },
    #[serde(rename = "html-preview")]
    HtmlPreview { raw_html: String },
    #[serde(rename = "segment-list")]
    SegmentList,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontStyle {
    pub size_pt: Option<f64>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub underline: Option<bool>,
    pub color: Option<String>,
    pub font_family: Option<String>,
    pub align: Option<String>,        // "left" | "center" | "right" | "justify"
    pub line_height: Option<f64>,
    pub line_spacing_pt: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDimensions {
    pub width_pt: f64,
    pub height_pt: f64,
    pub margin_top_pt: f64,
    pub margin_bottom_pt: f64,
    pub margin_left_pt: f64,
    pub margin_right_pt: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum DocumentBlock {
    #[serde(rename = "paragraph")]
    Paragraph {
        segment_id: String,
        text: String,
        style: ParagraphStyle,
        run_style: FontStyle,
    },
    #[serde(rename = "image")]
    Image { media_path: Option<String>, content_type: Option<String> },
    #[serde(rename = "table")]
    Table,
    #[serde(rename = "pageBreak")]
    PageBreak,
}
```

### WASM entry points (per format)

Each format exports a `parse` and `reconstruct` function. The JS adapter calls these directly.

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn parse_xliff(data: &[u8]) -> Result<String, JsError> {
    let result = xliff_parser::parse(data)?;
    Ok(serde_json::to_string(&result)?)
}

#[wasm_bindgen]
pub fn reconstruct_xliff(data: &[u8], translations_json: &str) -> Result<Vec<u8>, JsError> {
    let translations: Translations = serde_json::from_str(translations_json)?;
    Ok(xliff_parser::reconstruct(data, &translations)?)
}
```

Data crosses the boundary as bytes (`&[u8]` / `Vec<u8>`) and JSON strings. `wasm-bindgen` handles `Uint8Array` <-> `&[u8]` conversion automatically. The adapter deserializes the JSON `ParseResult` on the JS side. Simple, debuggable, no complex binding code.

---

## WASM-JS interop

### Data boundary

```
JS (worker)                         WASM (Rust)
────────────                        ───────────
Uint8Array (file bytes)  ──────-->  &[u8]
                                      |
                                      v
                                    parse / reconstruct
                                      |
                                      v
JSON string              <────────  String (segments / layout via serde_json)
Uint8Array               <────────  Vec<u8> (reconstructed file)
```

`wasm-bindgen` makes this seamless. `Uint8Array` on the JS side becomes `&[u8]` in Rust with zero-copy access (the WASM module reads directly from JS memory). Return values are copied back. Documents are typically under 10MB - the copy overhead is negligible.

### Worker integration

The worker already uses the adapter registry to dispatch parsing. A Rust WASM parser plugs in by implementing the `FormatParser` interface as an adapter:

```typescript
// app/lib/ice/adapters/xliff-wasm-adapter.ts
import init, { parse_xliff, reconstruct_xliff } from '../../../rust/pkg';
import type { FormatParser, ParseResult } from '../parser-interface';

let initialized = false;

async function ensureInit(): Promise<void> {
  if (!initialized) {
    await init();
    initialized = true;
  }
}

export const xliffWasmParser: FormatParser = {
  extensions: ["xliff", "xlf"],

  parse(data: Uint8Array): ParseResult {
    // wasm-bindgen handles Uint8Array -> &[u8] automatically
    const json = parse_xliff(data);
    return JSON.parse(json);
  },

  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array {
    const translationsJson = JSON.stringify(Object.fromEntries(translations));
    return reconstruct_xliff(data, translationsJson);
  },
};
```

To swap a format from JS to WASM, replace the import in `registry.ts`:

```typescript
// Before:
import { xliffParser } from "./xliff-adapter";
// After:
import { xliffWasmParser as xliffParser } from "./xliff-wasm-adapter";
```

No worker changes, no client changes, no UI changes. The worker calls `getParser(ext).parse(data)` regardless of whether the adapter wraps JS or WASM. During migration both JS and WASM adapters coexist - each format switches independently.

---

## Migration order

One parser at a time. Each phase is independently shippable - the app works after every merge.

### Phase 0: Toolchain scaffold

Set up the build pipeline end-to-end with a trivial module.

- Create `rust/` directory with `Cargo.toml`, `wasm-pack` config
- Build a "passthrough" WASM function that accepts `&[u8]` and returns `Vec<u8>` unchanged
- Create a trivial WASM adapter that implements `FormatParser` and register it in `registry.ts`
- Add `build:wasm` to `package.json` scripts (`wasm-pack build rust --target web`)
- Verify Vite bundles the `.wasm` file correctly
- Verify the existing E2E tests still pass with the WASM adapter registered (even if unused)

**Validates:** Rust + wasm-pack build chain, Vite WASM loading, adapter registration, `Uint8Array` round-trip through `wasm-bindgen`.

### Phase 1: XLIFF (120 lines)

The simplest parser. Proof of concept for real parsing in Rust.

- Parse XML with `quick-xml`, iterate events to find `<trans-unit>` elements
- Extract `<source>` and `<target>` text into `ParsedSegment` structs
- Return `ParseResult` with `EditorModel::SegmentList` and serialized segments via `serde_json`
- Reconstruct: parse XML, update `<target>` elements, create if missing, write back
- Create `xliff-wasm-adapter.ts` implementing `FormatParser`, swap it into `registry.ts`
- Benchmark against the JS version
- Run existing `xliff-adapter.test.ts` against the WASM adapter (same tests, different import)

**Validates:** `quick-xml` event-based parsing, `serde` JSON output matching `ParseResult` shape, full extract-reconstruct cycle through the adapter interface.

### Phase 2: HTML (122 lines)

Port the tag tokenizer and text extraction.

- Tokenize HTML tags using Rust string slicing (replaces the regex approach)
- Skip `<script>`, `<style>`, `<noscript>` blocks
- Return `ParseResult` with `EditorModel::HtmlPreview { rawHtml }` 
- Whitespace-preserving reconstruction
- Port `html-preprocessor.ts` (segment ID annotation)
- Create `html-wasm-adapter.ts`, swap into registry

**Validates:** string-heavy parsing performance in WASM, correctness of whitespace handling.

### Phase 3: DOCX (680 lines)

First format requiring ZIP handling. The real test.

- Read ZIP with the `zip` crate, extract `word/document.xml` and relationship files
- Parse `document.xml` with `quick-xml`
- Extract paragraphs from `<w:p>`, runs from `<w:r>`, text from `<w:t>`
- Return `ParseResult` with `EditorModel::Page { pageDimensions, blocks }` using normalized types (`sizePt`, `ParagraphStyle`, `FontStyle`)
- Layout extraction: page dimensions from `<w:sectPr>`, paragraph styling from `<w:pPr>`/`<w:rPr>`, image extraction via relationship parsing
- Port `distribute-text.ts` (proportional text distribution across multi-format runs)
- Lossless reconstruction: modify paragraph text in XML, repack ZIP
- Create `docx-wasm-adapter.ts`, swap into registry
- Snapshot test: JSON output from Rust matches JSON output from JS adapter for the same input

**Validates:** ZIP handling in WASM, complex XML navigation with namespaces, image extraction as binary data, the full extraction + layout + reconstruction pipeline.

### Phase 4: PPTX (1,590 lines)

The most complex parser. Multiple XML files per slide, master/layout inheritance, theme colors, shape geometry.

- Slide XML parsing from `ppt/slides/slide*.xml`
- Theme color extraction from `ppt/theme/theme1.xml`
- Return `ParseResult` with `EditorModel::Slide { slides }` using normalized types (`Shape`, `TextRegion`, `SlideBackground`)
- Text region geometry: positions from `<a:xfrm>`, EMU-to-pixel conversion
- Font style extraction from `<a:rPr>` mapped to `FontStyle { sizePt, bold, ... }`
- Shape fills, backgrounds, images
- Master slide text style inheritance from `ppt/slideMasters/` and `ppt/slideLayouts/`
- Grouped shape handling (`<p:grpSp>` with nested transforms)
- Reconstruction: text replacement in slide XML, ZIP repack
- Create `pptx-wasm-adapter.ts`, swap into registry

**Validates:** multi-file ZIP navigation, the most complex tree traversal in the codebase, real-world performance on large presentations. All existing E2E tests pass with zero changes.

### Phase 5: Cleanup

- Remove JS parser files: `app/lib/parsers/xliff.ts`, `html.ts`, `docx.ts`, `pptx.ts`
- Remove JS adapters: `app/lib/ice/adapters/xliff-adapter.ts`, `html-adapter.ts`, `docx-adapter.ts`, `pptx-adapter.ts`
- Remove `app/lib/distribute-text.ts` (ported to Rust in Phase 3)
- Remove `fast-xml-parser` and `fflate` from `package.json`
- WASM adapters become the only path in `registry.ts`
- Run full test suite: `npx vitest run && npx playwright test`

---

## Performance expectations

### Where Rust WASM wins

| Operation | JS situation | Rust WASM advantage |
|-----------|-------------|---------------------|
| XML parsing | `fast-xml-parser` builds a full JS object tree. Every XML element becomes a JS object, every attribute a string. GC pressure scales with document size. | `quick-xml` does zero-copy parsing from byte slices. It reads events (start tag, text, end tag) directly from the buffer without allocating intermediate objects. Memory stays flat regardless of document size. |
| ZIP decompression | `fflate` is hand-optimized JS with near-WASM performance. | `zip` crate uses `miniz_oxide` (pure Rust DEFLATE). Comparable or slightly faster than `fflate`. Not the primary win. |
| Tree traversal | Optional chaining chains, dynamic property access, megamorphic call sites. V8 can't optimize deeply polymorphic access patterns. | Enum matching compiles to jump tables. Monomorphic dispatch. Data lives in contiguous memory. No GC interaction. |
| Object allocation | Intermediate `{...}` objects for every style, paragraph, region. Short-lived allocations trigger frequent minor GCs in V8. | Rust structs are stack-allocated or arena-allocated. No GC. Allocations are predictable and cheap. |
| Large documents | V8 GC pause times scale with heap size. A 100-slide deck can push the worker heap to 100MB+, causing multi-millisecond pauses. | WASM linear memory has no GC pauses. Memory usage is deterministic. |

### Estimated improvement by document size

| Document | Current JS (estimate) | Rust WASM (estimate) | Notes |
|----------|----------------------|---------------------|-------|
| 2-page DOCX | ~20-50ms | ~15-30ms | Not noticeable. WASM init overhead may even it out. |
| 20-slide PPTX | ~100-300ms | ~40-120ms | Noticeable. XML parsing dominates at this size. |
| 100-slide PPTX with images | ~1-3s | ~300-800ms | Clearly noticeable. This is the target use case. |

These are estimates. Actual numbers depend on document complexity, image count, and how much time is in XML vs ZIP vs tree traversal. The benchmarking plan below will produce real numbers.

### Where to expect less gain

**Small documents.** Under ~10 segments, parse time is already imperceptible. The WASM module loads once at worker startup (~5-20ms), so subsequent parses don't pay initialization cost, but the absolute improvement on small files is negligible.

**Image-heavy documents.** If most of the file size is embedded images, the bottleneck is reading bytes from the ZIP, not parsing XML. Both `fflate` and the Rust `zip` crate decompress at similar speeds.

### Benchmarking plan

Before each phase ships, benchmark against the JS parser:

| Document size | Description |
|--------------|-------------|
| Small | 1-2 pages/slides, ~5 segments |
| Medium | 10-20 pages/slides, ~100 segments |
| Large | 50-100+ pages/slides, ~500+ segments, embedded images |

Measure wall-clock time for `extractSegments`, `extractLayout`, and `reconstructFile` separately. Report the median of 10 runs. Profile the JS parsers before Phase 1 to establish which operations consume the most time - this sets the target for where Rust needs to be faster.

---

## Risks and mitigations

**Ownership friction for tree transforms.**
Rust's borrow checker makes it harder to hold a reference to a parent node while modifying children. OpenXML parsing involves a lot of "read context from an ancestor, apply it to a descendant" patterns. Mitigation: use owned data rather than references for the parsed tree. Clone where needed - the cost of a few extra string allocations is trivial compared to the savings from zero-copy XML parsing. For complex cases, use indices into a flat `Vec` rather than tree pointers.

**Build complexity.**
Adding a Rust toolchain (`rustup`, `cargo`, `wasm-pack`) increases the barrier for contributors. Mitigation: the `rust/` directory is self-contained. CI installs the toolchain and builds automatically. For contributors who only touch TypeScript, the pre-built `.wasm` file is committed to `rust/pkg/` (or fetched from CI artifacts) so they don't need Rust installed locally.

**Layout JSON schema drift.**
The Rust parsers serialize layout as JSON via `serde`, consumed by React components in TypeScript. If the JSON shape drifts from what the UI expects, things break silently. Mitigation: `serde(rename_all = "camelCase")` ensures Rust struct fields match JS conventions. Define TypeScript types that mirror the Rust structs. Add snapshot tests that verify the JSON output matches expected shapes.

**WASM module size.**
Rust WASM with `quick-xml` + `zip` + `serde_json` typically produces 50-200KB gzipped (after `wasm-opt`). Much smaller than the SQLite WASM module (~860KB gzipped) already in the app. Not a concern unless it grows significantly.

**`quick-xml` event model vs `fast-xml-parser` object tree.**
The current TS parsers query a pre-built object tree (`node['a:rPr'][0]`). `quick-xml` is event-based - you iterate start/end/text events sequentially. This is a different programming model. Mitigation: build a thin tree representation on top of `quick-xml` events for the complex parsers (DOCX, PPTX). The tree is allocated in Rust (cheap, no GC) and discarded after parsing. Phase 1 (XLIFF) validates the event-based approach first; Phase 3 (DOCX) introduces the tree layer if needed.

---

## Alternatives considered

**OCaml + wasm_of_ocaml.** Better ergonomics for recursive tree manipulation (algebraic types, pattern matching, GC). But `wasm_of_ocaml` compiles from bytecode, not native code, limiting performance gains. The WASM toolchain is younger with fewer production deployments. The XML (`xmlm`) and ZIP (`decompress`) libraries are pure OCaml but less optimized than Rust equivalents. The ergonomic advantage doesn't justify the toolchain risk when performance is the primary goal.

**Melange / js_of_ocaml (OCaml to JS).** Gives OCaml's type system without WASM. No performance gain over TypeScript, just correctness. Doesn't address the motivation.

**Optimize existing TypeScript parsers.** Switch to a streaming XML parser in JS, reduce intermediate allocations, use typed arrays. Lower risk, lower ceiling. Worth doing as a baseline comparison - if profiling reveals that the JS parsers can be 2x faster with targeted optimization, the case for a Rust rewrite weakens. This should be the first step regardless: profile, optimize the low-hanging fruit, then decide if the remaining gap justifies a rewrite.

---

## What doesn't change

- Upload flow
- `FormatParser` interface (`app/lib/ice/parser-interface.ts`)
- `EditorModel` types (`app/lib/ice/editor-model.ts`)
- Worker protocol (2 actions: `parse`, `reconstruct`)
- `parseFile()` client API
- SQLite storage (files + TM)
- TM matching logic
- Translation engine (Chrome Translator API)
- Canvas editor (consumes `EditorModel` - doesn't know or care what produced it)
- Service worker / offline support

---

## Pre-work: Profile first

Before starting Phase 0, profile the current parsers on a real large document (100-slide PPTX, 50-page DOCX). Measure:

1. Total parse time (wall clock)
2. Time in `fflate` decompression
3. Time in `fast-xml-parser` parsing
4. Time in tree traversal / layout extraction
5. GC pause count and total pause time

If XML parsing + tree traversal account for 60%+ of total time, the Rust rewrite has a high ceiling. If `fflate` decompression dominates, the ceiling is lower (Rust ZIP is comparable to `fflate`, not dramatically faster).

This profiling takes an afternoon and determines whether the rewrite is worth the investment.

---

## Open questions

1. **Event-based vs tree-based parsing.** `quick-xml` is event-based (SAX-style). The current JS parsers query an object tree. For simple formats (XLIFF, HTML) events are fine. For PPTX with deeply nested shapes inheriting from masters, an event-based approach may be awkward. Should DOCX/PPTX build a lightweight tree from events first, or can the parsers be written directly against the event stream? Phase 1 will inform this.

2. **Pre-built WASM for non-Rust contributors.** Should the `rust/pkg/` output be committed to the repo so contributors who only touch TypeScript don't need Rust installed? Or should CI produce the artifact and contributors fetch it? Committing binaries has trade-offs (repo size, stale builds) but simplifies onboarding.

3. **Concurrent parsing.** WASM in a web worker is single-threaded. For a 100-slide PPTX, slides could theoretically be parsed in parallel using multiple workers or `wasm-bindgen-rayon`. Is this worth pursuing, or is single-threaded Rust fast enough? Defer until benchmarks show whether it matters.

---

## References

- [wasm-pack](https://rustwasm.github.io/wasm-pack/) - build tool for Rust-generated WASM
- [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/) - Rust/JS interop for WASM
- [quick-xml](https://docs.rs/quick-xml/latest/quick_xml/) - fast XML parser for Rust
- [zip crate](https://docs.rs/zip/latest/zip/) - ZIP reading/writing in Rust
- [serde](https://serde.rs/) - Rust serialization framework
- [ts-rs](https://github.com/Aleph-Alpha/ts-rs) - generate TypeScript types from Rust structs
- [wasm-bindgen-rayon](https://github.com/RReverser/wasm-bindgen-rayon) - Rayon (parallel iterators) in WASM
- [OpenXML SDK documentation](https://learn.microsoft.com/en-us/office/open-xml/open-xml-sdk) - Microsoft's reference for the DOCX/PPTX format
- [EMU coordinate system](http://officeopenxml.com/drwSp-size-position.php) - OpenXML shape positioning
