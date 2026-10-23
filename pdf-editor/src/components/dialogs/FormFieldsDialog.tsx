import { useEffect, useState } from "react"
import { Dialog } from "./Dialog"
import { fillDocumentForm, readDocumentFormFields, type FormFieldInfo, type FormValues } from "../../app/formActions"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

const TYPE_LABELS: Record<FormFieldInfo["type"], string> = {
  text: "Text field",
  checkbox: "Check box",
  dropdown: "Drop-down",
  radio: "Option buttons",
  optionList: "List box",
  unsupported: "Not supported",
}

export function FormFieldsDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const documentName = useEditor((state) => state.doc.source?.name ?? null)
  const [fields, setFields] = useState<FormFieldInfo[]>([])
  const [values, setValues] = useState<FormValues>({})
  const [flatten, setFlatten] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const found = await readDocumentFormFields()
        if (cancelled) return
        setFields(found)
        setValues(
          Object.fromEntries(
            found
              .filter((field) => field.type !== "unsupported")
              .map((field) => [field.name, field.type === "checkbox" ? field.value === "true" : field.value]),
          ),
        )
        if (found.length === 0) {
          setError(t("This PDF has no fillable form fields. Use Find and replace text instead."))
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : t("The form fields could not be read."))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const usable = fields.filter((field) => field.type !== "unsupported")

  const apply = async () => {
    setBusy(true)
    setError("")
    try {
      await fillDocumentForm(values, flatten)
      closeDialog()
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : t("The form could not be filled.")
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={t("Fill form fields")}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {documentName
              ? t("Fields from {name}.", { name: documentName })
              : t("Open a PDF with a form first.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || usable.length === 0}
            onClick={() => void apply()}
          >
            {busy ? t("Applying…") : t("Fill the form")}
          </button>
        </>
      }
    >
      <div className="note">
        <strong>{t("Why this is the reliable way:")}</strong>{" "}
        {t(
          "a fixed template (invoice, contract, certificate) carries its layout in form fields. Writing into those fields keeps every line, font and position exactly as the designer made it — no reflow, no damaged page content.",
        )}
      </div>

      {loading ? <p className="hint">{t("Reading the form fields…")}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {usable.length > 0 ? (
        <div className="list">
          {usable.map((field) => (
            <div key={field.name} className="list-row">
              <span className="grow">
                <strong>{field.name}</strong>
                <small className="hint">{t(TYPE_LABELS[field.type])}</small>
              </span>
              {field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  aria-label={field.name}
                  checked={values[field.name] === true}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.checked }))
                  }
                />
              ) : field.type === "dropdown" || field.type === "radio" || field.type === "optionList" ? (
                <select
                  aria-label={field.name}
                  value={String(values[field.name] ?? "")}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                >
                  <option value="">—</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  aria-label={field.name}
                  value={String(values[field.name] ?? "")}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {fields.some((field) => field.type === "unsupported") ? (
        <p className="hint">
          {t(
            "Some fields in this file are of a kind the editor cannot write to (signature or button fields); they are left untouched.",
          )}
        </p>
      ) : null}

      <label className="checkbox">
        <input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} />
        {t("Make the values permanent (flatten the form)")}
      </label>
      <p className="hint">
        {flatten
          ? t(
              "Recommended: the filled text becomes part of the page, so it prints and reads back identically everywhere.",
            )
          : t(
              "The fields stay editable in the saved PDF; some readers may then show the old values until the form is refreshed.",
            )}
      </p>
    </Dialog>
  )
}
