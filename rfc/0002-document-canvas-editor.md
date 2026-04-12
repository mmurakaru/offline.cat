# RFC: Document Canvas Editor

**Status:** Draft
**Author:** Markus Murakaru
**Date:** 2026-04-06

---

## Summary

Replace the segment grid with a Keynote/Pages-inspired document canvas editor. Translators edit directly in a visual representation of the document - clicking text boxes on slides, paragraphs on pages - instead of filling out a disconnected table. No other CAT tool offers this.

---

## Problem

Every CAT tool extracts translatable segments into a table. The translator works in a spreadsheet-like grid, disconnected from the document's visual layout. This means:

- No spatial context - you can't see where text lives in the document
- No length awareness - you don't know if a translation fits until you export
- No document structure - slides, pages, and headings are flattened into rows
- Context is limited to "the row above and below"

This table pattern was established in the early 2000s when rendering binary document formats in the browser wasn't possible. It is now.

---

## Proposal

A three-panel layout inspired by Keynote/Pages:

```
┌──────────────┬────────────────────────────────┬──────────────┐
│              │                                │              │
│   Sidebar    │       Document Canvas          │  Inspector   │
│              │                                │  (optional)  │
│  Thumbnails  │   Visual document with         │              │
│  or Outline  │   editable text regions        │  TM info     │
│              │                                │  Status      │
│              │                                │  Glossary    │
│              │                                │              │
└──────────────┴────────────────────────────────┴──────────────┘
```

### Sidebar (left)

Two modes, toggled like Keynote's View menu:

**Navigator mode** - visual thumbnails of each slide/page. Click to jump. Active slide/page highlighted.

**Outline mode** - segments listed as text, grouped by slide/page. Shows status (confirmed, MT, TM match, untranslated). Click to jump to that segment on the canvas. Not editable - the canvas is the single editing surface.

### Canvas (center)

