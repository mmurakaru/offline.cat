# PPTX Attribute Mapping

PPTX is based on Office Open XML (OOXML), standardized as ECMA-376 / ISO/IEC 29500.
The DrawingML spec (`a:` namespace) covers text and shape formatting.

## Reference docs

- Full spec: [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/) (free PDF)
- Microsoft reference: [DrawingML docs](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/b3d65b46-a25f-4898-b3a2-3a4623a0151d)
- [python-pptx source](https://github.com/scanny/python-pptx) - practical reference for attribute mapping

## Currently supported

- [x] Text extraction and replacement (`a:r > a:t`)
- [x] Font size (`a:rPr @_sz` - hundredths of a point)
- [x] Bold / italic (`a:rPr @_b`, `@_i`)
- [x] Text color (`a:rPr > a:solidFill`, scheme colors with theme resolution)
- [x] Paragraph alignment (`a:pPr @_algn`)
- [x] Line spacing - percentage (`a:lnSpc > a:spcPct`)
- [x] Line spacing - absolute (`a:lnSpc > a:spcPts`)
- [x] Auto-fit font scale (`a:bodyPr > a:normAutofit @_fontScale`)
- [x] Shape position and size (`a:xfrm > a:off`, `a:ext`)
- [x] Solid fills (`a:solidFill`)
- [x] Image references (`a:blipFill`, `p:blipFill`)
- [x] Slide background (solid, image, scheme color)
- [x] Background inheritance (slide -> layout -> master)
- [x] Connector shapes (`p:cxnSp`)
- [x] Line shapes (`a:prstGeom prst="line"`)
- [x] Line color (`a:ln > a:solidFill`, `p:style > a:lnRef`)
- [x] Theme color resolution
- [x] Master text style inheritance (title, body, other)
- [x] Placeholder position inheritance from slide layout

## Missing - high impact

- [ ] **Font family** (`a:latin`, `a:ea`, `a:cs` - `@_typeface`) - biggest impact on text wrapping/overflow fidelity
- [ ] **Text box internal padding** (`a:bodyPr @_lIns/@_tIns/@_rIns/@_bIns`) - affects text positioning within shapes
- [ ] **Vertical text alignment** (`a:bodyPr @_anchor` - top/middle/bottom) - affects text position in box
- [ ] **Character spacing** (`a:rPr @_spc`) - affects text width/wrapping

## Missing - medium impact

- [ ] Underline (`a:rPr @_u`)
- [ ] Strikethrough (`a:rPr @_strike`)
- [ ] Space before/after paragraph (`a:spcBef`, `a:spcAft`)
- [ ] Bullet lists (`a:buNone`, `a:buChar`, `a:buAutoNum`)
- [ ] Shape rotation (`a:xfrm @_rot`)
- [ ] Shape flips (`a:xfrm @_flipH/@_flipV`)
- [ ] Gradient fills (`a:gradFill`)

## Missing - low impact for translation use case

- [ ] Shape geometry (`a:prstGeom` - rounded rects, arrows, etc.)
- [ ] Pattern fills
- [ ] Shadow effects (`a:effectLst`)
- [ ] 3D effects
- [ ] Animations / transitions

## Future: standalone package

Once we have enough coverage, extract the PPTX parsing into a standalone package
with utilities for OOXML attribute mapping. The format is well-documented and stable,
making it a good candidate for a reusable library.
