import type { Dispatch, SetStateAction } from "react"
import { OCR_LANGUAGES } from "../../pdf/ocr"
import { useT } from "../../i18n"

export function LanguagePicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: Dispatch<SetStateAction<string[]>>
}) {
  const t = useT()
  return (
    <div className="checkbox-grid">
      {OCR_LANGUAGES.map((language) => (
        <label key={language.code} className="checkbox">
          <input
            type="checkbox"
            checked={value.includes(language.code)}
            onChange={(event) =>
              onChange((current) =>
                event.target.checked
                  ? [...current, language.code]
                  : current.length > 1
                    ? current.filter((code) => code !== language.code)
                    : current,
              )
            }
          />
          {t(language.label)}
        </label>
      ))}
    </div>
  )
}
