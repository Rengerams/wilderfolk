import { useState } from "react"
import { Check, CircleAlert, Loader2, ShieldCheck } from "lucide-react"
import { Dialog, Field } from "./Dialog"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"
import { LANGUAGES, normalizeLanguage, type LanguageCode } from "../../i18n/languages"
import { OCR_LANGUAGES } from "../../pdf/ocr"
import {
  SETUP_CHECKS,
  runSetupCheck,
  type SetupCheckId,
} from "../../setup/dependencies"
import { LICENSE_TEXT, LICENSE_VERSION } from "../../setup/license"
import { currentSettings, updateSettings } from "../../storage/settings"

type CheckState = { status: "pending" | "running" | "ready" | "failed"; detail: string }

const STEP_LABELS = ["Welcome", "License", "Language", "Dependencies", "Finish"]

function emptyChecks(): Record<SetupCheckId, CheckState> {
  return Object.fromEntries(
    SETUP_CHECKS.map((check) => [check.id, { status: "pending", detail: "" }]),
  ) as Record<SetupCheckId, CheckState>
}

function StatusIcon({ status }: { status: CheckState["status"] }) {
  if (status === "ready") return <Check size={15} className="setup-icon setup-icon-ready" />
  if (status === "failed") return <CircleAlert size={15} className="setup-icon setup-icon-failed" />
  if (status === "running") return <Loader2 size={15} className="setup-icon setup-icon-running" />
  return <span className="setup-dot" aria-hidden="true" />
}

