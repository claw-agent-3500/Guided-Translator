# Proposal: Use MinerU JSON from ZIP to Improve PDF Generation

## Problem Summary

Our current PDF pipeline has 3 critical issues:
1. **Layout mismatch** — translated text doesn't preserve original formatting
2. **Tables are plain text** — `<table>`, `<td>`, `<tr>` rendered as literal text  
3. **Images broken** — `![]()` and `<img>` tags appear as raw text in PDF

**Root cause**: Our pipeline only reads `.md` files from MinerU's ZIP output, ignoring the structured JSON that contains layout data, table structures, and image mappings.

---

## Current Pipeline vs Proposed Solution

### Current (Broken) Pipeline
```
PDF → MinerU Cloud → ZIP → Extract .md → Plain text chunks → Translation → fpdf2 PDF
                                              ↑
                                    Only reads .md files
                                    Ignores JSON structure
```

### Proposed Pipeline
```
PDF → MinerU Cloud → ZIP → Parse content_list.json → Structured chunks → Translation → Rich PDF
                                            ↓
                              Tables: Row/column metadata
                              Images: Paths, dimensions, positions
                              Layout: Heading levels, block types, ordering
```

---

## MinerU ZIP Contents (What We're Missing)

The ZIP file MinerU returns actually contains:

| File | Current Usage | Proposal |
|------|---------------|----------|
| `*.md` | ✅ Used | Keep as fallback |
| `content_list.json` | ❌ Ignored | **Primary** - extract tables, images, structure |
| `images/` folder | ❌ Ignored | **Extract** - embed images in PDF |
| Layout visualization | ❌ Ignored | Debug only |

### Key JSON Structure (`content_list.json`)

MinerU's JSON contains structured blocks with:

```json
{
  "type": "table" | "image" | "text" | "title" | "list",
  "text": "...",
  "img_path": "images/xxx.png",  // For images/tables as images
  "order": 123,                   // Reading order
  "bbox": [x0, y0, x1, y1],       // Original position (for layout reference)
  "rows": [...],                   // For tables: row/cell structure
  "columns": [...]                 // For tables: column metadata
}
```

---

## Content Type Handling: Different Treatment Required

Yes — **images and tables fundamentally need different treatment** than text throughout the entire pipeline:

| Stage | Text | Table | Image |
|-------|------|-------|-------|
| **Mining (MinerU)** | Plain paragraph | HTML `<table>` + JSON structure | `![]()` + binary in ZIP |
| **Translation** | Translate entire block | Translate cell text, preserve HTML structure | **Don't translate** — pass through |
| **Storage (DB)** | Store translated text | Store table HTML/structure | Store image ref + alt text |
| **Editor UI** | Editable textarea | Table editor / HTML preview | Image thumbnail + metadata panel |
| **PDF Export** | `multi_cell()` text | Real `<table>` → WeasyPrint | `<img>` with proper dimensions |

### Translation Strategy by Type

#### Text (paragraph/heading/list)
```python
# Standard Gemini translation prompt
"Translate this text to Chinese:"
```

#### Table  
```python
# Extract cell text → translate → preserve HTML structure
cells = extract_table_cells(html)      # Get raw text from each <td>
translated_cells = [translate(text) for text in cells]  # Only translate text
return rebuild_table(translated_cells, structure)  # Keep table structure intact
```

#### Image
```python
# Don't translate, just pass through
return {
    "type": "image",
    "image_data": zip.extract(image_path),       # Extract binary from ZIP
    "alt_text": translate(caption) or "",         # Optional: translate caption
    "original_size": {"width": w, "height": h},
    "stored_path": f"documents/{doc_id}/images/{filename}"  # Store locally
}
```

### UI Rendering by Type

```tsx
// Editor display per chunk type
{chunk.type === 'table' ? (
    <div className="table-editor">
        <div dangerouslySetInnerHTML={{__html: chunk.translation}} />
        {/* Future: Visual table cell editor */}
    </div>
) : chunk.type === 'image' ? (
    <div className="image-editor">
        <img src={getImageUrl(chunk)} alt={chunk.alt} style={{maxWidth: '100%'}} />
        <input value={chunk.alt} onChange={updateAlt} placeholder="Caption" />
    </div>
) : (
    /* Standard text */
    <textarea value={chunk.translation} onChange={updateTranslation} />
)}
```

---

## Implementation Plan

### Phase 1: Extract JSON Data (Backend Changes)

**File**: `backend/services/mineru_service.py`

**Changes**:
```python
# Current: Only reads .md files
md_files = [f for f in file_list if f.endswith('.md')]

# New: Also extract JSON and images
json_files = [f for f in file_list if f.endswith('.json') and 'content' in f]
image_files = [f for f in file_list if f.startswith('images/')]

# Parse content_list.json to get structured blocks
```

