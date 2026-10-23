import { useEffect } from "react"
import { IMPORT_ACCEPT, pickFiles } from "./app/files"
import { useEditor } from "./app/store"
import { useCommands } from "./app/useCommands"
import { DialogHost } from "./components/dialogs/DialogHost"
import { InspectorPanel } from "./components/InspectorPanel"
import { PageViewer } from "./components/PageViewer"
import { StatusBar } from "./components/StatusBar"
import { ThumbnailRail } from "./components/ThumbnailRail"
import { TitleBar } from "./components/TitleBar"
import { Toolbar } from "./components/Toolbar"
import { applyTheme, currentSettings } from "./storage/settings"

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    element.isContentEditable ||
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  )
}

export function App() {
  const commands = useCommands()
  const dialog = useEditor((state) => state.dialog)
  const showThumbnails = useEditor((state) => state.showThumbnails)
  const showInspector = useEditor((state) => state.showInspector)
  const setTheme = useEditor((state) => state.setTheme)
  const setTool = useEditor((state) => state.setTool)

  useEffect(() => {
    const saved = currentSettings()
    applyTheme(saved.theme)
    setTheme(saved.theme)
  }, [setTheme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useEditor.getState()
      const ctrl = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (event.key === "Escape") {
        if (state.dialog) {
          useEditor.getState().closeDialog()
          return
        }
        if (state.tool !== "select") useEditor.getState().setTool("select")
        return
      }
      if (event.key === "F1") {
        event.preventDefault()
        useEditor.getState().openDialog("about")
        return
      }
      if (isTypingTarget(event.target)) return

      if (ctrl) {
        if (event.shiftKey && key === "s") {
          event.preventDefault()
          useEditor.getState().openDialog("scan")
          return
        }
        if (event.shiftKey && key === "n") {
          event.preventDefault()
          commands.insertBlank()
          return
        }
        switch (key) {
          case "n":
            event.preventDefault()
            commands.newDocument()
            return
          case "o":
            event.preventDefault()
            void pickFiles(IMPORT_ACCEPT).then((files) => {
              if (files) void commands.openFiles(files)
            })
            return
          case "s":
            event.preventDefault()
            void commands.save()
            return
          case "e":
            event.preventDefault()
            useEditor.getState().openDialog("export")
            return
          case "h":
            event.preventDefault()
            useEditor.getState().openDialog("find")
            return
          case "z":
            event.preventDefault()
            if (event.shiftKey) commands.redo()
            else commands.undo()
            return
          case "y":
            event.preventDefault()
            commands.redo()
            return
          case "0":
            event.preventDefault()
            commands.fitPage()
            return
          case "=":
          case "+":
            event.preventDefault()
            commands.zoomIn()
            return
          case "-":
            event.preventDefault()
            commands.zoomOut()
            return
          default:
            return
        }
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedAnnotationId) {
          event.preventDefault()
          state.removeAnnotation(state.selectedAnnotationId)
        }
        return
      }
      if (event.key === "PageDown" || event.key === "PageUp") {
        event.preventDefault()
        const delta = event.key === "PageDown" ? 1 : -1
        const index = state.doc.pages.findIndex((page) => page.id === state.activePageId)
        const next = state.doc.pages[index + delta] ?? state.doc.pages[0]
        if (next) state.setActivePage(next.id)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [commands, setTool])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useEditor.getState().doc.dirty) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <Toolbar />
      <div className="app-body">
        {showThumbnails ? <ThumbnailRail /> : null}
        <PageViewer />
        {showInspector ? <InspectorPanel /> : null}
      </div>
      <StatusBar />
      {dialog ? <DialogHost kind={dialog} /> : null}
    </div>
  )
}
