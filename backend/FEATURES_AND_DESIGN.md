# Features and Design

---

## 1. 📄 Structure-Preserving Translation (MinerU → Gemini)

### The Problem
MinerU produces high-quality structured markdown with:
- Precise heading levels (`#`, `##`, `###`)
- Accurate table formatting (`|---|---|`)
- Formula blocks (LaTeX)
- List hierarchies
- Page break markers

If Gemini reformats this during translation, we lose the carefully extracted structure.

### The Solution: Translation-Only Mode
Gemini is instructed to **ONLY translate text content** while preserving:

1. **Exact Markdown Structure**: Headers, lists, tables unchanged
2. **Formatting Markers**: `**bold**`, `*italic*`, code blocks
3. **Technical Content**: Standards codes (EN 13001), formulas, variables
4. **Whitespace**: Line breaks, indentation levels

**Prompt Engineering:**
```
CRITICAL: You are a TRANSLATOR, not a formatter.
- Keep ALL markdown syntax EXACTLY as provided
- Only translate the text content between formatting markers
- Do NOT add, remove, or restructure any markdown elements
```

---

## 2. 🧩 Smart Batching & Semantic Chunking

To prevent API Rate Limits and maintain translation quality, we implemented a `SmartBatcher` service (`services/smart_batcher.py`).

### The Problem
*   **Token Limits**: Sending a 500-page PDF at once exceeds output token limits.
*   **Context Loss**: Sending sentence-by-sentence loses the surrounding context (e.g., "This Agreement..." refers to the document header).
*   **Rate Limits**: Making 1,000 requests for 1,000 paragraphs triggers API 429 errors.

### The Solution: Semantic Aggregation
The `SmartBatcher` processes the raw MinerU output with the following logic:

1.  **Hard Boundaries**: It *never* merges a Header with the following paragraph into the same string, but keeps them in the same *batch* context.
2.  **Soft Limits**: It accumulates text blocks until a "Safe Threshold" (currently ~2000 characters) is reached.
3.  **Look-Ahead**: If adding the next paragraph would exceed the limit, it closes the current batch.

**Result**: 
*   Reduces API calls by ~90% (grouping 20+ paragraphs per call).
*   Preserves semantic context for the AI.

---

## 3. 🔄 Iterative Translation (Human-in-the-Loop)

Translation is rarely perfect on the first try. Guided-Translator implements a **State-Based Workflow** stored in SQLite.

### Node States
1.  `pending`: Extracted by MinerU, waiting for Gemini.
2.  `review_required`: Translated, but the AI flagged low confidence or ambiguity.
3.  `approved`: User has verified the text.
4.  `completed`: Final state ready for export.

### The Workflow
1.  **Auto-Translation**: As soon as parsing finishes, the system automatically processes `pending` nodes.
2.  **Review Queue**: The Frontend `SplitView` provides a specific filter for "Needs Review".
3.  **User Action**: The user can:
    *   **Edit**: Correct the text manually.
    *   **Approve**: Mark as done.
    *   **Re-translate**: Trigger a re-translation with a user-provided hint.

---

## 4. 🛡️ Rate Limit & Failure Handling

### Exponential Backoff
- Retry delays: 1s → 2s → 4s → 8s → 16s
- Jitter (±25%) to prevent thundering herd
- API key rotation on 429 errors

### Background Task Queue
Translation is decoupled from the HTTP Request/Response cycle. 
*   When parsing completes, a **FastAPI Background Task** is spawned.
*   If a batch fails, only that specific subset of nodes is marked `failed`, allowing for granular retries.

---

## 5. 📚 Glossary Injection

### Implementation
*   Users upload a `glossary.csv` (English → Chinese)
*   The `GeminiClient` dynamically injects matching terms into the System Prompt
*   Terms are stored in SQLite for persistence

---

## 6. 🚀 Future Improvements (Roadmap)

### Visual Context
*   Since MinerU provides bounding boxes (`bbox`), we can crop the image of the paragraph and send it to Gemini (Multimodal).
*   Use Case: Translating charts, graphs, or text that depends on visual layout.

### Smart Export
*   Use `Paged.js` to render the `approved` nodes back into a PDF that respects the original layout, handling text expansion (e.g., Chinese is typically 30% shorter than English) by adjusting font size dynamically.
