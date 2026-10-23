import { useState } from "react"
import { Dialog, Field } from "./Dialog"
import type { DocMetadata } from "../../types"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

function toInputValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function fromInputValue(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export function MetadataDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setMetadata = useEditor((state) => state.setMetadata)
  const metadata = useEditor((state) => state.doc.metadata)
  const [draft, setDraft] = useState<DocMetadata>(metadata)

  const update = (patch: Partial<DocMetadata>) => setDraft((current) => ({ ...current, ...patch }))

  return (
    <Dialog
      title={t("Document details")}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {t("These values are written into the PDF file, and everyone who opens it sees them.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setMetadata(draft)
              closeDialog()
            }}
          >
            {t("Save details")}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label={t("Title")}>
          <input
            type="text"
            aria-label={t("Title")}
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder={t("Document title")}
          />
        </Field>
        <Field label={t("Author (created by)")}>
          <input
            type="text"
            aria-label={t("Author (created by)")}
            value={draft.author}
            onChange={(event) => update({ author: event.target.value })}
            placeholder={t("Your name or organisation")}
          />
        </Field>
      </div>
      <Field label={t("Subject")}>
        <input
          type="text"
          aria-label={t("Subject")}
          value={draft.subject}
          onChange={(event) => update({ subject: event.target.value })}
          placeholder={t("What the document is about")}
        />
      </Field>
      <Field label={t("Keywords")} hint={t("Separate several keywords with commas.")}>
        <input
          type="text"
          aria-label={t("Keywords")}
          value={draft.keywords}
          onChange={(event) => update({ keywords: event.target.value })}
          placeholder={t("invoice, 2026, scan")}
        />
      </Field>
      <div className="grid-2">
        <Field label={t("Created with (creator)")}>
          <input
            type="text"
            aria-label={t("Creator")}
            value={draft.creator}
            onChange={(event) => update({ creator: event.target.value })}
          />
        </Field>
        <Field label={t("Produced by (producer)")}>
          <input
            type="text"
            aria-label={t("Producer")}
            value={draft.producer}
            onChange={(event) => update({ producer: event.target.value })}
          />
        </Field>
        <Field label={t("Creation date")}>
          <input
            type="datetime-local"
            value={toInputValue(draft.creationDate)}
            onChange={(event) => update({ creationDate: fromInputValue(event.target.value) })}
          />
        </Field>
        <Field label={t("Modification date")}>
          <input
            type="datetime-local"
            value={toInputValue(draft.modificationDate)}
            onChange={(event) => update({ modificationDate: fromInputValue(event.target.value) })}
          />
        </Field>
      </div>
      <div className="note">
        <strong>{t("Tip:")}</strong>{" "}
        {t(
          "clearing a field and saving removes that value from the file, so you can also strip details you do not want to share.",
        )}
      </div>
    </Dialog>
  )
}
