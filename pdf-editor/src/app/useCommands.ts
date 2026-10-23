import { useCallback, useMemo } from "react"
import type { ExportFormatId } from "../formats/registry"
import { applyTheme, currentSettings, updateSettings } from "../storage/settings"
import {
  copyRegionAsImage,
  documentIsPdf,
  exportAs,
  imageFilesOf,
  insertImageOnPage,
  openDocumentFile,
  saveDocument,
  saveDocumentCopy,
} from "./documentActions"
import { readImageInput } from "./documentActions"
import { selectActivePage, useEditor } from "./store"
import { getCurrentSource } from "./sourceRegistry"

export type Commands = {
  newDocument: () => void
  openFile: (file: File) => Promise<void>
  openFiles: (files: File[]) => Promise<void>
  openLibrary: () => void
  save: () => Promise<void>
  saveCopy: () => Promise<void>
  exportAs: (format: ExportFormatId) => Promise<void>
  editProperties: () => void
  runOcr: () => void
  storageSettings: () => void
  about: () => void
  shortcuts: () => void
  exit: () => void
  undo: () => void
  redo: () => void
  rotateActive: (delta: number) => void
  deleteActive: () => void
  duplicateActive: () => void
  insertBlank: () => void
  moveActive: (delta: number) => void
  zoomIn: () => void
  zoomOut: () => void
  fitPage: () => void
  fitWidth: () => void
  toggleTheme: () => void
  insertImage: (file: File) => Promise<void>
  captureRegion: (rect: { x: number; y: number; w: number; h: number }) => Promise<void>
}

export function useCommands(): Commands {
  const openDialog = useEditor((state) => state.openDialog)
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)

  const wrap = useCallback(
    async (label: string, run: () => Promise<unknown>) => {
      setStatus(`${label}…`)
      try {
        await run()
      } catch (error) {
        setStatus(error instanceof Error ? `⚠ ${error.message}` : "⚠ Something went wrong.")
      }
    },
    [setStatus],
  )

  return useMemo<Commands>(
    () => ({
      newDocument: () => openDialog("new"),
      openFile: (file) => wrap("Opening", () => openDocumentFile(file)),
      openFiles: (files) =>
        wrap("Opening", async () => {
          const pdf = files.find(documentIsPdf)
          if (pdf) await openDocumentFile(pdf)
          const images = imageFilesOf(pdf ? files.filter((file) => file !== pdf) : files)
          if (images.length > 0) {
            const state = useEditor.getState()
            if (pdf && state.doc.pages.length > 0) {
              const imported = await Promise.all(images.map(readImageInput))
              state.appendImagePages(imported)
            } else {
              const imported = await Promise.all(images.map(readImageInput))
              state.importImages({
                name: images[0].name.replace(/\.[^.]+$/, ""),
                images: imported,
              })
            }
          }
          if (!pdf && files.length > 0 && files.length !== images.length) {
            state_status(setStatus, "Only PDF, PNG and JPEG files can be opened.")
          }
        }),
      openLibrary: () => openDialog("open"),
      save: () => wrap("Saving", () => saveDocument()),
      saveCopy: () => wrap("Saving a copy", () => saveDocumentCopy()),
      exportAs: (format) => wrap("Exporting", () => exportAs(format)),
      editProperties: () => openDialog("metadata"),
      runOcr: () => openDialog("ocr"),
      storageSettings: () => openDialog("settings"),
      about: () => openDialog("about"),
      shortcuts: () => openDialog("shortcuts"),
      exit: () => {
        const state = useEditor.getState()
        if (state.doc.dirty) openDialog("exit")
        else {
          closeDialog()
          openDialog("closed")
        }
      },
      undo: () => useEditor.getState().undo(),
      redo: () => useEditor.getState().redo(),
      rotateActive: (delta) => {
        const state = useEditor.getState()
        const page = selectActivePage(state)
        if (page) state.rotatePage(page.id, delta)
      },
      deleteActive: () => {
        const state = useEditor.getState()
        const page = selectActivePage(state)
        if (page) state.removePage(page.id)
      },
      duplicateActive: () => {
        const state = useEditor.getState()
        const page = selectActivePage(state)
        if (page) state.duplicatePage(page.id)
      },
      insertBlank: () => {
        const state = useEditor.getState()
        state.insertBlankPage(selectActivePage(state)?.id ?? null)
      },
      moveActive: (delta) => {
        const state = useEditor.getState()
        const page = selectActivePage(state)
        if (!page) return
        const index = state.doc.pages.findIndex((entry) => entry.id === page.id)
        state.movePageTo(page.id, index + delta)
      },
      zoomIn: () => {
        const state = useEditor.getState()
        state.setZoom(state.zoom + 0.15)
      },
      zoomOut: () => {
        const state = useEditor.getState()
        state.setZoom(state.zoom - 0.15)
      },
      fitPage: () => useEditor.getState().setFitMode("page"),
      fitWidth: () => useEditor.getState().setFitMode("width"),
      toggleTheme: () => {
        const next = currentSettings().theme === "dark" ? "light" : "dark"
        updateSettings({ theme: next })
        applyTheme(next)
        useEditor.getState().setTheme(next)
      },
      insertImage: (file) =>
        wrap("Adding image", async () => {
          const state = useEditor.getState()
          const page = selectActivePage(state)
          if (!page) throw new Error("Create a page before adding an image.")
          await insertImageOnPage(page.id, file)
        }),
      captureRegion: (rect) =>
        wrap("Copying region", async () => {
          const state = useEditor.getState()
          const page = selectActivePage(state)
          if (!page) throw new Error("Select a page first.")
          await copyRegionAsImage(page.id, rect)
        }),
    }),
    [closeDialog, openDialog, setStatus, wrap],
  )
}

function state_status(setStatus: (value: string) => void, message: string): void {
  setStatus(`⚠ ${message}`)
}

export function hasSource(): boolean {
  return getCurrentSource() !== null
}