**New function**: `extract_structured_content(zip_buffer)` → returns:
- `blocks[]`: List of typed content blocks (heading/paragraph/table/image)
- `image_map`: Dict mapping image paths to binary data
- `table_count`: How many tables found
- `image_count`: How many images found

### Phase 2: Enhanced Chunk Pipeline

**File**: `backend/routers/parse.py`

**Changes**:
1. Store original block type in DB (`heading`, `table`, `image`, `paragraph`)
2. Store image references with each chunk
3. Store table structure (rows/columns) with table chunks

**Database changes needed**:
```python
# Add to Node table:
"original_type": "text" | "table" | "image" | "heading"
"image_refs": ["/images/0.png", "/images/1.png"]  # Image paths
"table_structure": {"rows": int, "columns": int, "html": str}  # Table metadata
```

### Phase 3: Enhanced PDF Generation

**Option A: Keep fpdf2, add table/image support**

**File**: `backend/services/pdf_export.py`

**Changes**:
- Add `add_table()` method using `multi_cell()` grid
- Add `add_image()` method using `self.image()`  
- Parse table structure → render as cells
- Embed images at correct positions

**Pros**: No new dependencies
**Cons**: fpdf2 is limited for complex layouts

**Option B: Switch to WeasyPrint (Recommended)**

**File**: New `backend/services/weasyprint_export.py`

**Changes**:
- Install: `pip install weasyprint`
- Generate HTML with proper tables (`<table>`) and images (`<img>`)
- CSS styling for layout control
- WeasyPrint handles CJK fonts, tables, images natively

**Pros**: Real HTML rendering, CSS control, better tables/images
**Cons**: One new dependency

### Phase 4: Frontend Export Enhancement

**File**: `src/components/PrintExportModal.tsx`

**Changes**:
- Display table chunks as actual HTML tables in preview
- Embed images with correct sizing (e.g., `max-width: 100%`)
- Show block type icons in preview (📊 table, 🖼️ image, 📄 text)
- Add CSS for table styling in print view

---

## Data Flow Example

### Before (Current)
```
MinerU ZIP → markdown: "Title\n\nParagraph 1\n\n<table>...</table>\n\n![fig](images/1.png)"
           ↓
Chunk 0: "Title" (type: paragraph - wrong!)
Chunk 1: "Paragraph 1" (type: paragraph)
Chunk 2: "<table>..." (type: paragraph - broken!)
Chunk 3: "![fig](...)" (type: paragraph - broken!)
           ↓
PDF: All same style, tables and images as literal text
```

### After (Proposed)
```
MinerU ZIP → JSON blocks:
  Block 0: {type: "title", text: "Title", order: 1}
  Block 1: {type: "text", text: "Paragraph 1", order: 2}
  Block 2: {type: "table", rows: [...], html: "<table>...</table>", order: 3}
  Block 3: {type: "image", img_path: "images/1.png", bbox: [x,y,w,h], order: 4}
           ↓
Chunk 0: "Title" (type: heading, level: 1)
Chunk 1: "Paragraph 1" (type: paragraph)
Chunk 2: Table data (type: table, structure: {...})
           ↓ Translate cells only → rebuild HTML
Chunk 3: Image ref (type: image, path: "images/1.png")
           ↓ Don't translate, extract to disk
           ↓
PDF: Proper heading + real table + embedded image at correct size
```

---

## Effort Estimate

| Phase | Complexity | Time |
|-------|------------|------|
| 1. Extract JSON | Low | 2-3 hours |
| 2. Update DB schema + chunk detection | Medium | 3-4 hours |
| 3A. fpdf2 enhancement | High | 4-6 hours |
| 3B. WeasyPrint (recommended) | Medium | 3-4 hours |
| 4. Frontend updates (editor + export) | Medium | 3-4 hours |
| **Total** | | **~14-20 hours** |

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSON structure varies across MinerU versions | Medium | Add schema validation, fallback to current .md parsing |
| Large ZIP files with many images | Low | Stream processing, size limits |
| Table structure parsing errors | Low | Validate before storing, graceful fallback |
| WeasyPrint font issues | Medium | Use same Noto Sans SC font as current approach |
| Translation messes up table HTML | High | Extract cell text first → translate → rebuild (never translate raw HTML) |
| Image size mismatches | Medium | Use original bbox dimensions from JSON, store aspect ratio |

---

## Recommendation

**Start with Phase 1 only first** — extract and log the JSON to understand the actual structure in your documents. Once we see the real JSON format, we can adjust the implementation accordingly.

Then proceed with:
1. **Phase 2** — Store structured chunks in DB
2. **Phase 3B** — Switch to WeasyPrint for proper PDF rendering

---

## Next Steps

1. Update MinerU service to extract `content_list.json` from ZIP
2. Parse and log the actual block types (table vs text vs image)
3. Based on real structure, implement smart translation by type
4. Switch to WeasyPrint for PDF generation

Want me to start Phase 1 now?