The document rendered visually as an editable surface powered by [Tiptap](https://tiptap.dev/) (ProseMirror-based editor). The editor instance model varies by format:

### Editor architecture per format

**PPTX - one Tiptap instance per text box:**

Each text box on a slide is an independent editor, positioned absolutely on the slide canvas. Text boxes are spatially independent so they need separate editor instances. Tab moves focus between instances in reading order.

```
Slide canvas
├── Text box at (100, 50)  → Tiptap instance 1
├── Text box at (100, 300) → Tiptap instance 2
└── Text box at (400, 300) → Tiptap instance 3
```

**DOCX - one Tiptap instance per page (or whole document):**

The entire page is a single editor. Each paragraph is a Tiptap node that knows its segment ID. Headings, lists, and body text map to Tiptap node types. Structural elements (page breaks, headers/footers) are rendered as read-only decorations. The translator scrolls and clicks into any paragraph to edit, like Pages/Word.

```
Document editor
├── Heading node (segment 1) - editable
├── Paragraph node (segment 2) - editable
├── Image node - read-only decoration
├── Paragraph node (segment 3) - editable
└── List item nodes (segments 4-6) - editable
```

**HTML - one Tiptap instance for the whole page:**

The HTML is parsed directly into Tiptap (which natively understands HTML). Translatable text nodes are editable. Structural elements (`<nav>`, `<div>`, `<section>`) are read-only decorations that preserve the page layout. The rendered output looks like the actual webpage. Tiptap's node-level `isEditable` controls which parts the translator can modify.

```
Page editor
├── <nav> - read-only structure
│   ├── <a> text - editable segment
│   └── <a> text - editable segment
├── <h1> text - editable segment
├── <p> text - editable segment
└── <footer> - read-only structure
```

**XLIFF - one Tiptap instance for the segment list:**

No visual document exists, but XLIFF segments often contain inline markup (`<x/>`, `<g>`, `<bx/>` tags for placeholders, formatting markers). Each segment is a Tiptap node. Inline XLIFF tags become custom Tiptap node views rendered as colored pills/chips that the translator can reposition but not delete or modify. This is where Tiptap adds the most value - managing inline non-editable elements in raw `contentEditable` is fragile.

```
Segment list editor
├── Segment node: "Click {x1}here{/x1} to continue"
│   └── {x1} and {/x1} are non-editable inline node views
├── Segment node: "Welcome to {g1}our site{/g1}"
└── Segment node: "Page {bx1} of {bx2}"
```

### Why Tiptap

The editing experience requires features that go beyond plain `contentEditable`:

- **Slash commands** - Tiptap's `InputRule` and `Suggestion` extensions provide built-in pattern matching for `/` triggers with a filtered command palette
- **Inline node views** - glossary term highlights, XLIFF placeholder tags, and TM match indicators rendered as custom React components within the text flow
- **Schema enforcement** - translators can't accidentally merge paragraphs, delete structural elements, or break the document model
- **Controlled undo/redo** - per-editor-instance history that doesn't leak across segments
- **Decorations** - highlight the active segment, mark unconfirmed text, all without modifying the document content
- **Paste handling** - strip unwanted formatting, preserve only text

For plain text segments, Tiptap adds minimal overhead. For segments with inline tags, glossary highlights, or slash commands, it's the difference between a robust editor and a brittle `contentEditable` hack.

### Editing experience

The goal is: **editing the document should feel like editing it in its original application, just in another language.** No selection steps, no separate input overlays, no "translation tool" interaction patterns. This is the moat.

**Inline cursor placement** - click anywhere in a text region and your cursor lands there, just like Pages/Word/Notion. No "click to select, then type" two-step. The text is the interface.

**Source text lives in the outline sidebar** - the left sidebar (in outline mode) always shows source text for every segment, grouped by slide/page. The active segment is highlighted and scrolled into view. This means the source is always visible to the left while you edit on the canvas to the right. No ghost text, no overlays, no toggles - the sidebar is the persistent source reference.

**Untranslated regions on the canvas** show a muted placeholder (e.g. "Click to translate" or a dashed border) so you can see which regions still need work. They don't show the source text - that's the outline's job.

**Slash commands** - type `/` anywhere in an editable region to open a command palette:

| Command | Action |
|---------|--------|
| `/voice` | Start dictation via [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API). Speak the translation, it fills in as text. End with silence or Escape. |
| `/tm` | Show TM matches for this segment in a dropdown. Click to accept. |
| `/glossary` or `/g term` | Search glossary for a term. Shows matching entries with approved translations. Click to insert. |
| `/source` | Insert the source text as a starting point for editing |
| `/mt` | Trigger machine translation for just this segment |
| `/confirm` | Confirm current translation and save to TM |

The slash command palette appears as a floating menu anchored to the cursor position, filtered as you type after `/`. Same pattern as Notion, Slack, or GitHub comments.

**Confirmation model** - translations auto-save as drafts. Explicit confirmation (`/confirm`, or a keyboard shortcut like `Cmd+Enter`) saves to TM and marks the segment as confirmed. This separates "I'm still typing" from "this translation is final." Unconfirmed translations are still used for file reconstruction but don't pollute the TM.

**Format-specific editing behavior:**

| Format | Cursor behavior |
|--------|----------------|
| PPTX | Click into positioned text boxes on the slide. Each text box is independently editable. Tab moves between boxes in reading order. |
| DOCX | Click anywhere in the flowing document. Paragraphs are editable inline, like editing in Pages. The document scrolls naturally. |
| HTML | Click on any translatable text in the rendered page. Editing happens inline in the rendered output. |
| XLIFF | Segments displayed as a structured list. Click into any segment to edit. Closest to a traditional editor since there's no visual document. |

**Undo/redo** - `Cmd+Z` / `Cmd+Shift+Z` per text region. Each region maintains its own edit history. Undoing in one text box doesn't affect others.

### Inspector (right, collapsible)

Context panel that appears when a segment is active. Source text is not shown here - that's the outline sidebar's job. The inspector focuses on translation aids:
- TM matches and suggestions (clickable to insert)
- Match type badge (ICE, exact, fuzzy %, MT)
- Glossary terms that appear in the source (clickable to insert)
- Segment metadata (word count, character count)

Auto-shows when you place your cursor in a text region, auto-hides when you click away. Can be pinned open or fully collapsed.

---

## Rendering approach

### Option A: Native rendering per format

Render each format directly from parsed XML/HTML:

| Format | Rendering strategy |
|--------|-------------------|
| PPTX | Parse shape positions from `p:spPr/a:xfrm`, render as positioned divs on a slide-sized canvas. Background shapes/images rendered where feasible. |
| DOCX | Parse paragraph structure, render as flowing text with page-break markers. Approximate page layout based on section properties. |
| HTML | Render in a sandboxed iframe. Overlay editable regions on translatable text nodes. |
| XLIFF | No visual rendering - use outline/segment list as the canvas. |

**Pros**: No external dependencies, works offline, fast.
**Cons**: Fidelity varies by format. PPTX shapes without explicit position data (placeholder shapes inheriting from slide masters) need fallback positioning. DOCX page layout is approximate. Complex formatting (charts, SmartArt, embedded objects) won't render.

### Option B: PDF.js as the rendering engine

Convert documents to PDF first, then use [pdf.js](https://github.com/mozilla/pdf.js) to render pixel-perfect pages. Overlay editable text regions on top of the rendered canvas.

**How it would work:**

1. Use a WASM-based converter (e.g. LibreOffice compiled to WASM, or a lightweight PPTX/DOCX-to-PDF converter) to produce a PDF from the uploaded file
2. pdf.js renders each page to a `<canvas>` element - this gives pixel-perfect visual fidelity including backgrounds, images, charts, shapes
3. pdf.js also produces a text layer with positioned `<span>` elements - we replace these with editable inputs at the same positions
4. The text positions from the PDF text layer map back to our segment IDs for translation storage

**Pros**: Pixel-perfect rendering for all formats. Charts, images, SmartArt all visible. Mature, well-tested library. Page thumbnails come for free via pdf.js.
**Cons**: Requires a document-to-PDF conversion step. LibreOffice WASM (~50MB+) is heavy for a browser app. The conversion itself takes time. PDF text layer positions may not perfectly align with source document text boxes. Adds a dependency that could break offline promise if conversion requires a server.

### Option C: Hybrid approach (recommended)

Start with Option A (native rendering) for the MVP. It works offline, has no heavy dependencies, and covers the primary use case (PPTX text box editing). Accept that fidelity won't be pixel-perfect - the goal is "good enough to see where text lives and whether it fits."

Add Option B (pdf.js rendering) as an optional enhancement later. If the user has a pre-rendered PDF of the document (or if a lightweight WASM converter becomes available), use pdf.js for the background and overlay editable text regions on top. This gives the best of both worlds - pixel-perfect backgrounds with interactive text editing.

The architecture should support both: the canvas component accepts a "renderer" that produces positioned text regions. Option A's renderer parses the document XML directly. Option B's renderer uses pdf.js text layer positions. The editing surface is the same either way.

---

## Format-specific details

### PPTX

Data available from parsing:
- Slide dimensions from `ppt/presentation.xml` (`p:sldSz` cx/cy in EMUs)
- Shape positions from `p:sp/p:spPr/a:xfrm` (`a:off` x/y, `a:ext` cx/cy in EMUs)
- Text content from `p:sp/p:txBody/a:p/a:r/a:t`
- Font properties from `a:rPr` (size, bold, italic, font family)

Missing / hard to get:
- Placeholder shapes that inherit position from slide layout/master (no `a:xfrm` on the shape itself - need to resolve from `ppt/slideLayouts/` and `ppt/slideMasters/`)
- Background images and shape fills
- Charts, SmartArt, embedded objects
- Grouped shapes (`p:grpSp`) with nested transforms

EMU to pixel conversion: 1 EMU = 1/914400 inch. At 96 DPI: 1px = 9525 EMU.

### DOCX

Data available from parsing:
- Paragraph text from `w:p/w:r/w:t`
- Page dimensions from `w:sectPr` (`w:pgSz` width/height in twips)
- Margins from `w:sectPr/w:pgMar`
- Basic styling from `w:rPr` (bold, italic, font size)

Tiptap integration:
- One editor instance for the entire document (or per page if page boundaries are enforced)
- DOCX paragraphs map to Tiptap paragraph/heading nodes, each with a `segmentId` attribute
- Read-only nodes for images, tables, page breaks - rendered as decorations within the editor
- Styling from `w:rPr` applied as Tiptap marks (bold, italic) and node attributes (font size, alignment)
- Page breaks estimated from content height (approximate - exact page break calculation requires a full layout engine)

### HTML

Tiptap integration:
- One editor instance for the whole page
- Source HTML fed directly into Tiptap (which natively understands HTML structure)
- Translatable text nodes marked as editable via custom node extensions with `segmentId` attributes
- Structural elements (`<nav>`, `<header>`, `<div>` wrappers) rendered as read-only node views that preserve visual layout
- Live preview: the rendered Tiptap output is the translated page

HTML is the most natural format for this approach since Tiptap's document model is already HTML-based.

### XLIFF

Tiptap integration:
- One editor instance for the segment list
- Each segment is a custom Tiptap node containing the target text
- Inline XLIFF tags (`<x/>`, `<g>`, `<bx/>`, `<ex/>`) rendered as custom non-editable node views (colored pills/chips showing the tag ID)
- Translators can type around and reposition inline tags but cannot delete or modify them
- The Tiptap schema enforces that all inline tags from the source are present in the target
- Source text shown in the outline sidebar as reference

---

## Layout behavior

### Sidebar width
- Default: 200px (thumbnails) or 240px (outline)
- Collapsible to 0 (canvas takes full width)
- Resizable via drag handle (future)

### Inspector width
- Default: 280px
- Collapsible (hidden by default, appears on segment focus)
- Auto-hides when no segment is active

### Responsive behavior
- Below 1024px: sidebar collapses, canvas is full-width, inspector becomes a bottom sheet
- Below 768px: canvas only, outline accessible via a drawer/modal

### Keyboard shortcuts
- `Tab` / `Shift+Tab`: move cursor to next/previous text region
- `Cmd+Enter`: confirm current translation and save to TM
- `Escape`: deselect current region, collapse inspector
- `Cmd+Z` / `Cmd+Shift+Z`: undo/redo within current text region
- `Cmd+1` / `Cmd+2`: switch sidebar between navigator and outline
- `Cmd+\`: toggle inspector panel
- `/`: open slash command palette (when cursor is in a text region)

---

## Data flow

```
Upload file
  → Parse segments (existing)
  → Extract layout data (positions, dimensions, page/slide structure)
  → TM lookup (existing)
  → Render canvas with positioned editable regions
  → User edits in-place
  → On confirm: save to TM, update segment state
  → On download: reconstruct file from translations (existing)
```

The layout extraction is a new parser action (`extractLayout`) that returns:

```ts
interface DocumentLayout {
  pages: PageLayout[];
}

interface PageLayout {
  pageIndex: number;
  width: number;   // in pixels
  height: number;  // in pixels
  regions: TextRegion[];
}

interface TextRegion {
  segmentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
}
```

This is format-agnostic - PPTX, DOCX, and HTML all produce the same `DocumentLayout` structure. The canvas component doesn't know which format it's rendering.

---

## Learnings from POC

A quick POC was built during the SQLite migration session. Key findings:

1. **PPTX shape extraction works.** The fast-xml-parser `preserveOrder` format makes attribute access verbose but functional. Position data from `a:xfrm` converts cleanly from EMUs to pixels.

2. **Placeholder shapes are common.** Many PPTX shapes inherit position from slide layouts/masters and have no `a:xfrm` on the shape itself. Fallback positioning (stacking shapes vertically) is needed as a minimum. Resolving from slide masters is the proper fix.

3. **contentEditable alone is insufficient.** Plain text editing works, but inline node features (glossary highlights, XLIFF tags, slash commands) require a structured editor. Tiptap/ProseMirror is the right tool - it gives schema enforcement, node views, input rules, and controlled undo/redo without the fragility of raw `contentEditable`.

4. **The parser worker message protocol needs request IDs.** The current single-handler pattern (`addEventListener` / `removeEventListener`) works for sequential calls but breaks if two parse operations overlap. Adding request IDs (like the SQLite worker) would make it robust.

5. **Scaling matters.** Slides need to scale to fit the canvas container while maintaining aspect ratio. Text regions scale with the slide. Font sizes need to scale proportionally.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@tiptap/react` | React bindings for the Tiptap editor |
| `@tiptap/starter-kit` | Core extensions (paragraph, heading, bold, italic, history) |
| `@tiptap/suggestion` | Slash command palette trigger and filtering |
| `@tiptap/extension-placeholder` | Ghost text for untranslated regions |

Tiptap is MIT-licensed, works offline (no server dependency), and tree-shakes well. Only the extensions you use are bundled.

---

## Phases

### Phase 1: Keynote layout + Tiptap foundation

- Three-panel layout (sidebar, canvas, collapsible inspector)
- Sidebar: navigator (slide thumbnails) and outline (source segments grouped by slide/page)
- Install Tiptap with starter-kit + placeholder + suggestion extensions
- PPTX: slide canvas with one Tiptap instance per text box, positioned by shape coordinates
- Inspector: TM suggestions, glossary, segment metadata
- Keyboard navigation (Tab between regions, Cmd+Enter to confirm)
- Fallback positioning for shapes without explicit coordinates

### Phase 2: Slash commands + inline features

- Slash command palette (`/voice`, `/tm`, `/glossary`, `/mt`, `/confirm`)
- `/voice` integration with Web Speech API for dictation
- `/glossary` search with inline insertion
- Custom Tiptap node views for glossary term highlights in translated text
- Confirmation model (draft vs confirmed translations)

### Phase 3: DOCX + HTML editors (done)

- DOCX: one Tiptap instance for the document, paragraphs as custom nodes with segment IDs, styling from `w:rPr`/`w:pPr`, page dimensions from `w:sectPr`, inline image rendering via relationship parsing
- HTML: native iframe rendering with contenteditable spans. The browser handles all CSS layout (flexbox, grid, media queries) natively. A preprocessor annotates translatable text with `data-segment-id` spans, which are made editable via `contentEditable` with input/focus listeners for segment tracking.
- Page thumbnails in sidebar navigator for DOCX (deferred to polish pass)

### Phase 4: XLIFF inline tags

- Custom non-editable Tiptap node views for XLIFF inline tags (`<x/>`, `<g>`, `<bx/>`)
- Schema enforcement: all source tags must be present in target
- Tag reordering via drag or cut/paste

### Phase 5: PDF.js background rendering (optional)

- If user provides a PDF or if WASM converter available, render pages via pdf.js for pixel-perfect backgrounds
- Tiptap editors overlaid on top of rendered pages
- Reuse same editing surface - only the background rendering changes

---

## What doesn't change

- Upload flow
- SQLite storage (files + TM)
- TM matching logic
- Translation engine (Chrome Translator API)
- File reconstruction (existing parsers)
- Service worker / offline support

---

## Open questions

- **Slide master resolution**: How much effort to resolve placeholder positions from slide layouts/masters? Is fallback positioning acceptable for v1?
- **Font rendering**: Should we attempt to match the document's fonts, or use a system font and accept the difference?
- **DOCX page breaks**: Accurate page break calculation requires a layout engine. Is approximate "content height / page height" sufficient, or do we need something more precise?
- **Tiptap bundle size**: Tiptap with starter-kit + suggestion + placeholder is ~50-80KB gzipped. Acceptable given the value it provides? Measure after integration.
- **Web Speech API browser support**: `/voice` dictation depends on the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) which has inconsistent support (Chrome is good, Firefox partial, Safari limited). Should it be a progressive enhancement that only shows in the slash menu when available?
- **Multiple Tiptap instances performance**: PPTX slides with many text boxes create many editor instances. Need to verify performance with 20+ instances on a single slide. Lazy initialization (only mount when visible/active) may be needed.

---

## References

- [Tiptap](https://tiptap.dev/) - headless rich text editor framework built on ProseMirror
- [ProseMirror](https://prosemirror.net/) - toolkit for building rich text editors
- [pdf.js](https://github.com/mozilla/pdf.js) - Mozilla's PDF rendering library
- [pdf.js viewer demo](https://mozilla.github.io/pdf.js/web/viewer.html)
- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) - browser dictation API
- [OpenXML shape transforms](http://officeopenxml.com/drwSp-size-position.php) - EMU coordinate system documentation
- Keynote / Pages - Apple's presentation and word processing apps (UI inspiration)
