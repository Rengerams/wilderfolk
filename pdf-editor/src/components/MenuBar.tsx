import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { IMPORT_ACCEPT, pickFiles } from "../app/files"
import { selectActivePage, useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"
import { useT } from "../i18n"

type MenuEntry =
  | { label: string; shortcut?: string; onSelect: () => void; disabled?: boolean }
  | "separator"

type MenuSection = { label: string; entries: MenuEntry[] }

type OpenTarget = "first" | "last" | null

const ENABLED_ITEMS = '[role="menuitem"]:not([disabled])'

function enabledItems(panel: HTMLElement | null): HTMLElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>(ENABLED_ITEMS)) : []
}

function focusItem(items: HTMLElement[], index: number): void {
  if (items.length === 0) return
  items[(index + items.length) % items.length]?.focus()
}

function Menu(props: {
  label: string
  entries: MenuEntry[]
  open: boolean
  focusOnOpen: OpenTarget
  triggerRef: (node: HTMLButtonElement | null) => void
  onToggle: () => void
  onHover: () => void
  onOpenFromKeyboard: (focusOnOpen: Exclude<OpenTarget, null>) => void
  onSwitch: (delta: number) => void
  onClose: (refocusTrigger: boolean) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!props.open || !props.focusOnOpen) return
    const items = enabledItems(panelRef.current)
    focusItem(items, props.focusOnOpen === "last" ? items.length - 1 : 0)
  }, [props.open, props.focusOnOpen])

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "Escape":
        props.onClose(true)
        return
      case "ArrowRight":
      case "ArrowLeft":
        event.preventDefault()
        props.onSwitch(event.key === "ArrowRight" ? 1 : -1)
        return
      case "ArrowDown":
      case "Enter":
      case " ":
        event.preventDefault()
        props.onOpenFromKeyboard("first")
        return
      case "ArrowUp":
        event.preventDefault()
        props.onOpenFromKeyboard("last")
        return
      default:
        return
    }
  }

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = enabledItems(panelRef.current)
    const current = items.indexOf(document.activeElement as HTMLElement)
    switch (event.key) {
      case "Escape":
        event.preventDefault()
        props.onClose(true)
        return
      case "Tab":
        props.onClose(false)
        return
      case "ArrowRight":
      case "ArrowLeft":
        event.preventDefault()
        props.onSwitch(event.key === "ArrowRight" ? 1 : -1)
        return
      case "ArrowDown":
        event.preventDefault()
        focusItem(items, current + 1)
        return
      case "ArrowUp":
        event.preventDefault()
        focusItem(items, current - 1)
        return
      case "Home":
        event.preventDefault()
        focusItem(items, 0)
        return
      case "End":
        event.preventDefault()
        focusItem(items, items.length - 1)
        return
      default:
        return
    }
  }

  return (
    <div className="menu" onPointerEnter={props.onHover}>
      <button
        type="button"
        className="menu-trigger"
        aria-expanded={props.open}
        aria-haspopup="menu"
        ref={props.triggerRef}
        onClick={props.onToggle}
        onKeyDown={onTriggerKeyDown}
      >
        {props.label}
      </button>
      {props.open ? (
        <div className="menu-panel" role="menu" aria-label={props.label} ref={panelRef} onKeyDown={onPanelKeyDown}>
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
                  props.onClose(false)
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

export function MenuBar() {
  const t = useT()
  const commands = useCommands()
  const pageCount = useEditor((state) => state.doc.pages.length)
  const theme = useEditor((state) => state.theme)
  const setTool = useEditor((state) => state.setTool)
  const clearPageAnnotations = useEditor((state) => state.clearPageAnnotations)

  const navRef = useRef<HTMLElement>(null)
  const triggers = useRef<(HTMLButtonElement | null)[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [focusOnOpen, setFocusOnOpen] = useState<OpenTarget>(null)

  useEffect(() => {
    if (openIndex === null) return
    const closeOnOutside = (event: globalThis.PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenIndex(null)
    }
    window.addEventListener("pointerdown", closeOnOutside)
    return () => window.removeEventListener("pointerdown", closeOnOutside)
  }, [openIndex])

  const openFilePicker = async () => {
    const files = await pickFiles(IMPORT_ACCEPT)
    if (files) await commands.openFiles(files)
  }

  const clearMarkings = () => {
    const page = selectActivePage(useEditor.getState())
    if (page) clearPageAnnotations(page.id)
  }

  const themeLabel = theme === "dark" ? t("Switch to light theme") : t("Switch to dark theme")

  const sections: MenuSection[] = [
    {
      label: t("File"),
      entries: [
        { label: t("New document…"), shortcut: "Ctrl+N", onSelect: commands.newDocument },
        { label: t("Open PDF…"), shortcut: "Ctrl+O", onSelect: () => void openFilePicker() },
        { label: t("Open from library…"), onSelect: commands.openLibrary },
        "separator",
        { label: t("Save"), shortcut: "Ctrl+S", onSelect: () => void commands.save(), disabled: pageCount === 0 },
        { label: t("Save a copy…"), onSelect: () => void commands.saveCopy(), disabled: pageCount === 0 },
        {
          label: t("Split document…"),
          onSelect: () => useEditor.getState().openDialog("split"),
          disabled: pageCount === 0,
        },
        {
          label: t("Export as…"),
          shortcut: "Ctrl+E",
          onSelect: () => useEditor.getState().openDialog("export"),
          disabled: pageCount === 0,
        },
        {
          label: t("Print…"),
          shortcut: "Ctrl+P",
          onSelect: () => void commands.print(),
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
      ],
    },
    {
      label: t("Edit"),
      entries: [
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
      ],
    },
    {
      label: t("View"),
      entries: [
        { label: t("Zoom in"), shortcut: "Ctrl+Plus", onSelect: commands.zoomIn },
        { label: t("Zoom out"), shortcut: "Ctrl+Minus", onSelect: commands.zoomOut },
        { label: t("Fit page"), shortcut: "Ctrl+0", onSelect: commands.fitPage },
        { label: t("Fit width"), onSelect: commands.fitWidth },
        "separator",
        { label: t("Page thumbnails"), onSelect: () => useEditor.getState().toggleThumbnails() },
        { label: t("Properties panel"), onSelect: () => useEditor.getState().toggleInspector() },
        "separator",
        { label: themeLabel, onSelect: commands.toggleTheme },
      ],
    },
    {
      label: t("Pages"),
      entries: [
        { label: t("Insert blank page"), shortcut: "Ctrl+Shift+N", onSelect: commands.insertBlank },
        { label: t("Duplicate page"), onSelect: commands.duplicateActive, disabled: pageCount === 0 },
        "separator",
        {
          label: t("Page numbers…"),
          onSelect: () => useEditor.getState().openDialog("pageNumbers"),
          disabled: pageCount === 0,
        },
        {
          label: t("Watermark…"),
          onSelect: () => useEditor.getState().openDialog("watermark"),
          disabled: pageCount === 0,
        },
        {
          label: t("Extract pages…"),
          onSelect: () => useEditor.getState().openDialog("extract"),
          disabled: pageCount === 0,
        },
        "separator",
        { label: t("Rotate left"), onSelect: () => commands.rotateActive(-90), disabled: pageCount === 0 },
        { label: t("Rotate right"), onSelect: () => commands.rotateActive(90), disabled: pageCount === 0 },
        "separator",
        { label: t("Move page up"), onSelect: () => commands.moveActive(-1), disabled: pageCount === 0 },
        { label: t("Move page down"), onSelect: () => commands.moveActive(1), disabled: pageCount === 0 },
        "separator",
        { label: t("Delete page"), onSelect: commands.deleteActive, disabled: pageCount === 0 },
      ],
    },
    {
      label: t("Scan"),
      entries: [
        { label: t("Scan pages…"), onSelect: () => useEditor.getState().openDialog("scan") },
        { label: t("Make scanned pages searchable…"), onSelect: () => useEditor.getState().openDialog("scan") },
        "separator",
        { label: t("Recognize text on pages…"), onSelect: commands.runOcr },
      ],
    },
    {
      label: t("Tools"),
      entries: [
        { label: t("Document properties…"), onSelect: commands.editProperties },
        { label: t("Recognize text (OCR)…"), onSelect: commands.runOcr },
        { label: t("Fill form fields…"), onSelect: () => useEditor.getState().openDialog("form") },
        "separator",
        {
          label: t("Signature…"),
          onSelect: () => useEditor.getState().openDialog("signature"),
          disabled: pageCount === 0,
        },
        {
          label: t("Stamp…"),
          onSelect: () => useEditor.getState().openDialog("stamp"),
          disabled: pageCount === 0,
        },
        "separator",
        { label: t("Extract text to .txt"), onSelect: () => void commands.exportAs("txt"), disabled: pageCount === 0 },
        { label: t("Copy picture from page…"), onSelect: () => setTool("region"), disabled: pageCount === 0 },
        "separator",
        { label: t("Storage & security…"), onSelect: commands.storageSettings },
      ],
    },
    {
      label: t("Help"),
      entries: [
        { label: t("About PDF Studio"), onSelect: commands.about },
        { label: t("Keyboard shortcuts"), onSelect: commands.shortcuts },
        { label: t("Security notes"), onSelect: () => useEditor.getState().openDialog("about") },
      ],
    },
  ]

  const focusTrigger = (index: number) => {
    const count = sections.length
    triggers.current[((index % count) + count) % count]?.focus()
  }

  const moveTo = (index: number, delta: number) => {
    const count = sections.length
    const next = ((index + delta) % count + count) % count
    setFocusOnOpen(null)
    if (openIndex !== null) setOpenIndex(next)
    triggers.current[next]?.focus()
  }

  return (
    <nav className="menubar" aria-label={t("Main menu")} ref={navRef}>
      {sections.map((section, index) => (
        <Menu
          key={section.label}
          label={section.label}
          entries={section.entries}
          open={openIndex === index}
          focusOnOpen={openIndex === index ? focusOnOpen : null}
          triggerRef={(node) => {
            triggers.current[index] = node
          }}
          onToggle={() => {
            setFocusOnOpen(null)
            setOpenIndex(openIndex === index ? null : index)
          }}
          onHover={() => {
            if (openIndex === null || openIndex === index) return
            setFocusOnOpen(null)
            setOpenIndex(index)
          }}
          onOpenFromKeyboard={(target) => {
            setFocusOnOpen(target)
            setOpenIndex(index)
          }}
          onSwitch={(delta) => moveTo(index, delta)}
          onClose={(refocusTrigger) => {
            setOpenIndex(null)
            if (refocusTrigger) focusTrigger(index)
          }}
        />
      ))}
    </nav>
  )
}
