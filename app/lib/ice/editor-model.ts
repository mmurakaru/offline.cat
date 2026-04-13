// Format-agnostic editor model types.
// The editor knows about rendering MODES (slide, page, etc.), not file FORMATS.
// Adding a new format means mapping it to an existing mode.

// ---- Editor modes ----

export type EditorMode = "slide" | "page" | "html-preview" | "segment-list";

// ---- Shared primitives ----

export interface FontStyle {
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  align?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  lineSpacingPt?: number;
}

export interface TextRegion {
  segmentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontStyle?: FontStyle;
  zIndex: number;
}

export interface ImageRef {
  mediaPath: string;
  contentType: string;
}

export interface SolidFill {
  color: string;
  opacity?: number;
}

// ---- Slide mode (PPTX, future Keynote, Google Slides export) ----

export interface Shape {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: SolidFill;
  image?: ImageRef;
  zIndex: number;
  source?: "slide" | "layout";
}

export interface SlideBackground {
  fill?: SolidFill;
  image?: ImageRef;
}

export interface Slide {
  index: number;
  width: number;
  height: number;
  regions: TextRegion[];
  shapes: Shape[];
  background?: SlideBackground;
  defaultTextColor?: string;
}

export interface SlideEditorModel {
  mode: "slide";
  slides: Slide[];
}

// ---- Page mode (DOCX, future ODT, RTF) ----

export interface PageDimensions {
  widthPt: number;
  heightPt: number;
  marginTopPt: number;
  marginBottomPt: number;
  marginLeftPt: number;
  marginRightPt: number;
}

export interface ParagraphStyle {
  alignment?: "left" | "center" | "right" | "justify";
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  indentLeftPt?: number;
  indentFirstLinePt?: number;
}

export interface ParagraphBlock {
  type: "paragraph";
  segmentId: string;
  text: string;
  style: ParagraphStyle;
  runStyle: FontStyle;
}

export interface ImageBlock {
  type: "image";
  mediaPath?: string;
  contentType?: string;
}

export interface TableBlock {
  type: "table";
}

export interface PageBreakBlock {
  type: "pageBreak";
}

export type DocumentBlock =
  | ParagraphBlock
  | ImageBlock
  | TableBlock
  | PageBreakBlock;

export interface PageEditorModel {
  mode: "page";
  pageDimensions: PageDimensions;
  blocks: DocumentBlock[];
}

// ---- HTML preview mode ----

export interface HtmlPreviewEditorModel {
  mode: "html-preview";
  rawHtml: string;
}

// ---- Segment list mode (XLIFF, fallback) ----

export interface SegmentListEditorModel {
  mode: "segment-list";
}

// ---- Discriminated union ----

export type EditorModel =
  | SlideEditorModel
  | PageEditorModel
  | HtmlPreviewEditorModel
  | SegmentListEditorModel;
