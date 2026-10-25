# PDF Studio 0.1.0
**A Modern, Powerful, and Accessible PDF Editing Solution**

*An independent software project developed by Renger Vegting.*

## Project Introduction

PDF documents are used everywhere, yet working with them is often more complicated than it should be. Simple tasks such as modifying text, rearranging pages, extracting images, or converting scanned documents frequently require multiple applications, expensive software subscriptions, or unnecessarily complex workflows.

**PDF Studio was developed to address these challenges.**

The project focuses on building a comprehensive desktop PDF editor that combines essential and advanced document editing capabilities into one streamlined application. Rather than forcing users to adapt to complicated software, PDF Studio aims to make document editing straightforward, efficient, and accessible.

The objective is not simply to provide another PDF viewer, but to create a practical editing environment where users can take full control of their documents.

## About the Developer

**Renger Vegting — Independent Software Developer**

PDF Studio is an independently developed software project driven by an interest in building functional applications that solve real-world problems.

The development approach prioritizes clean architecture, reliable functionality, efficient performance, and intuitive user experiences. The emphasis is on creating software that works the way users expect, without unnecessary restrictions or complexity.

## Core Functionality

PDF Studio brings essential document management and editing tools together in a single desktop application:

- **PDF Creation & Editing:** Create documents, modify existing pages, and manage page layouts.
- **Content Editing:** Add and edit text, images, and other document elements.
- **Annotations & Drawing:** Highlight content, add notes, and create custom drawings.
- **Document Management:** Modify document properties and reorganize pages.
- **Image Extraction:** Extract embedded images directly from PDF documents.
- **Scanning & OCR:** Digitize paper documents and convert scanned content into searchable PDFs.

## Project Vision

The long-term vision is to develop PDF Studio into a reliable, feature-rich alternative to conventional PDF editing solutions, without sacrificing simplicity or performance.

Development is guided by four principles: **functionality, efficiency, accessibility, and user control.**

Every feature should have a clear purpose, improve productivity, and contribute to a consistent editing experience.

## Development Status

**Version 0.1.0 — Initial Development Release**

PDF Studio is currently in its early development stage. This first version establishes the foundation for future improvements, additional editing capabilities, performance optimizations, and interface refinements.

The project will continue to evolve toward a complete, practical, and accessible desktop PDF editing solution.

**PDF Studio — PDF editing without unnecessary complexity.**

---

The application lives in this folder and shares no code, build or stored data with the Wilderfolk game app
in the repository root. The rest of this readme documents what it does today, how to run it, and how the
Windows installer is built.

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
npm run desktop    # the same editor in the Windows desktop shell (needs Rust + WebView2)
```

## Install on Windows

The desktop shell is in [`src-tauri/`](src-tauri), a Tauri 2 application that loads the built editor and
packages it as a normal Windows program. `npm run installer` produces two real installers:

| File | What it is |
| :--- | :--- |
| `src-tauri/target/release/bundle/nsis/PDF Studio_0.1.0_x64-setup.exe` | Setup program (NSIS) — recommended download |
| `src-tauri/target/release/bundle/msi/PDF Studio_0.1.0_x64_en-US.msi` | MSI for managed machines |

The setup program installs for the current user only, so it needs no administrator rights. It offers an
installer language (English or Dutch), creates a Start-menu entry and an optional desktop shortcut, adds
an uninstaller in *Apps & features*, and installs the Microsoft Edge WebView2 runtime when the machine does
not have it yet.

To build it, on Windows with Rust (`rustup`) installed:

```bash
cd pdf-editor
npm ci
npm run installer   # tauri build; fetches NSIS and WiX itself
```

The `PDF Studio installer` workflow builds the same files on a Windows runner:

* **Download a release** — push a `pdf-studio-v*` tag and the workflow publishes the `.exe` and `.msi` on
  the repository's Releases page, where Windows users can download them directly.
* **Build without a tag** — start the workflow by hand and download `pdf-studio-windows-installer` from
  the run's artifacts.

`npm run desktop` runs the editor inside that shell during development, against the Vite dev server.

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
  language) and, when you enable it, your own cloud endpoint. The desktop shell sets no content-security
  policy of its own for the same reason: the editor loads its workers and OCR data itself.

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
  src-tauri/        Tauri desktop shell and app icons that build the Windows installer
  tests/            unit tests for geometry, PDF writing, text replacement and form filling
```
