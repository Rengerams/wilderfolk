# PDF Studio — Architecture

How the program is put together: the layers, the data model, and why it is shaped this way.
Companion to [`README.md`](README.md); the Windows-side scanner bridge has its own
[`scan-bridge/README.md`](scan-bridge/README.md).

## 1. Big picture

PDF Studio is a **web-first editor with a desktop shell**:

```
┌────────────────────────────────────────────────────────────┐
│ Windows desktop shell (Tauri 2)                             │
│  src-tauri/  — window, plugins (fs, dialog), capabilities   │
├────────────────────────────────────────────────────────────┤
│ The editor (one React + Vite + TypeScript app)              │
│  src/app/        state, undo/redo, document actions         │
│  src/components/ chrome (menus, toolbar, pages, dialogs)    │
│  src/pdf/        reading (pdf.js) and writing (pdf-lib)     │
│  src/scan/       scanner bridge client, camera capture      │
│  src/storage/    library: IndexedDB, cloud, encryption      │
│  src/formats/    import/export adapter registry             │
│  src/i18n/       language catalog                           │
├────────────────────────────────────────────────────────────┤
│ Local processes                                             │
│  scan-bridge/  — optional NAPS2 scanner bridge (Windows)    │
└────────────────────────────────────────────────────────────┘
```

The same frontend that runs in a browser (dev server or `vite build`) is what the desktop shell
loads: `tauri.conf.json` builds it first (`beforeBuildCommand`) and bundles `../dist` into the
installer. That is why a browser preview and the Windows app behave identically, and why the
Windows-only pieces (Tauri, scan bridge) are thin adapters, not a second app.

**Libraries (verified in `package.json`):**

| Concern | Library | Why |
| :--- | :--- | :--- |
| Reading / rendering PDFs | `pdfjs-dist` 6 | Renders to canvas, extracts text and links, runs in a worker |
| Writing PDFs | `@cantoo/pdf-lib` 2 (fork) | Full write model; chosen fork also decrypts password-protected files |
| OCR | `tesseract.js` 7 | Runs in a worker with a WebAssembly core; engine and language packs ship inside the app |
| State | `zustand` | One store, no middleware ceremony |
| Desktop shell | Tauri 2 + NSIS/WiX | Small Windows installers, per-user install |

## 2. Document model (`src/types.ts`)

The single most important file. Everything that is saved, undone or rendered derives from it.

* **Pages are `PageRef`s**, not bitmaps. A page either points into the opened source document
  (`kind: "source"`, with `srcIndex` and the rotation the file arrived with) or is `kind: "blank"`
  with its own size. Rotation is `0 | 90 | 180 | 270`; a user rotation is kept separate from the
  page's authored rotation.
* **Coordinates are normalized (0..1) in unrotated page space.** Annotations, watermarks,
  signatures and stamps share this space, so a zoom change, rotation or paper-size change never
  re-scales placed marks. `src/pdf/geometry.ts` is the only place that converts between normalized
  space, rotated screen space and PDF points (`pdfRect`).
* **Annotations are a discriminated union** (`text`, `highlight`, `rectangle`, `draw`, `image`,
  …) plus document-level extras: `DocMetadata`, `Watermark`, `OcrLayer`. This keeps invalid
  states unrepresentable — a draw mark has points, a text mark has a rect and a font size, and no
  annotation carries both.
* **The undo history is document snapshots** (`DocSnapshot`), not patches: cheap because the heavy
  bytes (the source PDF) live outside the snapshot, in the source registry.

## 3. State and actions (`src/app/`)

* `store.ts` — the zustand store holding `DocState` (pages, annotations, metadata, OCR layers,
  selection, zoom, active tool, dialogs), with undo/redo stacks of snapshots.
* Actions are plain modules that mutate document state behind the store:
  `documentActions.ts`, `pageTools.ts` (page reorder/rotate/duplicate/insert/delete),
  `textActions.ts` (find & replace inside the file), `formActions.ts` (AcroForm fill),
  `splitActions.ts`, `printActions.ts`, `scanActions.ts`, `ocrActions.ts`, `files.ts` (open/save),
  `passwordPrompt.ts`.
* `sourceRegistry.ts` — the **live pdf.js handle is deliberately outside the store and outside
  undo history**: the document state describes *what* the document is, the registry holds the
  *open handle* needed to render it. Closing a document is dropping the registry entry.

## 4. Rendering pipeline (`src/pdf/render.ts`, `src/pdf/pageCache.ts`, `PageViewer.tsx`)

1. On open, `decrypt.ts` handles password-protected files (via the pdf-lib fork), and `render.ts`
   builds a `PdfSource` — the pdf.js document plus per-page metadata.
2. `PageViewer` renders **one canvas per page explicitly** (no virtualized dependency), with a
   cancellation signal per render so a fast scroll or a zoom change cancels stale work.
3. `pageCache.ts` keeps a small bitmap cache (6 pages, 12M pixels) so revisited and prefetched
   pages paint without re-rendering; long documents stay responsive because only visible pages
   render.
4. `PageTextLayer` draws the selection/copy layer, `PageLinkLayer` the clickable links (restricted
   to `http`, `https` and `mailto` schemes). `ThumbnailRail` lazy-renders thumbnails.
5. Hard limits live in `render.ts`: 150 MB source files, 14M pixels per render — a damaged or
   absurd document degrades to an error, never to a frozen UI. Rendering happens inside the pdf.js
   worker, so a broken page cannot lock the main thread.

## 5. Writing pipeline (`src/pdf/buildPdf.ts` and friends)

