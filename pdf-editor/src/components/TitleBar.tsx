import { LogOut, Moon, Sun } from "lucide-react"
import { useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"
import { useT } from "../i18n"

export function TitleBar() {
  const t = useT()
  const commands = useCommands()
  const name = useEditor((state) => state.doc.name)
  const dirty = useEditor((state) => state.doc.dirty)
  const savedAt = useEditor((state) => state.doc.savedAt)
  const theme = useEditor((state) => state.theme)

  const themeLabel = theme === "dark" ? t("Switch to light theme") : t("Switch to dark theme")

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          P
        </span>
        <span>PDF Studio</span>
      </div>
      <div className="doc-title" title={name}>
        {dirty ? <span className="dirty-dot" aria-hidden="true" /> : <span className="saved-dot" aria-hidden="true" />}
        <span>{name}</span>
      </div>
      <div className="titlebar-spacer" />
      {savedAt ? (
        <span className="chip" title={t("Saved {time}", { time: new Date(savedAt).toLocaleString() })}>
          {t("Saved")}
        </span>
      ) : null}
      <button
        type="button"
        className="icon-btn"
        onClick={commands.toggleTheme}
        aria-label={t("Switch theme")}
        title={themeLabel}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button type="button" className="btn btn-quiet" onClick={commands.exit} title={t("Close PDF Studio")}>
        <LogOut size={15} />
        {t("Exit")}
      </button>
    </header>
  )
}
