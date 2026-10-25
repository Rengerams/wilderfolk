import { useState } from "react"
import { usePasswordPrompt } from "../../app/passwordPrompt"
import { useT } from "../../i18n"
import { Dialog, Field } from "./Dialog"

export function PasswordDialog({ incorrect }: { incorrect: boolean }) {
  const t = useT()
  const answer = usePasswordPrompt((state) => state.answer)
  const [password, setPassword] = useState("")

  const submit = () => {
    if (password.length === 0) return
    answer(password)
  }

  return (
    <Dialog
      title={t("Password required")}
      onClose={() => answer(null)}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn" onClick={() => answer(null)}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={password.length === 0}
          >
            {t("Unlock")}
          </button>
        </>
      }
    >
      <p className="hint">{t("This PDF is locked. Enter its password to open it.")}</p>
      <Field label={t("Password")}>
        <input
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          aria-label={t("Password")}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
        />
      </Field>
      {incorrect ? <p className="hint">{t("That password is not correct. Try again.")}</p> : null}
    </Dialog>
  )
}
