import type { StoredDocMeta } from "../types"
import { formatFileSize, formatTimestamp } from "../pdf/pages"
import { useT } from "../i18n"

export function StoredDocSummary({ meta }: { meta: StoredDocMeta }) {
  const t = useT()
  return (
    <>
      {meta.pages === 1 ? t("{count} page", { count: meta.pages }) : t("{count} pages", { count: meta.pages })}{" "}
      · {formatFileSize(meta.size)} · {formatTimestamp(meta.updatedAt)}
      {meta.encrypted ? ` · ${t("encrypted")}` : ""}
    </>
  )
}
