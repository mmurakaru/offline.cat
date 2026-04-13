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
The parsers are already behind a clean boundary: `parser-client.ts` sends bytes to a web worker, the worker calls format-specific functions, results come back as typed objects. Swapping the implementation inside the worker doesn't touch the rest of the app. This is a contained rewrite with a clear interface contract.

---

## What exists today

### Parser files

| File | Lines | Format | Approach |
|------|-------|--------|----------|
| `app/lib/parsers/xliff.ts` | 50 | XLIFF 1.2/2.0 | Native `DOMParser` API |
| `app/lib/parsers/html.ts` | 122 | HTML | Regex-based tag tokenization |
| `app/lib/parsers/docx.ts` | 666 | DOCX (OpenXML) | `fast-xml-parser` + `fflate` |
| `app/lib/parsers/pptx.ts` | 1,560 | PPTX (OpenXML) | `fast-xml-parser` + `fflate` |
| `app/lib/distribute-text.ts` | 102 | - | Proportional text distribution across runs |
| `app/lib/html-preprocessor.ts` | 95 | HTML | Annotates HTML with `data-segment-id` |

### Dependencies

- `fast-xml-parser` (v5.5.10) - XML parsing and building with `preserveOrder` mode
- `fflate` (v0.8.2) - ZIP compression/decompression

### Architecture

```
parser-client.ts (main thread)
  -> postMessage to parser.worker.ts (web worker)
    -> extractByFormat() dispatches to format-specific parser
    -> result posted back to main thread
```

The worker handles five actions: `extract` (segments), `extractLayout` (PPTX slides), `extractVisualLayout` (PPTX + images), `extractDocxLayout` (DOCX + images), and `reconstruct` (file rebuild with translations).

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

### Core types

```rust
use serde::Serialize;

#[derive(Serialize)]
pub struct Segment {
    pub id: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
}

/// Segment ID -> translated text
pub type Translations = HashMap<String, String>;
```

