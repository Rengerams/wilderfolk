import { useEffect, useRef, useState } from "react"
import { LogOut, Moon, Sun } from "lucide-react"
import { IMPORT_ACCEPT, pickFiles } from "../app/files"
import { selectActivePage, useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"
import { useT } from "../i18n"

type MenuEntry =
  | { label: string; shortcut?: string; onSelect: () => void; disabled?: boolean }
  | "separator"

function Menu(props: { label: string; entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [open])

  return (
    <div className="menu" ref={containerRef}>
      <button
        type="button"
        className="menu-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {props.label}
      </button>
      {open ? (
        <div className="menu-panel" role="menu">
          {props.entries.map((entry, index) =>
            entry === "separator" ? (
              <div key={`sep-${index}`} className="menu-separator" />
            ) : (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={entry.disabled}
                onClick={() => {
                  setOpen(false)
                  entry.onSelect()
                }}
              >
                <span>{entry.label}</span>
                {entry.shortcut ? <span className="menu-shortcut">{entry.shortcut}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

export function TitleBar() {
  const t = useT()
  const commands = useCommands()
  const name = useEditor((state) => state.doc.name)
  const dirty = useEditor((state) => state.doc.dirty)
  const savedAt = useEditor((state) => state.doc.savedAt)
  const pageCount = useEditor((state) => state.doc.pages.length)
  const theme = useEditor((state) => state.theme)
  const setTool = useEditor((state) => state.setTool)
  const clearPageAnnotations = useEditor((state) => state.clearPageAnnotations)

  const openFilePicker = async () => {
    const files = await pickFiles(IMPORT_ACCEPT)
    if (files) await commands.openFiles(files)
  }

  const clearMarkings = () => {
    const page = selectActivePage(useEditor.getState())
    if (page) clearPageAnnotations(page.id)
  }

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
      <nav className="menubar" aria-label={t("Main menu")}>
        <Menu
          label={t("File")}
          entries={[
            { label: t("New document…"), shortcut: "Ctrl+N", onSelect: commands.newDocument },
            { label: t("Open PDF…"), shortcut: "Ctrl+O", onSelect: () => void openFilePicker() },
            { label: t("Open from library…"), onSelect: commands.openLibrary },
            "separator",
            { label: t("Save"), shortcut: "Ctrl+S", onSelect: () => void commands.save(), disabled: pageCount === 0 },
            { label: t("Save a copy…"), onSelect: () => void commands.saveCopy(), disabled: pageCount === 0 },
            {
              label: t("Export as…"),
              shortcut: "Ctrl+E",
              onSelect: () => useEditor.getState().openDialog("export"),
              disabled: pageCount === 0,
            },
            "separator",
            {
              label: t("Scan pages…"),
              shortcut: "Ctrl+Shift+S",
              onSelect: () => useEditor.getState().openDialog("scan"),
            },
            "separator",
            { label: t("Exit"), shortcut: "Alt+F4", onSelect: commands.exit },
          ]}
        />
        <Menu
          label={t("Edit")}
          entries={[
            { label: t("Undo"), shortcut: "Ctrl+Z", onSelect: commands.undo },
            { label: t("Redo"), shortcut: "Ctrl+Y", onSelect: commands.redo },
            "separator",
            {
              label: t("Find and replace text…"),
              shortcut: "Ctrl+H",
              onSelect: () => useEditor.getState().openDialog("find"),
            },
            { label: t("Select tool"), shortcut: "Esc", onSelect: () => setTool("select") },
            "separator",
            { label: t("Duplicate page"), onSelect: commands.duplicateActive, disabled: pageCount === 0 },
            { label: t("Delete page"), onSelect: commands.deleteActive, disabled: pageCount === 0 },
            { label: t("Clear markings on page"), onSelect: clearMarkings, disabled: pageCount === 0 },
          ]}
        />
        <Menu
          label={t("View")}
          entries={[
            { label: t("Zoom in"), shortcut: "Ctrl+Plus", onSelect: commands.zoomIn },
            { label: t("Zoom out"), shortcut: "Ctrl+Minus", onSelect: commands.zoomOut },
            { label: t("Fit page"), shortcut: "Ctrl+0", onSelect: commands.fitPage },
            { label: t("Fit width"), onSelect: commands.fitWidth },
            "separator",
            { label: t("Page thumbnails"), onSelect: () => useEditor.getState().toggleThumbnails() },
            { label: t("Properties panel"), onSelect: () => useEditor.getState().toggleInspector() },
            "separator",
            { label: themeLabel, onSelect: commands.toggleTheme },
          ]}
        />
        <Menu
          label={t("Pages")}
          entries={[
            { label: t("Insert blank page"), shortcut: "Ctrl+Shift+N", onSelect: commands.insertBlank },
            { label: t("Duplicate page"), onSelect: commands.duplicateActive, disabled: pageCount === 0 },
            "separator",
            { label: t("Rotate left"), onSelect: () => commands.rotateActive(-90), disabled: pageCount === 0 },
            { label: t("Rotate right"), onSelect: () => commands.rotateActive(90), disabled: pageCount === 0 },
            "separator",
            { label: t("Move page up"), onSelect: () => commands.moveActive(-1), disabled: pageCount === 0 },
            { label: t("Move page down"), onSelect: () => commands.moveActive(1), disabled: pageCount === 0 },
            "separator",
            { label: t("Delete page"), onSelect: commands.deleteActive, disabled: pageCount === 0 },
          ]}
        />
        <Menu
          label={t("Scan")}
          entries={[
            { label: t("Scan pages…"), onSelect: () => useEditor.getState().openDialog("scan") },
            { label: t("Make scanned pages searchable…"), onSelect: () => useEditor.getState().openDialog("scan") },
            "separator",
            { label: t("Recognize text on pages…"), onSelect: commands.runOcr },
          ]}
        />
        <Menu
          label={t("Tools")}
          entries={[
            { label: t("Document properties…"), onSelect: commands.editProperties },
            { label: t("Recognize text (OCR)…"), onSelect: commands.runOcr },
            {
              label: t("Fill form fields…"),
              onSelect: () => useEditor.getState().openDialog("form"),
            },
            "separator",
            { label: t("Extract text to .txt"), onSelect: () => void commands.exportAs("txt"), disabled: pageCount === 0 },
            { label: t("Copy picture from page…"), onSelect: () => setTool("region"), disabled: pageCount === 0 },
            "separator",
            { label: t("Storage & security…"), onSelect: commands.storageSettings },
          ]}
        />
        <Menu
          label={t("Help")}
          entries={[
            { label: t("About PDF Studio"), onSelect: commands.about },
            { label: t("Keyboard shortcuts"), onSelect: commands.shortcuts },
            { label: t("Security notes"), onSelect: () => useEditor.getState().openDialog("about") },
            "separator",
            { label: t("Setup & dependencies…"), onSelect: commands.setup },
          ]}
        />
      </nav>
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
