# Printing — technical notes

How PDF Studio turns the open document into printed sheets: the 150 dpi raster pipeline in
`pdf-editor/src/app/printActions.ts`, the hidden print sheet it builds, and the browser print dialog it
hands over to.

Printing never touches the saved file and never rasterises what is currently on screen. It rebuilds the
document with `buildCurrentPdf()` — the same bytes **Save** would write, including annotations, applied
OCR text layers and each page's final rotation — then renders that rebuilt PDF page by page.

---

## 1. Entry points

| Trigger | Where | Notes |
| :--- | :--- | :--- |
| **File ▸ Print…** (shortcut label `Ctrl+P`) | `pdf-editor/src/components/TitleBar.tsx` | Disabled while the document has no pages |
| `Ctrl+P` / `Cmd+P` | `pdf-editor/src/App.tsx` key handler | `preventDefault()` first, so the browser's own print of the app is never used |
| `commands.print()` | `pdf-editor/src/app/useCommands.ts` | Wraps `printDocument()` in the status-line helper with the label *"Preparing to print"* |

`useCommands` owns the user-visible feedback: the status line reads `Preparing to print…` while the
sheets are being rendered, and any thrown error becomes `⚠ <message>` in the same line. The guard message
`printDocument()` itself produces is *"There are no pages to print."* for an empty document, translated
through the normal `t()` catalog; anything else it throws comes from the rebuild or from opening the
temporary pdf.js document.

---

## 2. The 150 dpi rendering process

`PRINT_DPI = 150` and the pdf.js scale is `PRINT_DPI / 72` ≈ **2.0833** (PDF points are 1/72 inch, so a
150 dpi raster is 150/72 device pixels per point). `renderPageCanvas()` is called with `dpr: 1`, so the
print scale is not multiplied by the display's device pixel ratio — the output is exactly 150 dpi whatever
the monitor is.

Steps, in order:

1. **Read state and guard.** `useEditor.getState()`; a document with zero pages throws immediately.
2. **Rebuild the document.** `buildCurrentPdf()` → `buildPdfBytes({ …, includeOcr: true })` from
   `pdf-editor/src/app/documentActions.ts` / `pdf-editor/src/pdf/buildPdf.ts`. This is the source of truth
   for what gets printed: copied and blank pages, page order, annotations, metadata and the applied OCR
   layer (invisible text in the saved file, so it prints as nothing).
3. **Open the rebuilt bytes as a fresh pdf.js source.** `openPdfSource(bytes, name)` from
   `pdf-editor/src/pdf/render.ts`, which also enforces the 150 MB input limit.
4. **Render each page.** For `index` from `0` to `source.doc.numPages - 1`:
   - `renderPageCanvas({ source, srcIndex: index, totalRotation: 0, scale: PRINT_DPI / 72 })`.
   - `totalRotation: 0` is deliberate. The rebuilt PDF already carries each page's final `/Rotate`
     (`page.setRotation(degrees(totalRotation(ref)))` in `buildPdf.ts`), and pdf.js's `getViewport()`
     defaults to the page's own rotation, so passing `0` here means "use what the file says". Passing the
     editor rotation again would apply it twice.
   - The page is painted onto a white background (`background: "#ffffff"`), never transparent.
   - `MAX_RENDER_PIXELS` (14,000,000) still applies inside `renderPageInto()` via `clampScale()`. Pages
     whose 150 dpi raster would exceed that budget (roughly A1 and above) render at a reduced effective
     scale and set `canvas.dataset.renderScale`; CSS then scales the image to the sheet, so such a page
     prints slightly softer than an A4 page.
5. **Encode to PNG.** `canvas.toBlob(resolve, "image/png")`. A `null` blob means the page could not be
   encoded and it is skipped (`continue`); the rest of the document still prints.
6. **Stage it on the sheet.** `URL.createObjectURL(blob)` → `<img src=… alt="">` appended to a detached
   `div.print-sheet`. The URL is remembered in `urls` for cleanup; `alt=""` is correct because the image
   is the whole page, not an illustration.
7. **Mount and wait for decodes.** The sheet is appended to `document.body`, and every `<img>` is awaited
   with `image.decode().catch(() => undefined)` so the browser has pixels before the dialog opens. A decode
   failure is not fatal: the sheet is already attached and the print dialog still opens.

### Why 150 dpi

| Page | Points | Pixels at 150 dpi | Pixels |
| :--- | :--- | :--- | ---: |
| A4 | 595 × 842 | 1240 × 1754 | 2.17 M |
| Letter | 612 × 792 | 1275 × 1650 | 2.10 M |
| A3 | 842 × 1191 | 1754 × 2480 | 4.35 M |
| Tabloid | 792 × 1224 | 1650 × 2550 | 4.21 M |
| A2 | 1191 × 1684 | 2480 × 3508 | 8.70 M |
| A1 | 1684 × 2384 | 3508 × 4966 | 17.4 M → clamped to the 14 M budget |