export function SetupDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setLanguage = useEditor((state) => state.setLanguage)
  const setStatus = useEditor((state) => state.setStatus)
  const settings = currentSettings()
  const [step, setStep] = useState(0)
  const [accepted, setAccepted] = useState(settings.setup !== null)
  const [language, setInterfaceLanguage] = useState<LanguageCode>(settings.language)
  const [ocrLanguages, setOcrLanguages] = useState<string[]>(settings.defaultOcrLanguages)
  const [checks, setChecks] = useState(emptyChecks)
  const [progress, setProgress] = useState(0)
  const [installing, setInstalling] = useState(false)

  const readyCount = SETUP_CHECKS.filter((check) => checks[check.id].status === "ready").length
  const failed = SETUP_CHECKS.filter((check) => checks[check.id].status === "failed")
  const blocked = SETUP_CHECKS.filter((check) => check.required && checks[check.id].status !== "ready")
  const installFinished = !installing && progress >= 100

  const install = async () => {
    if (installing) return
    setInstalling(true)
    setChecks(emptyChecks())
    setProgress(0)
    let done = 0
    for (const check of SETUP_CHECKS) {
      setChecks((previous) => ({ ...previous, [check.id]: { status: "running", detail: "" } }))
      const outcome = await runSetupCheck(check.id, {
        languages: ocrLanguages,
        onProgress: (value) =>
          setProgress(((done + Math.min(1, Math.max(0, value))) / SETUP_CHECKS.length) * 100),
      })
      done += 1
      setChecks((previous) => ({ ...previous, [check.id]: outcome }))
      setProgress((done / SETUP_CHECKS.length) * 100)
    }
    setInstalling(false)
  }

  const chooseLanguage = (code: LanguageCode) => {
    setInterfaceLanguage(code)
    // The interface follows the choice straight away, so the rest of setup is readable.
    setLanguage(code)
  }

  const finish = () => {
    const now = new Date().toISOString()
    updateSettings({
      defaultOcrLanguages: ocrLanguages,
      setup: {
        completedAt: now,
        licenseVersion: LICENSE_VERSION,
        licenseAcceptedAt: now,
        interfaceLanguage: language,
        ocrLanguages,
      },
    })
    setStatus(t("Setup complete"))
    closeDialog()
  }

  const footer = () => {
    if (step === 0) {
      return (
        <>
          <span className="grow hint">{t("Takes about a minute. You can run it again from Help.")}</span>
          <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>
            {t("Continue")}
          </button>
        </>
      )
    }
    if (step === 1) {
      return (
        <>
          <span className="grow hint">
            {settings.setup
              ? t("You accepted these terms on {date}.", {
                  date: new Date(settings.setup.licenseAcceptedAt).toLocaleDateString(),
                })
              : t("Setup continues only after you accept the license terms.")}
          </span>
          <button type="button" className="btn btn-quiet" onClick={() => setStep(0)}>
            {t("Back")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!accepted}
            onClick={() => setStep(2)}
          >
            {t("Accept and continue")}
          </button>
        </>
      )
    }
    if (step === 2) {
      return (
        <>
          <span className="grow hint">{t("Both choices are saved when setup finishes.")}</span>
          <button type="button" className="btn btn-quiet" onClick={() => setStep(1)}>
            {t("Back")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStep(3)
              void install()
            }}
          >
            {t("Install dependencies")}
          </button>
        </>
      )
    }
    if (step === 3) {
      return (
        <>
          <span className="grow hint">
            {installing
              ? t("{done} of {total} components ready", {
                  done: readyCount,
                  total: SETUP_CHECKS.length,
                })
              : blocked.length > 0
                ? t("Resolve the required components before continuing.")
                : t("{done} of {total} components ready", {
                    done: readyCount,
                    total: SETUP_CHECKS.length,
                  })}
          </span>
          <button type="button" className="btn btn-quiet" onClick={() => setStep(2)} disabled={installing}>
            {t("Back")}
          </button>
          {failed.length > 0 && !installing ? (
            <button type="button" className="btn" onClick={() => void install()}>
              {t("Retry failed steps")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={installing || !installFinished || blocked.length > 0}
            onClick={() => setStep(4)}
          >
            {t("Continue")}
          </button>
        </>
      )
    }
    return (
      <>
        <span className="grow hint">{t("Everything can be changed later in the settings.")}</span>
        <button type="button" className="btn btn-quiet" onClick={() => setStep(3)}>
          {t("Back")}
        </button>
        <button type="button" className="btn btn-primary" onClick={finish}>
          {t("Finish setup")}
        </button>
      </>
    )
  }

  return (
    <Dialog title={t("Set up PDF Studio")} onClose={closeDialog} wide footer={footer()}>
      <ol className="setup-steps">
        {STEP_LABELS.map((label, index) => (
          <li
            key={label}
            className={
              index === step
                ? "setup-step setup-step-current"
                : index < step
                  ? "setup-step setup-step-done"
                  : "setup-step"
            }
          >
            <span className="setup-step-number">{index < step ? <Check size={12} /> : index + 1}</span>
            {t(label)}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <>
          <div className="setup-hero">
            <ShieldCheck size={26} />
            <div>
              <h3>{t("Welcome to PDF Studio")}</h3>
              <p className="hint">
                {t(
                  "This first-run setup accepts the license, asks which language you want to use and installs everything the editor needs to open, edit and scan documents.",
                )}
              </p>
            </div>
          </div>
          <ul className="setup-summary">
            <li>{t("License terms you accept once for this installation.")}</li>
            <li>{t("Interface language, plus the languages used for text recognition.")}</li>
            <li>{t("Rendering, writing, drawing and storage components, verified one by one.")}</li>
          </ul>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h3>{t("License agreement")}</h3>
          <p className="hint">
            {t(
              "PDF Studio is published under the Wilderfolk Permission-Required License. Read it below before you continue.",
            )}
          </p>
          <div className="setup-license" tabIndex={0} aria-label={t("License text")}>
            {LICENSE_TEXT}
          </div>
          <label className="checkbox setup-accept">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            {t("I have read the license terms and accept them for this installation.")}
          </label>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h3>{t("Language")}</h3>
          <Field
            label={t("Interface language")}
            hint={t("Applies to the whole editor as soon as you pick it.")}
          >
            <select
              value={language}
              onChange={(event) => chooseLanguage(normalizeLanguage(event.target.value))}
            >
              {LANGUAGES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <h3>{t("Text recognition languages")}</h3>
          <p className="hint">
            {t(
              "Pick the languages of the documents you scan. Each one is downloaded once during the next step and then kept on this PC.",
            )}
          </p>
          <div className="checkbox-grid">
            {OCR_LANGUAGES.map((entry) => (
              <label key={entry.code} className="checkbox">
                <input
                  type="checkbox"
                  checked={ocrLanguages.includes(entry.code)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...ocrLanguages, entry.code]
                      : ocrLanguages.filter((code) => code !== entry.code)
                    setOcrLanguages(next.length > 0 ? next : [entry.code])
                  }}
                />
                {t(entry.label)}
              </label>
            ))}
          </div>
          <p className="hint">
            {t("Selected: {count}. ", { count: ocrLanguages.length })}
            {t("Text recognition stays optional — the editor opens and edits PDFs without it.")}
          </p>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h3>{t("Installing components")}</h3>
          <div className="progress setup-progress">
            <span style={{ width: `${Math.round(progress)}%` }} />
          </div>
          <div className="list setup-checks">
            {SETUP_CHECKS.map((check) => {
              const state = checks[check.id]
              return (
                <div key={check.id} className="list-row setup-check">
                  <StatusIcon status={state.status} />
                  <div className="grow">
                    <strong>
                      {t(check.label)}
                      {!check.required ? <span className="setup-optional">{t("optional")}</span> : null}
                    </strong>
                    <small>{state.detail || t(check.hint)}</small>
                  </div>
                  <span className={`setup-status setup-status-${state.status}`}>
                    {state.status === "pending"
                      ? t("Waiting")
                      : state.status === "running"
                        ? t("Working…")
                        : state.status === "ready"
                          ? t("Ready")
                          : t("Failed")}
                  </span>
                </div>
              )
            })}
          </div>
          {installFinished && blocked.length > 0 ? (
            <p className="error-text">
              {t("These components are required: {items}.", {
                items: blocked.map((check) => t(check.label)).join(", "),
              })}
            </p>
          ) : null}
        </>
      ) : null}

      {step === 4 ? (
        <>
          <h3>{t("Ready to use")}</h3>
          <div className="list setup-checks">
            <div className="list-row">
              <Check size={15} className="setup-icon setup-icon-ready" />
              <div className="grow">
                <strong>{t("License accepted")}</strong>
                <small>{t("Wilderfolk Permission-Required License, version {version}.", { version: LICENSE_VERSION })}</small>
              </div>
            </div>
            <div className="list-row">
              <Check size={15} className="setup-icon setup-icon-ready" />
              <div className="grow">
                <strong>{t("Interface language")}</strong>
                <small>{LANGUAGES.find((entry) => entry.code === language)?.label ?? language}</small>
              </div>
            </div>
            <div className="list-row">
              <Check size={15} className="setup-icon setup-icon-ready" />
              <div className="grow">
                <strong>{t("Text recognition languages")}</strong>
                <small>
                  {ocrLanguages
                    .map((code) => t(OCR_LANGUAGES.find((entry) => entry.code === code)?.label ?? code))
                    .join(", ")}
                </small>
              </div>
            </div>
            <div className="list-row">
              <Check size={15} className="setup-icon setup-icon-ready" />
              <div className="grow">
                <strong>{t("Components")}</strong>
                <small>
                  {t("{done} of {total} ready", { done: readyCount, total: SETUP_CHECKS.length })}
                </small>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Dialog>
  )
}
