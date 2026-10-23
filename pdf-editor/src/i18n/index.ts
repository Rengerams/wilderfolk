import { useMemo } from "react"
import { useEditor } from "../app/store"
import { translate, type MessageValues } from "./translate"

/** Component-side translation; re-renders whenever the interface language changes. */
export function useT(): (message: string, values?: MessageValues) => string {
  const language = useEditor((state) => state.language)
  return useMemo(() => (message, values) => translate(language, message, values), [language])
}