### Format-specific types (DOCX example)

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxLayout {
    pub pages: PageDimensions,
    pub paragraphs: Vec<ParagraphLayout>,
    pub images: Vec<ImageData>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDimensions {
    pub width_pt: f64,
    pub height_pt: f64,
    pub margin_top: f64,
    pub margin_bottom: f64,
    pub margin_left: f64,
    pub margin_right: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphLayout {
    pub text: String,
    pub alignment: Option<Alignment>,
    pub runs: Vec<(String, RunStyle)>,
    pub spacing_before: f64,
    pub spacing_after: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Alignment {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStyle {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub font_size: Option<f64>,
    pub font_family: Option<String>,
    pub color: Option<String>,
}
```

The `#[serde(rename_all = "camelCase")]` attribute ensures the JSON output matches the existing TypeScript interfaces. The React components that consume layout data don't need to change.

### WASM entry points

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn extract_segments(data: &[u8], format: &str) -> Result<String, JsError> {
    let segments = match format {
        "xliff" | "xlf" => xliff_parser::extract_segments(data),
        "html" | "htm" => html_parser::extract_segments(data),
        "docx" => docx_parser::extract_segments(data),
        "pptx" => pptx_parser::extract_segments(data),
        _ => return Err(JsError::new(&format!("unsupported format: {}", format))),
    }?;
    Ok(serde_json::to_string(&segments)?)
}

#[wasm_bindgen]
pub fn extract_layout(data: &[u8], format: &str) -> Result<String, JsError> {
    // Returns JSON string matching the existing TS layout interfaces
    ...
}

#[wasm_bindgen]
pub fn reconstruct(data: &[u8], format: &str, translations_json: &str) -> Result<Vec<u8>, JsError> {
    let translations: Translations = serde_json::from_str(translations_json)?;
    ...
}
```

Data crosses the boundary as bytes (`&[u8]` / `Vec<u8>`) and JSON strings. `wasm-bindgen` handles `Uint8Array` <-> `&[u8]` conversion automatically. Structured data (segments, layouts, translations) is serialized as JSON on both sides. Simple, debuggable, no complex binding code.

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

`parser.worker.ts` gains a bridge module:

```typescript
// wasm-bridge.ts
import init, { extract_segments, extract_layout, reconstruct } from '../../rust/pkg';

let initialized = false;

export async function ensureInit(): Promise<void> {
  if (!initialized) {
    await init();
    initialized = true;
  }
}

export function extractSegments(data: Uint8Array, format: string): Segment[] {
  const json = extract_segments(data, format);
  return JSON.parse(json);
}

export function extractLayout(data: Uint8Array, format: string): string {
  return extract_layout(data, format);
}

export function reconstructFile(
  data: Uint8Array,
  format: string,
  translations: Map<string, string>
): Uint8Array {
  const translationsJson = JSON.stringify(Object.fromEntries(translations));
  return reconstruct(data, format, translationsJson);
}
```

During migration, the worker dispatches to either the JS parser or the WASM bridge based on which formats have been ported. Once all formats are ported, the bridge becomes the only path and the JS parsers are removed.

---

## Migration order

One parser at a time. Each phase is independently shippable - the app works after every merge.

### Phase 0: Toolchain scaffold

Set up the build pipeline end-to-end with a trivial module.

- Create `rust/` directory with `Cargo.toml`, `wasm-pack` config
- Build a "passthrough" WASM function that accepts `&[u8]` and returns `Vec<u8>` unchanged
- Load it in the web worker via `wasm-bridge.ts`, verify the round-trip
- Add `build:wasm` to `package.json` scripts (`wasm-pack build rust --target web`)
- Verify Vite bundles the `.wasm` file correctly

**Validates:** Rust + wasm-pack build chain, Vite WASM loading, worker data transfer, `Uint8Array` round-trip.

### Phase 1: XLIFF (50 lines)

The simplest parser. Proof of concept for real parsing in Rust.

- Parse XML with `quick-xml`, iterate events to find `<trans-unit>` elements
- Extract `<source>` and `<target>` text into `Segment` structs
- Serialize to JSON via `serde_json`
- Reconstruct: parse XML, update `<target>` elements, create if missing, write back
- Benchmark against the JS version

**Validates:** `quick-xml` event-based parsing works for OpenXML namespaced content, `serde` JSON output matches TypeScript expectations, the full extract-reconstruct cycle.

### Phase 2: HTML (122 lines)

Port the tag tokenizer and text extraction.

- Tokenize HTML tags using Rust string slicing (replaces the regex approach)
- Skip `<script>`, `<style>`, `<noscript>` blocks
- Whitespace-preserving reconstruction
- Port `html-preprocessor.ts` (segment ID annotation)

**Validates:** string-heavy parsing performance in WASM, correctness of whitespace handling.

### Phase 3: DOCX (666 lines)

First format requiring ZIP handling. The real test.

- Read ZIP with the `zip` crate, extract `word/document.xml` and relationship files
- Parse `document.xml` with `quick-xml`
- Extract paragraphs from `<w:p>`, runs from `<w:r>`, text from `<w:t>`
- Layout extraction: page dimensions from `<w:sectPr>`, paragraph styling from `<w:pPr>`/`<w:rPr>`, image extraction via relationship parsing
- Port `distribute-text.ts` (proportional text distribution across multi-format runs)
- Lossless reconstruction: modify paragraph text in XML, repack ZIP
- Define the layout JSON schema and verify it matches existing TypeScript interfaces

**Validates:** ZIP handling in WASM, complex XML navigation with namespaces, image extraction as binary data, the full extraction + layout + reconstruction pipeline.

### Phase 4: PPTX (1,560 lines)

The most complex parser. Multiple XML files per slide, master/layout inheritance, theme colors, shape geometry.

- Slide XML parsing from `ppt/slides/slide*.xml`
- Theme color extraction from `ppt/theme/theme1.xml`
- Text region geometry: positions from `<a:xfrm>`, EMU-to-pixel conversion
- Font style extraction from `<a:rPr>`
- Shape fills, backgrounds, images
- Master slide text style inheritance from `ppt/slideMasters/` and `ppt/slideLayouts/`
- Grouped shape handling (`<p:grpSp>` with nested transforms)
- Reconstruction: text replacement in slide XML, ZIP repack

**Validates:** multi-file ZIP navigation, the most complex tree traversal in the codebase, real-world performance on large presentations.

### Phase 5: Cleanup

- Remove `app/lib/parsers/xliff.ts`, `html.ts`, `docx.ts`, `pptx.ts`
- Remove `app/lib/distribute-text.ts` (ported to Rust in Phase 3)
- Remove `fast-xml-parser` and `fflate` from `package.json`
- Simplify `wasm-bridge.ts` (remove format dispatch, it's the only path now)
- Update tests to run against the WASM parsers

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
- `parser-client.ts` API (same function signatures, same return types)
- Worker message protocol (same actions, same message shapes)
- SQLite storage (files + TM)
- TM matching logic
- Translation engine (Chrome Translator API)
- Canvas editor (consumes layout JSON - doesn't know or care what produced it)
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

1. **Layout JSON schema contract.** The current TypeScript layout interfaces (`DocxDocumentLayout`, `SlideLayout`, `TextRegion`, etc.) are consumed directly by React components. The Rust structs need to produce JSON that matches these shapes exactly. Should we generate TypeScript types from the Rust structs (via `ts-rs` crate), or maintain them manually with snapshot tests? `ts-rs` is more reliable but adds a build step.

2. **Event-based vs tree-based parsing.** `quick-xml` is event-based (SAX-style). The current parsers query an object tree. For simple formats (XLIFF, HTML) events are fine. For PPTX with deeply nested shapes inheriting from masters, an event-based approach may be awkward. Should DOCX/PPTX build a lightweight tree from events first, or can the parsers be written directly against the event stream? Phase 1 will inform this.

3. **Pre-built WASM for non-Rust contributors.** Should the `rust/pkg/` output be committed to the repo so contributors who only touch TypeScript don't need Rust installed? Or should CI produce the artifact and contributors fetch it? Committing binaries has trade-offs (repo size, stale builds) but simplifies onboarding.

4. **Concurrent parsing.** WASM in a web worker is single-threaded. For a 100-slide PPTX, slides could theoretically be parsed in parallel using multiple workers or `wasm-bindgen-rayon`. Is this worth pursuing, or is single-threaded Rust fast enough? Defer until benchmarks show whether it matters.

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
