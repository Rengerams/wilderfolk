# PDF Studio scan bridge (Windows)

Browsers cannot talk to a scanner driver directly, so scanner hardware is reached through this small
local service. It runs on the Windows PC that has the scanner attached and exposes one HTTP endpoint that
PDF Studio's Scan dialog calls.

**Status: reference implementation, not built or verified in the Linux sandbox.** It needs the .NET SDK,
a Windows machine and a real scanner. It is committed so the contract is explicit and the Windows side
can be built and run without guessing.

## Contract

The service listens on `http://127.0.0.1:8765` and only answers browser requests whose `Origin` is
the editor's own (the Tauri origins, plus any comma-separated extra origins in the
`PDFSTUDIO_ALLOWED_ORIGINS` environment variable). Other origins get `403`, so a hostile website
cannot start a scan or read scanned pages. Non-browser clients on the same PC send no `Origin`
header and are allowed.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/devices` | `{"devices":[{"id":"...","name":"..."}]}` — the same list `ScanController.GetDeviceList()` returns |
| `POST` | `/scan` | Body: `{"deviceId?","paperSource":"flatbed"\|"feeder","pageSize":"a4"\|"a5"\|"letter"\|"legal","dpi":150\|200\|300\|600,"showNativeUI":bool}` → `{"pages":[{"dataUrl":"data:image/png;base64,...","mime":"image/png"}]}` |

The editor adds the returned pages to the document and can recognize their text immediately, so a scan
becomes a searchable PDF in one step.

## Running it

```bash
cd scan-bridge
dotnet run
# PDF Studio → Scan → Find scanners → Start scan
```

## Why the OCR is in the app, not here

NAPS2 can also OCR while exporting a PDF, and the editor's scan dialog does recognize text right after
receiving the pages. Doing it in the app keeps the bridge small and means the same recognition runs for
scans, photos and existing files. If you prefer the scanner-side OCR — for example on a machine without the
language files cached in the browser — set `nederlandse_output.pdf` style handling in the bridge with
`PdfExporter`/`OcrParameters` (`Languages = new[] { "nld" }`) and return the finished PDF from an extra
`/scan-pdf` endpoint; the editor can then import that file as a normal PDF.

## About raw byte rewriting (for maintainers)

Replacing text by editing a PDF's compressed page content directly (the `PdfReader.GetPageContent` +
string replace approach, or iTextSharp/PDFsharp equivalents) does not generalise: page streams are usually
Flate-compressed, text is split across many operators and kerning pairs, and font subsetting means the
bytes on the page are not the text at all. PDF Studio therefore replaces text by locating the real text
runs (pdf.js), covering the match with the page's own colour and retyping it (pdf-lib), and fills fixed
templates through their form fields. Both are reliable and verifiable; byte surgery is not.