150 dpi keeps text and line art sharp on paper at normal reading distance. It is half the 300 dpi often
quoted for photographs, which trades fine detail for a page bitmap a quarter of the size — and all pages
are staged up front as PNG blobs held in object URLs, sequentially, with no streaming and no cancellation
hook. Memory therefore grows with page count × page raster size, so a very long, image-heavy document is
the expensive case.

---

## 3. The print sheet and its CSS

The staging element and the print rules live in `pdf-editor/src/styles/app.css` under
`/* ---------- printing ---------- */`:

* `.print-sheet { display: none; }` — the sheet stays invisible in the running app even while attached.
* `@page { margin: 8mm; }` — a uniform 8 mm paper margin for every printed page. This rule is global to
  the document, not scoped to the print sheet.
* `@media print`:
  - `.app { display: none !important; }` — the whole editor UI is hidden.
  - `.print-sheet { display: block; }` — only the rendered pages remain visible.
  - `.print-sheet img { display: block; width: auto; height: auto; max-width: 100%; max-height: 98vh;
    margin: 0 auto; break-after: page; }` — each page image is centred, never enlarged beyond the content
    box or taller than 98 % of the sheet, and followed by a page break so one image occupies one sheet.

The 98 % height cap keeps a page whose aspect ratio plus the 8 mm margins would otherwise overflow the
sheet from spilling onto a second, empty sheet. Every image carries `break-after: page`, including the
last; if a browser does emit a trailing blank sheet, that break is where it comes from — the editor itself
never stages an empty page.

---

## 4. Print dialog lifecycle and the 120 s timeout

`whenPrintDialogCloses()` resolves exactly once:

* `window.print()` is called **after** the `afterprint` listener and the watchdog timer are registered, so
  a dialog that fires `afterprint` synchronously cannot be missed.
* `afterprint` is registered with `{ once: true }` and calls `done()`, which clears the timeout, removes
  the listener and resolves.
* `PRINT_TIMEOUT_MS = 120_000` is the watchdog for environments where `afterprint` never fires (an
  embedded webview, a headless print, a dismissed-without-event preview). Without it the object URLs and
  the pdf.js document would be held for the lifetime of the page.

This is where `printActions.ts` hands control to the browser. Page range, copies, printer selection,
orientation and paper size belong to the browser's own dialog and are not touched by the editor; the editor
only guarantees one image per sheet, in document order.

---

## 5. Cleanup and failure handling

Everything after the sheet is created runs inside a `try/finally`, so a throw anywhere in the render loop
still tears down:

* `sheet.remove()` — the staging DOM is removed.
* `URL.revokeObjectURL(url)` for every URL created — no blob stays referenced.
* `await closePdfSource(source)` — `source.task.destroy()` stops the pdf.js worker for the temporary
  document.

Failure modes and their outcome:

| Situation | Outcome |
| :--- | :--- |
| Empty document | Throws *"There are no pages to print."*; status line shows `⚠ …`; nothing is rendered |
| A page fails to encode (`toBlob` → `null`) | That page is skipped, the rest still print |
| An `<img>` fails to decode | Ignored; printing continues with whatever decoded |
| `afterprint` never fires | The watchdog resolves after 120 s and cleanup runs |
| The rebuilt PDF cannot be parsed | `openPdfSource()` throws; cleanup runs; the error surfaces in the status line |

---

## 6. Deliberate limitations

* **Raster output.** Printing goes through page bitmaps, so printed text is not selectable or searchable,
  and "Print to PDF" produces an image-only PDF. The viewer's text and link layers (`PageTextLayer.tsx`,
  `PageLinkLayer.tsx`) play no part in printing.
* **Whole document only.** The app has no page-range picker; use the browser dialog's page range, which maps
  cleanly because the sheet is a sequence of single-page images.
* **No headers, footers or page numbers** are drawn onto the sheets.
* **Browser-dependent page setup.** Margins come from `@page` (8 mm) and sizing from `max-width` /
  `max-height`; a browser that ignores `@page` uses its own default margins.
* **One source of truth.** Pages print from `buildCurrentPdf()`, so unsaved edits are included, printing
  never requires saving first, and printing never marks the document clean.

---

## 7. Verifying a change

There are no unit tests for `printActions.ts` — it depends on canvas, blob URLs and `window.print()` — so
verify by hand in the running editor:

1. Open a document with several pages, at least one annotation, and (optionally) an applied OCR layer.
2. **Ctrl+P** and, in the print preview, confirm: one page per sheet, pages in document order, the
   annotation visible, the editor UI absent from the sheet, and no blank leading sheet.
3. Cancel the dialog and confirm the status line returns to normal, the app is interactive again, and no
   `.print-sheet` element remains in the DOM (`document.querySelector(".print-sheet") === null`).
4. Repeat with a rotated page (the rotation must appear once, not twice) and with an empty document (the
   menu item reports *"There are no pages to print."* and no dialog opens).

Static checks for the app, run inside `pdf-editor/`:

```bash
npm run typecheck
npm run test
npm run build
```