Saving is a **flattening write**: the store's document model is replayed onto a new pdf-lib
document. One module, `buildPdf.ts`, is the single writer; helpers feed it:

The build runs **on its own thread**: `writeBridge.ts` sends a `BuildInput` (plain data — pages,
annotations with their data URLs, source bytes) to `writeWorker.ts`, a dedicated Web Worker that
answers one `buildPdfBytes` call per message. Save, export and split therefore never block the
interface, and a crashed worker fails its waiting calls and is rebuilt on the next request.
`buildPdfBytes` stays worker-agnostic — its Vitest tests run it on the plain test thread — and the
bridge holds no logic beyond request/response bookkeeping.

* `markImages.ts` renders signatures and stamps to bitmaps; `pageStamps.ts` bakes page numbers
  and watermarks as ordinary text.
* `textReplace.ts` covers found text with the page's own paper/ink colour and retypes it —
  reliable for the standard PDF fonts, and documented as a limitation elsewhere.
* `formFields.ts` reads and fills AcroForm fields, optionally flattening values.
* `metadataTags.ts` reads and writes every Info-dictionary tag (including arbitrary custom tags)
  and keeps the raw XMP packet for reference.
* `splitPdf.ts` splits by page count, maximum file size or ranges, reporting per-part progress; each
  part is one off-thread build.

Because a save rewrites the file, a filled form starts a fresh undo history — the model treats
"the file changed underneath us" as a new document.

## 6. i18n (`src/i18n/`)

A centralized catalog: `languages.ts` declares the languages, `nl.ts` (and future files) hold the
catalogs, `translate.ts` is the single `t()` entry point. A Vitest scan of source strings keeps
the catalogs consistent with the code. There is no runtime i18n dependency.

## 7. Scanning (`src/scan/`, `scan-bridge/`)

* `bridge.ts` speaks a three-endpoint HTTP contract to the Windows-side NAPS2 bridge
  (`/devices`, `/scan`); `camera.ts` is the fallback capture path; scanned files open like any
  PDF. Without the bridge, the editor loses only flatbed/feeder scanning.
* The bridge is hardened on both sides: an origin allowlist in `Program.cs`
  (`PDFSTUDIO_ALLOWED_ORIGINS`) means only the editor's own origins can start a scan, and scan
  DPI is clamped to 50–600.

## 8. Storage (`src/storage/`)

* **Local library (default):** documents live in this device's IndexedDB. Nothing leaves the PC.
* **Optional cloud (off by default):** `providers.ts` speaks a small contract — list, download,
  upload (`409` on a newer revision refuses the overwrite), delete, bearer token. A document that
  fails to upload stays open locally and is never dropped.
* **Encryption:** `crypto.ts` wraps library writes in AES-256-GCM. Passphrases derive keys with
  PBKDF2-SHA-256 at 600 000 iterations (150 000 accepted only to decrypt legacy records); the
  passphrase lives in memory for the session and is never written to disk.
* `settings.ts` holds app settings separately from documents, so they survive document deletes.

## 9. Formats (`src/formats/registry.ts`)

One registry lists every import/export format with its adapter status (`ready`/`planned`).
PDF, PNG, JPEG and TXT are ready; DOCX, HTML, ODT and SVG are declared slots so a future adapter
lands in one place instead of threading a switch through the UI.

## 10. Desktop shell (`src-tauri/`)

* `tauri.conf.json` — window starts maximized, CSP is explicit, bundle targets NSIS + MSI with
  per-user NSIS install (`currentUser`), English/Dutch installer languages.
* `capabilities/default.json` — the ACL for the `main` window: the core defaults plus the
  dialog and fs plugin permissions (`dialog:allow-open`/`allow-save`,
  `fs:allow-read-text-file`/`allow-write-text-file`/`allow-read-file`/`allow-write-file`).
  The plugins themselves are dependencies in `Cargo.toml` and registered in `lib.rs`; the
  frontend currently calls none of these APIs yet — the capability is there for file-open/save
  integration, and Tauri rejects any unlisted permission at build time.
* `lib.rs` builds the builder (plugins registered) and `main.rs` only suppresses the console
  window in release builds — the shell deliberately contains no application logic.
* The Windows installer also carries `public/ocr` (the tesseract.js worker, its WebAssembly core
  and all ten language packs), prepared by `scripts/prepare-ocr-assets.mjs` during `dev`/`build`,
  so OCR never needs the network.

## 11. Testing (`tests/`)

Vitest unit tests sit next to the risk, not the file count: geometry conversions, PDF writing
(`buildPdf`, `splitPdf`, `markImages`, `pageStamps`, `metadataTags`), text replacement, form
fields, decryption, the store's history, the storage crypto, the i18n catalogs, and the OCR asset
preparation. Rendering and OCR are exercised through their pure inputs/outputs; the browser is
only needed for the end-to-end check.

## 12. Build and CI

* `npm run dev` / `npm run build` both run `prepare-ocr-assets.mjs` first (downloads the OCR
  engine once into `public/ocr`, git-ignored, so the repo stays clean).
* `npm run installer` = `tauri build` → `dist` → NSIS + MSI under `src-tauri/target/release/bundle/`.
* A GitHub Actions workflow ("PDF Studio installer") builds the same installers on a Windows
  runner: on a `pdf-studio-v*` tag it publishes the `.exe`/`.msi` as release assets.
* In the Base44 sandbox the web app runs from `docker-compose.base44.yml` (Vite dev server on
  port 3000, bind-mounted source); the Rust shell and the scanner bridge are Windows-only.
