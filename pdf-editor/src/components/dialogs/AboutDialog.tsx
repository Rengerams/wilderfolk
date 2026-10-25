import { Dialog } from "./Dialog"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

export const APP_VERSION = "0.2.0"

const SHORTCUTS: [string, string][] = [
  ["Ctrl + N", "New document"],
  ["Ctrl + O", "Open a PDF, PNG or JPEG file"],
  ["Ctrl + S", "Save to the library"],
  ["Ctrl + E", "Export as another format"],
  ["Ctrl + P", "Print the document"],
  ["Ctrl + Shift + S", "Scan pages"],
  ["Ctrl + Z / Ctrl + Y", "Undo / redo"],
  ["Ctrl + 0", "Fit page in the window"],
  ["Ctrl + Plus / Ctrl + Minus", "Zoom in / out"],
  ["Ctrl + Shift + N", "Insert a blank page"],
  ["Page Up / Page Down", "Previous / next page"],
  ["Delete", "Remove the selected object"],
  ["Esc", "Cancel the current tool or close a dialog"],
]

const SECURITY_NOTES = [
  "Files you open are treated as untrusted: they are parsed, never executed, and scripts inside a PDF are disabled.",
  "Rendering and text recognition run in worker processes, so a damaged file cannot freeze the editor window.",
  "Documents stay on this PC by default — in the local library, with optional AES-256 encryption and a passphrase you choose.",
  "Cloud storage is opt-in and off until you enter your own endpoint; nothing is uploaded otherwise.",
  "The only network requests are to the OCR engine's language files and, when you enable them, your own cloud endpoint. No telemetry is sent.",
]

const HIGHLIGHTS = [
  "Create new documents (A4, A5, A3, Letter, Legal, Tabloid, square) and open existing PDFs.",
  "Reorder, rotate, duplicate, insert and delete pages; save the file or save a separate copy.",
  "Add and change text, highlights, rectangles, freehand drawings and pictures on any page.",
  "Copy a picture out of a PDF — drag around it and it becomes an editable image object.",
  "Scan from a scanner, a phone camera or scanned files, and recognize text with OCR.",
  "Edit all document details, including author, creator, subject, keywords and both dates.",
  "Export to PDF, PNG, JPEG or plain text; more formats can be added as adapter modules.",
]

export function AboutDialog(props: { section?: "about" | "shortcuts" | "security" }) {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const section = props.section ?? "about"

  return (
    <Dialog
      title={section === "shortcuts" ? t("Keyboard shortcuts") : t("About PDF Studio")}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">
            {t(
              "PDF Studio {version} · part of the wilderfolk repository, kept separate from the game app",
              { version: APP_VERSION },
            )}
          </span>
          <button type="button" className="btn btn-primary" onClick={closeDialog}>
            {t("Close")}
          </button>
        </>
      }
    >
      <div className="note">
        <strong>PDF Studio {APP_VERSION}</strong>{" "}
        {t(
          "— a desktop PDF editor: create and edit pages, add text, pictures, highlights and drawings, change every document detail, copy pictures out of a page, scan paper documents and turn them into searchable PDFs.",
        )}
      </div>

      <h3>{t("What it can do")}</h3>
      <ul>
        {HIGHLIGHTS.map((item) => (
          <li key={item}>{t(item)}</li>
        ))}
      </ul>

      <h3>{t("Keyboard shortcuts")}</h3>
      <dl className="kv">
        {SHORTCUTS.map(([keys, description]) => (
          <div key={keys} style={{ display: "contents" }}>
            <dt>{keys}</dt>
            <dd>{t(description)}</dd>
          </div>
        ))}
      </dl>

      <h3>{t("Security notes")}</h3>
      <ul>
        {SECURITY_NOTES.map((note) => (
          <li key={note}>{t(note)}</li>
        ))}
      </ul>

      <h3>{t("Built with")}</h3>
      <p className="hint">
        {t(
          "pdf.js for rendering, pdf-lib for writing PDFs, tesseract.js for text recognition, React and Vite for the interface, and a small scan bridge (NAPS2) for real scanner hardware on Windows. All open source, all running locally.",
        )}
      </p>
      <p className="hint">
        {t(
          "Closing the app never loses work silently: when there are unsaved changes you are asked to save, discard or cancel first.",
        )}
      </p>

      <h3>{t("License")}</h3>
      <p className="hint">
        {t("Released as open source under the MIT License.")}{" "}
        <strong>{t("Copyright (c) 2026 Renffr")}</strong>
        {" — "}
        <a href="mailto:info@autosolid.nl">info@autosolid.nl</a>
      </p>
      <p className="hint">
        {t(
          "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.",
        )}
      </p>
      <p className="hint">
        {t(
          "THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.",
        )}
      </p>
    </Dialog>
  )
}
