import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from "@cantoo/pdf-lib"

/** Reading and filling PDF form fields (AcroForms), the reliable way to change fixed templates. */

export type FormFieldType = "text" | "checkbox" | "dropdown" | "radio" | "optionList" | "unsupported"

export type FormFieldInfo = {
  name: string
  type: FormFieldType
  value: string
  options: string[]
}

export type FormValues = Record<string, string | boolean>

function typeOf(field: unknown): FormFieldType {
  if (field instanceof PDFTextField) return "text"
  if (field instanceof PDFCheckBox) return "checkbox"
  if (field instanceof PDFDropdown) return "dropdown"
  if (field instanceof PDFRadioGroup) return "radio"
  if (field instanceof PDFOptionList) return "optionList"
  return "unsupported"
}

export async function readFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  const document = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  const form = document.getForm()
  try {
    return form.getFields().map((field) => {
      const type = typeOf(field)
      if (field instanceof PDFTextField) {
        return { name: field.getName(), type, value: field.getText() ?? "", options: [] }
      }
      if (field instanceof PDFCheckBox) {
        return { name: field.getName(), type, value: field.isChecked() ? "true" : "false", options: [] }
      }
      if (field instanceof PDFDropdown || field instanceof PDFRadioGroup || field instanceof PDFOptionList) {
        const options = field.getOptions() ?? []
        return {
          name: field.getName(),
          type,
          value: (field.getSelected() ?? [])[0] ?? "",
          options,
        }
      }
      return { name: field.getName(), type, value: "", options: [] }
    })
  } catch {
    return []
  }
}

/** Fills the fields and, when asked, flattens them so the values become part of the page. */
export async function fillFormFields(
  bytes: Uint8Array,
  values: FormValues,
  flatten: boolean,
): Promise<Uint8Array> {
  // Metadata stays exactly as the file had it; filling a form must not rewrite the user's details.
  const document = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  const form = document.getForm()
  for (const field of form.getFields()) {
    const value = values[field.getName()]
    if (value === undefined) continue
    try {
      if (field instanceof PDFTextField && typeof value === "string") {
        field.setText(value)
        continue
      }
      if (field instanceof PDFCheckBox && typeof value === "boolean") {
        if (value) field.check()
        else field.uncheck()
        continue
      }
      if (
        (field instanceof PDFDropdown || field instanceof PDFRadioGroup || field instanceof PDFOptionList) &&
        typeof value === "string" &&
        value.length > 0
      ) {
        field.select(value)
      }
    } catch {
      // A field that refuses a value is left at its old value rather than failing the whole fill.
    }
  }
  if (flatten) {
    try {
      form.flatten()
    } catch {
      // Flattening needs appearance streams; when a file lacks them the values stay editable.
    }
  }
  return document.save({ useObjectStreams: false })
}
