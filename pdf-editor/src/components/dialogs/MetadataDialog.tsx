import { useState } from "react"
import { Trash2 } from "lucide-react"
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
  const setCustomTags = useEditor((state) => state.setCustomTags)
  const metadata = useEditor((state) => state.doc.metadata)
  const customTags = useEditor((state) => state.doc.customTags)
  const xmp = useEditor((state) => state.doc.xmp)
  const [draft, setDraft] = useState<DocMetadata>(metadata)
  const [draftTags, setDraftTags] = useState<Record<string, string>>({ ...customTags })
  const [newTag, setNewTag] = useState("")

  const update = (patch: Partial<DocMetadata>) => setDraft((current) => ({ ...current, ...patch }))
  const updateTag = (key: string, value: string) =>
    setDraftTags((current) => ({ ...current, [key]: value }))
  const removeTag = (key: string) =>
    setDraftTags((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  const addTag = () => {
    const key = newTag.trim()
    if (key.length === 0 || key in draftTags) return
    setDraftTags((current) => ({ ...current, [key]: "" }))
    setNewTag("")
  }
  const tagKeys = Object.keys(draftTags)

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
              setCustomTags(draftTags)
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
      <Field label={t("Custom tags")} hint={t("Extra tags read from the file, beyond the standard details.")}>
        <div className="list">
          {tagKeys.map((key) => (
            <div key={key} className="list-row">
              <span className="grow">
                <strong>{key}</strong>
                <input
                  type="text"
                  aria-label={t("Value of tag {name}", { name: key })}
                  value={draftTags[key]}
                  onChange={(event) => updateTag(key, event.target.value)}
                  placeholder={t("Value")}
                />
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("Remove tag {name}", { name: key })}
                onClick={() => removeTag(key)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="list-row">
            <span className="grow">
              <input
                type="text"
                aria-label={t("Tag name")}
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                placeholder={t("Tag name")}
              />
            </span>
            <button
              type="button"
              className="btn"
              disabled={newTag.trim().length === 0}
              onClick={addTag}
            >
              {t("Add tag")}
            </button>
          </div>
        </div>
      </Field>
      <div className="note">
        <strong>{t("Tip:")}</strong>{" "}
        {t(
          "clearing a field and saving removes that value from the file, so you can also strip details you do not want to share.",
        )}
      </div>
      {xmp ? (
        <details>
          <summary>{t("XMP metadata (read-only)")}</summary>
          <pre className="hint">{xmp}</pre>
        </details>
      ) : null}
    </Dialog>
  )
}
