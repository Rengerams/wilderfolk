import { create } from "zustand"
import { currentLanguage, t } from "../i18n/translate"
import type { LanguageCode } from "../i18n/languages"
import { updateSettings } from "../storage/settings"
import type {
  Annotation,
  DialogKind,
  DocMetadata,
  DocSnapshot,
  DocState,
  FitMode,
  OcrLayer,
  PageRef,
  PageSize,
  Point,
  Rect,
  Rotation,
  ThemeName,
  Tool,
  Watermark,
} from "../types"
import { clampRectToPage, normalizeRotation } from "../pdf/geometry"
import {
  DEFAULT_PRESET_ID,
  blankPage,
  createId,
  orientSize,
  presetById,
  sanitizeFileName,
  withPdfExtension,
} from "../pdf/pages"

export const HISTORY_LIMIT = 40

export type ImportedImage = {
  dataUrl: string
  mime: "image/png" | "image/jpeg"
  width: number
  height: number
}

export type AnnotationPatch = {
  rect?: Rect
  text?: string
  fontSize?: number
  color?: string
  stroke?: string
  fill?: string | null
  fillOpacity?: number
  lineWidth?: number
  points?: Point[]
}

export function emptyMetadata(): DocMetadata {
  const now = new Date().toISOString()
  return {
    title: "",
    author: "",
    subject: "",
    keywords: "",
    creator: "PDF Studio",
    producer: "PDF Studio",
    creationDate: now,
    modificationDate: now,
  }
}

export function emptyDocument(): DocState {
  return {
    id: createId("doc"),
    name: "Untitled.pdf",
    source: null,
    pages: [],
    annotations: [],
    ocr: [],
    watermark: null,
    metadata: emptyMetadata(),
    dirty: false,
    savedAt: null,
  }
}

function snapshot(doc: DocState): DocSnapshot {
  return {
    name: doc.name,
    pages: doc.pages,
    annotations: doc.annotations,
    ocr: doc.ocr,
    watermark: doc.watermark,
    metadata: doc.metadata,
  }
}

/** A restored history entry may lack the selected page or object; the selection falls back to what it holds. */
function validSelection(
  doc: DocState,
  activePageId: string,
  selectedAnnotationId: string | null,
): { activePageId: string; selectedAnnotationId: string | null } {
  return {
    activePageId: doc.pages.some((page) => page.id === activePageId)
      ? activePageId
      : doc.pages[0]?.id ?? "",
    selectedAnnotationId:
      selectedAnnotationId &&
      doc.annotations.some((annotation) => annotation.id === selectedAnnotationId)
        ? selectedAnnotationId
        : null,
  }
}

export type EditorState = {
  doc: DocState
  past: DocSnapshot[]
  future: DocSnapshot[]
  tool: Tool
  activePageId: string
  selectedAnnotationId: string | null
  zoom: number
  fitMode: FitMode
  showThumbnails: boolean
  showInspector: boolean
  theme: ThemeName
  language: LanguageCode
  dialog: DialogKind
  status: string
  busy: { label: string; progress: number } | null

  setTool: (tool: Tool) => void
  selectAnnotation: (id: string | null) => void
  setActivePage: (pageId: string) => void
  setZoom: (zoom: number, fit?: FitMode) => void
  setFitMode: (fit: FitMode) => void
  toggleThumbnails: () => void
  toggleInspector: () => void
  setTheme: (theme: ThemeName) => void
  setLanguage: (language: LanguageCode) => void
  openDialog: (dialog: DialogKind) => void
  closeDialog: () => void
  setStatus: (status: string) => void
  startBusy: (label: string) => void
  updateBusy: (progress: number, label?: string) => void
  endBusy: () => void

  replaceDocument: (doc: DocState) => void
  newDocument: (input: {
    name: string
    size: PageSize
    orientation: "portrait" | "landscape"
    count: number
  }) => void
  importImages: (input: { name: string; images: ImportedImage[] }) => void
  appendImagePages: (images: ImportedImage[]) => void
  setDocumentName: (name: string) => void
  setWatermark: (watermark: Watermark | null) => void
  setMetadata: (patch: Partial<DocMetadata>) => void
  markSaved: (savedAt: string) => void

  rotatePage: (pageId: string, delta: number) => void
  duplicatePage: (pageId: string) => void
  removePage: (pageId: string) => void
  insertBlankPage: (afterPageId: string | null) => void
  movePageTo: (pageId: string, targetIndex: number) => void

  addAnnotation: (annotation: Annotation) => void
  addAnnotations: (annotations: Annotation[]) => void
  updateAnnotation: (id: string, patch: AnnotationPatch) => void
  removeAnnotation: (id: string) => void
  clearPageAnnotations: (pageId: string) => void

  setOcrLayer: (layer: OcrLayer) => void
  updateOcrLine: (pageId: string, lineId: string, text: string) => void
  setOcrApplied: (pageId: string, applied: boolean) => void
  removeOcrLayer: (pageId: string) => void

  undo: () => void
  redo: () => void
}

