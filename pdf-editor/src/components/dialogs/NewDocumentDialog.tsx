import { useState } from "react"
import { Field, Dialog } from "./Dialog"
import { PAGE_PRESETS, presetById } from "../../pdf/pages"
import { useEditor } from "../../app/store"

export function NewDocumentDialog() {
  const closeDialog = useEditor((state) => state.closeDialog)
  const newDocument = useEditor((state) => state.newDocument)
  const [name, setName] = useState("Untitled")
  const [preset, setPreset] = useState<string>(PAGE_PRESETS[0].id)
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait")
  const [count, setCount] = useState(1)

  return (
    <Dialog
      title="New document"
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">The document is created in the editor; save it to the library or as a file.</span>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              newDocument({
                name: name.trim() || "Untitled",
                size: presetById(preset),
                orientation,
                count,
              })
              closeDialog()
            }}
          >
            Create document
          </button>
        </>
      }
    >
      <Field label="File name">
        <input
          type="text"
          aria-label="File name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </Field>
      <div className="grid-2">
        <Field label="Page size">
          <select
            aria-label="Page size"
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
          >
            {PAGE_PRESETS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Orientation">
          <select
            aria-label="Orientation"
            value={orientation}
            onChange={(event) => setOrientation(event.target.value as "portrait" | "landscape")}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </Field>
      </div>
      <Field label="Pages" hint="Between 1 and 200 blank pages.">
        <input
          type="number"
          aria-label="Pages"
          min={1}
          max={200}
          value={count}
          onChange={(event) => setCount(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
        />
      </Field>
    </Dialog>
  )
}
