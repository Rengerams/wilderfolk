import { fillFormFields, readFormFields, type FormFieldInfo, type FormValues } from "../pdf/formFields"
import { closePdfSource, openPdfSource } from "../pdf/render"
import { sourcePage } from "../pdf/pages"
import { getCurrentSource, setCurrentSource } from "./sourceRegistry"
import { useEditor } from "./store"

export type { FormFieldInfo, FormValues }

export async function readDocumentFormFields(): Promise<FormFieldInfo[]> {
  const state = useEditor.getState()
  if (!state.doc.source) {
    throw new Error(
      "Form fields live inside PDF files. Open a PDF that contains a form, then fill it here.",
    )
  }
  return readFormFields(state.doc.source.bytes)
}

/** Writes the values into the file's own fields — exactly what a fixed template needs. */
export async function fillDocumentForm(values: FormValues, flatten: boolean): Promise<number> {
  const state = useEditor.getState()
  const current = state.doc.source
  if (!current) throw new Error("Open a PDF file that contains a form first.")

  const filled = await fillFormFields(current.bytes, values, flatten)
  const source = await openPdfSource(filled, current.name)
  const previous = getCurrentSource()
  setCurrentSource(source)
  if (previous) await closePdfSource(previous)

  // Page identities are kept so text, pictures and recognized text stay on their own page.
  const pages = source.pageMeta.map((meta, index) => {
    const before = state.doc.pages[index]
    const fresh = sourcePage({
      srcIndex: index,
      size: meta.size,
      authoredRotation: meta.authoredRotation,
    })
    return before ? { ...fresh, id: before.id, rotation: before.rotation } : fresh
  })

  const applied = Object.keys(values).length
  useEditor.getState().replaceDocument({
    ...state.doc,
    source: { name: current.name, bytes: filled },
    pages,
    dirty: true,
  })
  useEditor
    .getState()
    .setStatus(`Filled ${applied} form field${applied === 1 ? "" : "s"}${flatten ? " and flattened them" : ""}`)
  return applied
}
