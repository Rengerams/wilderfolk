import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

export function useDialogBase() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pageCount = useEditor((state) => state.doc.pages.length)
  return { t, closeDialog, setStatus, pageCount }
}
