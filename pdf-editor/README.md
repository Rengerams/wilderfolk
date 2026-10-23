# PDF Studio — desktop PDF editor

PDF Studio is a PDF creation and editing application: create documents, edit pages and their content,
copy pictures out of a PDF, change every document detail, scan paper documents, make them searchable
with OCR, and export to other formats. It is fully self-contained in this folder and shares no code with
the Wilderfolk game app in the repository root.

## What it does

| Area | Capabilities |
| :--- | :--- |
| Documents | New documents (A4, A5, A3, Letter, Legal, Tabloid, square; portrait/landscape, 1–200 pages), open PDF/PNG/JPEG, save, save a copy, export |
| Pages | Reorder by dragging, rotate, duplicate, insert blank pages, delete, page thumbnails |
| Editing | Text boxes, highlights, rectangles, freehand drawing, placed pictures — move, resize, restyle, undo/redo |
| Pictures | Copy the picture inside any region of a PDF out into an editable image object |
| Details | Title, author, subject, keywords, creator, producer, creation date, modification date — all editable, cleared when you empty a field |
| Text in a file | Find and replace text that is already inside a PDF, matching the page's paper and ink colours |
| Forms | Read and fill the AcroForm fields of a fixed template, optionally flattening the values |
| Scanning | Scanner bridge (flatbed/feeder, A4–Legal, 150–600 dpi, native scanner window), camera capture, or scanned files |
| OCR | Recognize text per page or for the whole document, review and correct it line by line, then keep it as an invisible searchable layer |
| Storage | Local library on this PC by default; optional own cloud endpoint; optional AES-256 encryption with a passphrase |
| Formats | PDF (ready), PNG/JPEG/TXT export (ready), DOCX/HTML/ODT/SVG extension slots for future adapters |

## Running it

In the sandbox (Base44):

```bash
docker compose -f docker-compose.base44.yml up -d
# http://localhost:3000
```

Locally, with Node 22:

```bash
cd pdf-editor
npm install
npm run dev        # dev server on port 3000
npm run typecheck  # TypeScript, no emit
npm run test       # unit tests (vitest)
npm run build      # typecheck + production bundle
```

## Windows desktop packaging

The app is the UI layer of a desktop application: it is written to run in a native Windows shell and to
use local files, with no server component of its own. Package it with Tauri (the repository already uses
Tauri for its other app) or any WebView2 host:

```bash
cd pdf-editor
npm run build
# then wrap ./dist with a Tauri/WebView2 shell that serves it and provides native file dialogs
```

**Not built here:** this Linux sandbox cannot produce or verify a signed `.msi`/`.exe`. The browser build
is what runs and is verified here; creating the installer is a Windows-side step.

## Scanner hardware (`scan-bridge/`)

Browsers cannot talk to a scanner driver, so real scanner hardware goes through a small local bridge
service that runs on Windows: see [`scan-bridge/README.md`](scan-bridge/README.md). The Scan dialog talks
to it over a three-endpoint HTTP contract (`/devices`, `/scan`, and standard CORS). Without the bridge,
scanning still works through the camera and through files your scanner software saved.

## Storage: local library and optional cloud

* **Local library (default):** documents are saved in this device's browser storage. Nothing leaves the PC.
  Turn on library encryption to store them as AES-256-GCM ciphertext; the passphrase is kept in memory for
  the session only and is never written to disk.
* **Your own cloud endpoint (opt-in, off by default):** the editor speaks a small contract —
  `GET /documents` (list), `GET /documents/{id}` (download), `PUT /documents/{id}` (upload, answering
  `409` when it already holds a newer revision), `DELETE /documents/{id}`; bearer-token authentication.
  On a `409` the editor refuses to overwrite and asks you to open the newer copy first, so no version is
  silently lost; a document that cannot be uploaded stays open locally and is never dropped.

## Security

* Opened files are treated as untrusted: parsed only, never executed. Document JavaScript is never enabled.
* Rendering and OCR run in worker processes, so a damaged file cannot lock the editor.
* File size and page limits, and clear errors for damaged or password-protected files.
* Local-first storage; cloud is opt-in; no telemetry of any kind.
* Network access happens only for OCR language files (from the OCR engine's public server, once per
  language) and, when you enable it, your own cloud endpoint.

## Known limitations (deliberate, documented)

* Saving flattens objects into the page — this is how PDF editors behave; a saved document reopens with
  its text, highlights and pictures as part of the page rather than as movable objects.
* Find-and-replace works on text that is inside the PDF file. Text added in the editor is edited directly
  on the page instead. Replacement covers the old text with the page's own colour and retypes it in place,
  which is reliable for the fonts PDFs use, but a very unusual font or text on an image background can
  look slightly different from the original.
* The searchable OCR layer is written with the standard Helvetica font, so recognition is limited to
  Latin-script languages (the ones offered in the dialogs). Non-Latin scripts would need a font embedded
  in the PDF.
* OCR needs to download its language data once per language; without network access, recognition is
  unavailable but everything else keeps working.
* Camera capture needs a device with a camera and browser permission; inside a sandboxed preview browser
  this may be refused, in which case the scanner bridge or scanned files are the way in.
* Filling a form starts a fresh undo history, because the underlying file changes.

## Layout

```
pdf-editor/
  src/app/          state store (undo/redo), document actions, scan + OCR actions, file helpers
  src/pdf/          rendering (pdf.js), writing (pdf-lib), geometry, text replacement, form fields, OCR
  src/scan/         scanner bridge client, camera capture
  src/storage/      local library (IndexedDB), optional cloud provider, AES-GCM encryption, settings
  src/formats/      format adapter registry (one place to add a new import/export format)
  src/components/   title bar and menus, toolbar, thumbnails, page viewer, properties, status bar, dialogs
  scan-bridge/      Windows-side NAPS2 scanner bridge (reference implementation)
  tests/            unit tests for geometry, PDF writing, text replacement and form filling
```