/** Lays each captured or imported image on its own page, scaled to fit with a small margin. */
export function buildImagePages(images: ImportedImage[]): {
  pages: PageRef[]
  annotations: Annotation[]
} {
  const baseSize = presetById(DEFAULT_PRESET_ID)
  const pages: PageRef[] = []
  const annotations: Annotation[] = []
  const margin = 0.04
  for (const image of images) {
    const landscape = image.width > image.height
    const size = landscape
      ? { width: baseSize.height, height: baseSize.width }
      : { width: baseSize.width, height: baseSize.height }
    const page = blankPage(size)
    pages.push(page)
    const scale = Math.min(
      ((1 - margin * 2) * size.width) / image.width,
      ((1 - margin * 2) * size.height) / image.height,
    )
    const width = (image.width * scale) / size.width
    const height = (image.height * scale) / size.height
    annotations.push({
      id: createId("ann"),
      pageId: page.id,
      type: "image",
      rect: { x: (1 - width) / 2, y: (1 - height) / 2, w: width, h: height },
      dataUrl: image.dataUrl,
      mime: image.mime,
    })
  }
  return { pages, annotations }
}

export const useEditor = create<EditorState>()((set, get) => {
  const pushHistory = (next: DocState, extra: Partial<EditorState> = {}) => {
    const state = get()
    set({
      doc: { ...next, dirty: true },
      past: [...state.past, snapshot(state.doc)].slice(-HISTORY_LIMIT),
      future: [],
      ...extra,
    })
  }

  const patchDoc = (patch: Partial<DocState>, extra: Partial<EditorState> = {}) => {
    pushHistory({ ...get().doc, ...patch }, extra)
  }

  return {
    doc: emptyDocument(),
    past: [],
    future: [],
    tool: "select",
    activePageId: "",
    selectedAnnotationId: null,
    zoom: 1,
    fitMode: "page",
    showThumbnails: true,
    showInspector: true,
    theme: "light",
    language: currentLanguage(),
    dialog: null,
    status: t("Ready"),
    busy: null,

    setTool: (tool) => set({ tool, selectedAnnotationId: tool === "select" ? get().selectedAnnotationId : null }),
    selectAnnotation: (id) => set({ selectedAnnotationId: id }),
    setActivePage: (pageId) => set({ activePageId: pageId, selectedAnnotationId: null }),
    setZoom: (zoom, fit = "custom") => set({ zoom: Math.min(6, Math.max(0.1, zoom)), fitMode: fit }),
    setFitMode: (fit) => set({ fitMode: fit }),
    toggleThumbnails: () => set({ showThumbnails: !get().showThumbnails }),
    toggleInspector: () => set({ showInspector: !get().showInspector }),
    setTheme: (theme) => set({ theme }),
    setLanguage: (language) => {
      updateSettings({ language })
      set({ language })
    },
    openDialog: (dialog) => set({ dialog }),
    closeDialog: () => set({ dialog: null }),
    setStatus: (status) => set({ status }),
    startBusy: (label) => set({ busy: { label, progress: 0 } }),
    updateBusy: (progress, label) =>
      set({ busy: { label: label ?? get().busy?.label ?? t("Working"), progress } }),
    endBusy: () => set({ busy: null }),

    replaceDocument: (doc) =>
      set({
        doc,
        past: [],
        future: [],
        activePageId: doc.pages[0]?.id ?? "",
        selectedAnnotationId: null,
        tool: "select",
      }),

    newDocument: ({ name, size, orientation, count }) => {
      const pageSize = orientSize(size, orientation)
      const pages = Array.from({ length: Math.max(1, count) }, () => blankPage(pageSize))
      set({
        doc: {
          ...emptyDocument(),
          name: withPdfExtension(sanitizeFileName(name)),
          pages,
          dirty: true,
        },
        past: [],
        future: [],
        activePageId: pages[0].id,
        selectedAnnotationId: null,
        tool: "select",
        status: t(pages.length === 1 ? "Created {count} page" : "Created {count} pages", {
          count: pages.length,
        }),
      })
    },

    importImages: ({ name, images }) => {
      const { pages, annotations } = buildImagePages(images)
      set({
        doc: {
          ...emptyDocument(),
          name: withPdfExtension(sanitizeFileName(name)),
          pages,
          annotations,
          dirty: true,
        },
        past: [],
        future: [],
        activePageId: pages[0]?.id ?? "",
        selectedAnnotationId: null,
        status: t(pages.length === 1 ? "Imported {count} page" : "Imported {count} pages", {
          count: pages.length,
        }),
      })
    },

    appendImagePages: (images) => {
      const state = get()
      const { pages, annotations } = buildImagePages(images)
      if (pages.length === 0) return
      patchDoc(
        {
          pages: [...state.doc.pages, ...pages],
          annotations: [...state.doc.annotations, ...annotations],
        },
        { activePageId: pages[0].id },
      )
      set({
        status: t(
          pages.length === 1 ? "Added {count} scanned page" : "Added {count} scanned pages",
          { count: pages.length },
        ),
      })
    },

    setDocumentName: (name) => patchDoc({ name }),
    setWatermark: (watermark) => patchDoc({ watermark }),
    setMetadata: (patch) =>
      patchDoc({
        metadata: { ...get().doc.metadata, ...patch, modificationDate: new Date().toISOString() },
      }),
    markSaved: (savedAt) =>
      set({
        doc: {
          ...get().doc,
          dirty: false,
          savedAt,
          metadata: { ...get().doc.metadata, modificationDate: savedAt },
        },
        status: t("Saved {time}", { time: new Date(savedAt).toLocaleTimeString() }),
      }),

    rotatePage: (pageId, delta) => {
      const pages = get().doc.pages.map((page) =>
        page.id === pageId
          ? { ...page, rotation: normalizeRotation(page.rotation + delta) as Rotation }
          : page,
      )
      patchDoc({ pages })
    },

    duplicatePage: (pageId) => {
      const state = get()
      const index = state.doc.pages.findIndex((page) => page.id === pageId)
      if (index < 0) return
      const copy: PageRef = { ...state.doc.pages[index], id: createId("page") }
      const pages = [...state.doc.pages]
      pages.splice(index + 1, 0, copy)
      const copiedAnnotations = state.doc.annotations
        .filter((annotation) => annotation.pageId === pageId)
        .map((annotation) => ({ ...annotation, id: createId("ann"), pageId: copy.id }))
      patchDoc(
        { pages, annotations: [...state.doc.annotations, ...copiedAnnotations] },
        { activePageId: copy.id },
      )
    },

    removePage: (pageId) => {
      const state = get()
      const index = state.doc.pages.findIndex((page) => page.id === pageId)
      if (index < 0) return
      const pages = state.doc.pages.filter((page) => page.id !== pageId)
      const nextActive = pages[Math.min(index, pages.length - 1)]?.id ?? ""
      patchDoc(
        {
          pages,
          annotations: state.doc.annotations.filter((annotation) => annotation.pageId !== pageId),
          ocr: state.doc.ocr.filter((layer) => layer.pageId !== pageId),
        },
        { activePageId: nextActive, selectedAnnotationId: null },
      )
    },

    insertBlankPage: (afterPageId) => {
      const state = get()
      const reference =
        state.doc.pages.find((page) => page.id === afterPageId) ??
        state.doc.pages.find((page) => page.id === state.activePageId) ??
        state.doc.pages[state.doc.pages.length - 1]
      const size = reference
        ? { width: reference.width, height: reference.height }
        : presetById(DEFAULT_PRESET_ID)
      const page = blankPage(size)
      const pages = [...state.doc.pages]
      const index = reference ? pages.findIndex((entry) => entry.id === reference.id) + 1 : pages.length
      pages.splice(Math.max(0, index), 0, page)
      patchDoc({ pages }, { activePageId: page.id })
    },

    movePageTo: (pageId, targetIndex) => {
      const state = get()
      const pages = [...state.doc.pages]
      const from = pages.findIndex((page) => page.id === pageId)
      if (from < 0) return
      const [moved] = pages.splice(from, 1)
      const clamped = Math.min(Math.max(targetIndex, 0), pages.length)
      pages.splice(clamped, 0, moved)
      patchDoc({ pages })
    },

    addAnnotation: (annotation) => {
      const normalized =
        "rect" in annotation
          ? ({ ...annotation, rect: clampRectToPage(annotation.rect) } as Annotation)
          : annotation
      patchDoc(
        { annotations: [...get().doc.annotations, normalized] },
        { selectedAnnotationId: normalized.id },
      )
    },

    addAnnotations: (annotations) => {
      if (annotations.length === 0) return
      const normalized = annotations.map((annotation) =>
        "rect" in annotation
          ? ({ ...annotation, rect: clampRectToPage(annotation.rect) } as Annotation)
          : annotation,
      )
      patchDoc({ annotations: [...get().doc.annotations, ...normalized] })
    },

    updateAnnotation: (id, patch) => {
      const annotations = get().doc.annotations.map((annotation) => {
        if (annotation.id !== id) return annotation
        const merged = { ...annotation, ...patch } as Annotation
        return "rect" in merged
          ? ({ ...merged, rect: clampRectToPage(merged.rect) } as Annotation)
          : merged
      })
      patchDoc({ annotations })
    },

    removeAnnotation: (id) =>
      patchDoc(
        { annotations: get().doc.annotations.filter((annotation) => annotation.id !== id) },
        { selectedAnnotationId: null },
      ),

    clearPageAnnotations: (pageId) =>
      patchDoc({
        annotations: get().doc.annotations.filter((annotation) => annotation.pageId !== pageId),
      }),

    setOcrLayer: (layer) => {
      const others = get().doc.ocr.filter((entry) => entry.pageId !== layer.pageId)
      patchDoc({ ocr: [...others, layer] })
    },
    updateOcrLine: (pageId, lineId, text) =>
      patchDoc({
        ocr: get().doc.ocr.map((layer) =>
          layer.pageId === pageId
            ? {
                ...layer,
                lines: layer.lines.map((line) => (line.id === lineId ? { ...line, text } : line)),
              }
            : layer,
        ),
      }),
    setOcrApplied: (pageId, applied) =>
      patchDoc({
        ocr: get().doc.ocr.map((layer) =>
          layer.pageId === pageId ? { ...layer, applied } : layer,
        ),
      }),
    removeOcrLayer: (pageId) =>
      patchDoc({ ocr: get().doc.ocr.filter((layer) => layer.pageId !== pageId) }),

    undo: () => {
      const state = get()
      const previous = state.past[state.past.length - 1]
      if (!previous) return
      const doc = { ...state.doc, ...previous, dirty: true }
      set({
        doc,
        ...validSelection(doc, state.activePageId, state.selectedAnnotationId),
        past: state.past.slice(0, -1),
        future: [snapshot(state.doc), ...state.future].slice(0, HISTORY_LIMIT),
      })
    },

    redo: () => {
      const state = get()
      const next = state.future[0]
      if (!next) return
      const doc = { ...state.doc, ...next, dirty: true }
      set({
        doc,
        ...validSelection(doc, state.activePageId, state.selectedAnnotationId),
        past: [...state.past, snapshot(state.doc)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      })
    },
  }
})

export function selectActivePage(state: EditorState): PageRef | null {
  return (
    state.doc.pages.find((page) => page.id === state.activePageId) ?? state.doc.pages[0] ?? null
  )
}

export function selectPageAnnotations(state: EditorState, pageId: string): Annotation[] {
  return state.doc.annotations.filter((annotation) => annotation.pageId === pageId)
}

export function selectSelectedAnnotation(state: EditorState): Annotation | null {
  if (!state.selectedAnnotationId) return null
  return (
    state.doc.annotations.find((annotation) => annotation.id === state.selectedAnnotationId) ?? null
  )
}
