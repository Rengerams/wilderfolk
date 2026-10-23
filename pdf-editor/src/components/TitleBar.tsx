import { useEffect, useRef, useState } from "react"
import { LogOut, Moon, Sun } from "lucide-react"
import { IMPORT_ACCEPT, pickFiles } from "../app/files"
import { selectActivePage, useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"

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
      <nav className="menubar" aria-label="Main menu">
        <Menu
          label="File"
          entries={[
            { label: "New document…", shortcut: "Ctrl+N", onSelect: commands.newDocument },
            { label: "Open PDF…", shortcut: "Ctrl+O", onSelect: () => void openFilePicker() },
            { label: "Open from library…", onSelect: commands.openLibrary },
            "separator",
            { label: "Save", shortcut: "Ctrl+S", onSelect: () => void commands.save(), disabled: pageCount === 0 },
            { label: "Save a copy…", onSelect: () => void commands.saveCopy(), disabled: pageCount === 0 },
            {
              label: "Export as…",
              shortcut: "Ctrl+E",
              onSelect: () => useEditor.getState().openDialog("export"),
              disabled: pageCount === 0,
            },
            "separator",
            {
              label: "Scan pages…",
              shortcut: "Ctrl+Shift+S",
              onSelect: () => useEditor.getState().openDialog("scan"),
            },
            "separator",
            { label: "Exit", shortcut: "Alt+F4", onSelect: commands.exit },
          ]}
        />
        <Menu
          label="Edit"
          entries={[
            { label: "Undo", shortcut: "Ctrl+Z", onSelect: commands.undo },
            { label: "Redo", shortcut: "Ctrl+Y", onSelect: commands.redo },
            "separator",
            {
              label: "Find and replace text…",
              shortcut: "Ctrl+H",
              onSelect: () => useEditor.getState().openDialog("find"),
            },
            { label: "Select tool", shortcut: "Esc", onSelect: () => setTool("select") },
            "separator",
            { label: "Duplicate page", onSelect: commands.duplicateActive, disabled: pageCount === 0 },
            { label: "Delete page", onSelect: commands.deleteActive, disabled: pageCount === 0 },
            { label: "Clear markings on page", onSelect: clearMarkings, disabled: pageCount === 0 },
          ]}
        />
        <Menu
          label="View"
          entries={[
            { label: "Zoom in", shortcut: "Ctrl+Plus", onSelect: commands.zoomIn },
            { label: "Zoom out", shortcut: "Ctrl+Minus", onSelect: commands.zoomOut },
            { label: "Fit page", shortcut: "Ctrl+0", onSelect: commands.fitPage },
            { label: "Fit width", onSelect: commands.fitWidth },
            "separator",
            { label: "Page thumbnails", onSelect: () => useEditor.getState().toggleThumbnails() },
            { label: "Properties panel", onSelect: () => useEditor.getState().toggleInspector() },
            "separator",
            {
              label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
              onSelect: commands.toggleTheme,
            },
          ]}
        />
        <Menu
          label="Pages"
          entries={[
            { label: "Insert blank page", shortcut: "Ctrl+Shift+N", onSelect: commands.insertBlank },
            { label: "Duplicate page", onSelect: commands.duplicateActive, disabled: pageCount === 0 },
            "separator",
            { label: "Rotate left", onSelect: () => commands.rotateActive(-90), disabled: pageCount === 0 },
            { label: "Rotate right", onSelect: () => commands.rotateActive(90), disabled: pageCount === 0 },
            "separator",
            { label: "Move page up", onSelect: () => commands.moveActive(-1), disabled: pageCount === 0 },
            { label: "Move page down", onSelect: () => commands.moveActive(1), disabled: pageCount === 0 },
            "separator",
            { label: "Delete page", onSelect: commands.deleteActive, disabled: pageCount === 0 },
          ]}
        />
        <Menu
          label="Scan"
          entries={[
            { label: "Scan pages…", onSelect: () => useEditor.getState().openDialog("scan") },
            { label: "Make scanned pages searchable…", onSelect: () => useEditor.getState().openDialog("scan") },
            "separator",
            { label: "Recognize text on pages…", onSelect: commands.runOcr },
          ]}
        />
        <Menu
          label="Tools"
          entries={[
            { label: "Document properties…", onSelect: commands.editProperties },
            { label: "Recognize text (OCR)…", onSelect: commands.runOcr },
            {
              label: "Fill form fields…",
              onSelect: () => useEditor.getState().openDialog("form"),
            },
            "separator",
            { label: "Extract text to .txt", onSelect: () => void commands.exportAs("txt"), disabled: pageCount === 0 },
            { label: "Copy picture from page…", onSelect: () => setTool("region"), disabled: pageCount === 0 },
            "separator",
            { label: "Storage & security…", onSelect: commands.storageSettings },
          ]}
        />
        <Menu
          label="Help"
          entries={[
            { label: "About PDF Studio", onSelect: commands.about },
            { label: "Keyboard shortcuts", onSelect: commands.shortcuts },
            { label: "Security notes", onSelect: () => useEditor.getState().openDialog("about") },
          ]}
        />
      </nav>
      <div className="titlebar-spacer" />
      {savedAt ? <span className="chip" title={`Saved ${new Date(savedAt).toLocaleString()}`}>Saved</span> : null}
      <button
        type="button"
        className="icon-btn"
        onClick={commands.toggleTheme}
        aria-label="Switch theme"
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button type="button" className="btn btn-quiet" onClick={commands.exit} title="Close PDF Studio">
        <LogOut size={15} />
        Exit
      </button>
    </header>
  )
}
