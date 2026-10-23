/** Shared document model for the editor. Coordinates are normalized (0..1) in unrotated page space. */

export type Rotation = 0 | 90 | 180 | 270
export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }
export type PageSize = { width: number; height: number }

/** `rotation` is the user's rotation; a source page keeps the rotation it arrived with. */
export type PageRef = { id: string; width: number; height: number; rotation: Rotation } & (
  | { kind: "source"; srcIndex: number; authoredRotation: Rotation }
  | { kind: "blank" }
)

export type TextAnnotation = {
  id: string
  pageId: string
  type: "text"
  rect: Rect
  text: string
  fontSize: number
  color: string
}

export type HighlightAnnotation = {
  id: string
  pageId: string
  type: "highlight"
  rect: Rect
  color: string
}

/** `fillOpacity` 1 makes an opaque patch, which is how replaced text is covered up. */
export type ShapeAnnotation = {
  id: string
  pageId: string
  type: "shape"
  rect: Rect
  stroke: string
  fill: string | null
  fillOpacity?: number
  lineWidth: number
}

export type InkAnnotation = {
  id: string
  pageId: string
  type: "ink"
  points: Point[]
  color: string
  lineWidth: number
}

export type ImageAnnotation = {
  id: string
  pageId: string
  type: "image"
  rect: Rect
  dataUrl: string
  mime: "image/png" | "image/jpeg"
}

export type Annotation =
  | TextAnnotation
  | HighlightAnnotation
  | ShapeAnnotation
  | InkAnnotation
  | ImageAnnotation

export type AnnotationType = Annotation["type"]

/** One recognized text line. `rect` keeps its position so the searchable layer can be placed on save. */
export type OcrLine = { id: string; text: string; rect: Rect; confidence: number }

export type OcrLayer = {
  pageId: string
  language: string
  lines: OcrLine[]
  confidence: number
  applied: boolean
}

export type DocMetadata = {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  creationDate: string
  modificationDate: string
}

/** Bytes of an opened PDF file. Kept out of undo history. */
export type DocumentSource = { name: string; bytes: Uint8Array } | null

export type DocState = {
  id: string
  name: string
  source: DocumentSource
  pages: PageRef[]
  annotations: Annotation[]
  ocr: OcrLayer[]
  metadata: DocMetadata
  dirty: boolean
  savedAt: string | null
}

export type DocSnapshot = Pick<
  DocState,
  "name" | "pages" | "annotations" | "ocr" | "metadata"
>

export type Tool = "select" | "text" | "highlight" | "shape" | "ink" | "image" | "region"

export type DialogKind =
  | "about"
  | "new"
  | "open"
  | "metadata"
  | "ocr"
  | "settings"
  | "export"
  | "shortcuts"
  | "exit"
  | "closed"
  | "scan"
  | "find"
  | "form"
  | null

export type ThemeName = "light" | "dark"

export type FitMode = "custom" | "page" | "width"

export type StoredDocMeta = {
  id: string
  name: string
  size: number
  updatedAt: string
  pages: number
  encrypted: boolean
}
