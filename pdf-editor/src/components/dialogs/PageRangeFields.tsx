import type { Dispatch, SetStateAction } from "react"
import { Field } from "./Dialog"
import { useT } from "../../i18n"

export function PageRangeFields({
  from,
  to,
  pageCount,
  setFrom,
  setTo,
  autoFocusFrom = false,
}: {
  from: number
  to: number
  pageCount: number
  setFrom: Dispatch<SetStateAction<number>>
  setTo: Dispatch<SetStateAction<number>>
  autoFocusFrom?: boolean
}) {
  const t = useT()
  return (
    <div className="grid-2">
      <Field label={t("From page")}>
        <input
          type="number"
          min={1}
          max={pageCount}
          aria-label={t("From page")}
          value={from}
          onChange={(event) => setFrom(Math.max(1, Number(event.target.value) || 1))}
          autoFocus={autoFocusFrom}
        />
      </Field>
      <Field label={t("To page")}>
        <input
          type="number"
          min={1}
          max={pageCount}
          aria-label={t("To page")}
          value={to}
          onChange={(event) => setTo(Math.max(1, Number(event.target.value) || 1))}
        />
      </Field>
    </div>
  )
}
