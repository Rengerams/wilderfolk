import { useState } from "react"
import { Dialog, Field } from "./Dialog"
import { DEFAULT_BRIDGE_URL } from "../../scan/bridge"
import { OCR_LANGUAGES } from "../../pdf/ocr"
import { testStorageProvider } from "../../app/documentActions"
import {
  applyLanguage,
  applyTheme,
  currentSettings,
  getPassphrase,
  isCloudConfigured,
  setPassphrase,
  updateSettings,
} from "../../storage/settings"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"
import { LANGUAGES, normalizeLanguage } from "../../i18n/languages"

export function SettingsDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setTheme = useEditor((state) => state.setTheme)
  const setLanguage = useEditor((state) => state.setLanguage)
  const setStatus = useEditor((state) => state.setStatus)
  const [settings, setSettings] = useState(currentSettings())
  const [passphrase, setPassphraseValue] = useState(getPassphrase())
  const [probe, setProbe] = useState("")
  const [error, setError] = useState("")

  const patch = (values: Parameters<typeof updateSettings>[0]) => {
    setSettings(updateSettings(values))
  }

  const test = async () => {
    setProbe(t("Testing…"))
    setError("")
    try {
      setProbe(await testStorageProvider())
    } catch (caught) {
      setProbe("")
      setError(caught instanceof Error ? caught.message : t("The storage could not be reached."))
    }
  }

  return (
    <Dialog
      title={t("Storage & security")}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {isCloudConfigured(settings)
              ? t("Cloud storage is on: documents are uploaded to the endpoint you entered.")
              : t("Local-first: nothing leaves this PC.")}
          </span>
          <button type="button" className="btn btn-primary" onClick={closeDialog}>
            {t("Done")}
          </button>
        </>
      }
    >
      <h3>{t("Where documents are stored")}</h3>
      <label className="checkbox">
        <input
          type="radio"
          name="provider"
          checked={settings.provider === "local"}
          onChange={() => patch({ provider: "local" })}
        />
        {t("Local library on this PC (recommended, works offline)")}
      </label>
      <label className="checkbox">
        <input
          type="radio"
          name="provider"
          checked={settings.provider === "cloud"}
          onChange={() => patch({ provider: "cloud" })}
        />
        {t("My own cloud storage endpoint")}
      </label>

      {settings.provider === "cloud" ? (
        <>
          <div className="grid-2">
            <Field
              label={t("Cloud endpoint")}
              hint={t("A server that stores documents for you (HTTPS strongly recommended).")}
            >
              <input
                type="url"
                value={settings.cloudEndpoint}
                placeholder="https://documents.example.com"
                onChange={(event) => patch({ cloudEndpoint: event.target.value })}
              />
            </Field>
            <Field
              label={t("Access token")}
              hint={t("Sent as a bearer ****** Kept for this session only.")}
            >
              <input
                type="password"
                value={settings.cloudToken}
                onChange={(event) => patch({ cloudToken: event.target.value })}
              />
            </Field>
          </div>
          <div className="note">
            <strong>{t("How syncing behaves:")}</strong>{" "}
            {t(
              "the endpoint answers 409 when it already holds a newer revision, and the editor then asks you to open that copy instead of overwriting it. A document that cannot be uploaded stays open locally, so no work is lost while offline. Encryption in transit depends on your endpoint using HTTPS; for extra protection turn on library encryption below as well.",
            )}
          </div>
          <button type="button" className="btn" onClick={() => void test()}>
            {t("Test connection")}
          </button>
          {probe ? <p className="success-text">{probe}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </>
      ) : null}

      <h3>{t("Encryption at rest")}</h3>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.encryptLibrary}
          onChange={(event) => patch({ encryptLibrary: event.target.checked })}
        />
        {t("Encrypt documents with AES-256 before they are stored")}
      </label>
      <Field
        label={t("Library passphrase")}
        hint={t("Kept in memory for this session only — it is never written to disk, so store it safely yourself.")}
      >
        <input
          type="password"
          value={passphrase}
          onChange={(event) => {
            setPassphraseValue(event.target.value)
            setPassphrase(event.target.value)
          }}
          placeholder={settings.encryptLibrary ? t("Choose a passphrase") : t("Not in use")}
        />
      </Field>

      <h3>{t("Text recognition languages")}</h3>
      <p className="hint">
        {t(
          "Used by the scan and OCR dialogs by default. Language data for these languages is installed together with PDF Studio, so recognition works without a network connection.",
        )}
      </p>
      <div className="checkbox-grid">
        {OCR_LANGUAGES.map((language) => (
          <label key={language.code} className="checkbox">
            <input
              type="checkbox"
              checked={settings.defaultOcrLanguages.includes(language.code)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...settings.defaultOcrLanguages, language.code]
                  : settings.defaultOcrLanguages.filter((code) => code !== language.code)
                patch({ defaultOcrLanguages: next.length > 0 ? next : [language.code] })
              }}
            />
            {t(language.label)} ({language.code})
          </label>
        ))}
      </div>

      <h3>{t("Appearance")}</h3>
      <div className="grid-2">
        <Field label={t("Language")} hint={t("Applies to the whole interface straight away.")}>
          <select
            value={settings.language}
            onChange={(event) => {
              const language = normalizeLanguage(event.target.value)
              patch({ language })
              applyLanguage(language)
              setLanguage(language)
            }}
          >
            {LANGUAGES.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Theme")}>
          <select
            value={settings.theme}
            onChange={(event) => {
              const theme = event.target.value === "dark" ? "dark" : "light"
              patch({ theme })
              applyTheme(theme)
              setTheme(theme)
            }}
          >
            <option value="light">{t("Light")}</option>
            <option value="dark">{t("Dark")}</option>
          </select>
        </Field>
      </div>
      <p className="hint">
        {t("Scanner bridge address used by the Scan dialog:")} <code>{DEFAULT_BRIDGE_URL}</code>{" "}
        {t("(changeable there).")}
      </p>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          setStatus(t("Settings saved"))
          closeDialog()
        }}
      >
        {t("Save settings")}
      </button>
    </Dialog>
  )
}
