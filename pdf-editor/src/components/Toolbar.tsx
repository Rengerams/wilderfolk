import {
  Camera,
  Copy,
  CopyPlus,
  Crop,
  FileDown,
  FilePlus2,
  FolderOpen,
  Highlighter,
  ImagePlus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Pen,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  ScanText,
  Signature,
  Square,
  Stamp,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type { Tool } from "../types"
import { IMPORT_ACCEPT, pickFiles } from "../app/files"
import { useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"
import { useT } from "../i18n"

const TOOLS: { id: Tool; label: string; hint: string; Icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", hint: "Select and move objects", Icon: MousePointer2 },
  { id: "text", label: "Text", hint: "Click the page to add text", Icon: Type },
  { id: "highlight", label: "Highlight", hint: "Drag over text to highlight it", Icon: Highlighter },
  { id: "shape", label: "Rectangle", hint: "Drag to draw a rectangle", Icon: Square },
  { id: "ink", label: "Draw", hint: "Draw freehand on the page", Icon: Pen },
  { id: "image", label: "Image", hint: "Click the page to place a picture", Icon: ImagePlus },
  { id: "region", label: "Copy picture", hint: "Drag around a picture to copy it out", Icon: Crop },
]

export function Toolbar() {
  const t = useT()
  const commands = useCommands()
  const tool = useEditor((state) => state.tool)
  const setTool = useEditor((state) => state.setTool)
  const zoom = useEditor((state) => state.zoom)
  const fitMode = useEditor((state) => state.fitMode)
  const showThumbnails = useEditor((state) => state.showThumbnails)
  const showInspector = useEditor((state) => state.showInspector)
  const toggleThumbnails = useEditor((state) => state.toggleThumbnails)
  const toggleInspector = useEditor((state) => state.toggleInspector)
  const pageCount = useEditor((state) => state.doc.pages.length)
  const canUndo = useEditor((state) => state.past.length > 0)
  const canRedo = useEditor((state) => state.future.length > 0)

  const openFilePicker = async () => {
    const files = await pickFiles(IMPORT_ACCEPT)
    if (files) await commands.openFiles(files)
  }

  const addImage = async () => {
    const files = await pickFiles("image/png,image/jpeg", false)
    if (files?.[0]) await commands.insertImage(files[0])
  }

  return (
    <div className="toolbar" role="toolbar" aria-label={t("Editor tools")}>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={commands.newDocument}
        title={t("New document")}
      >
        <FilePlus2 size={16} /> {t("New")}
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => void openFilePicker()}
        title={t("Open a PDF file")}
      >
        <FolderOpen size={16} /> {t("Open")}
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => void commands.save()}
        disabled={pageCount === 0}
        title={t("Save to the library")}
      >
        <Save size={16} /> {t("Save")}
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => void commands.saveCopy()}
        disabled={pageCount === 0}
        title={t("Save a separate copy of the PDF")}
      >
        <Copy size={16} /> {t("Save a copy")}
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => useEditor.getState().openDialog("export")}
        disabled={pageCount === 0}
        title={t("Export to another format")}
      >
        <FileDown size={16} /> {t("Export")}
      </button>

      <span className="toolbar-separator" />

      {TOOLS.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          type="button"
          className="icon-btn"
          aria-pressed={tool === id}
          aria-label={t(label)}
          title={t(hint)}
          onClick={() => {
            if (id === "image") {
              void addImage()
              return
            }
            setTool(id)
          }}
        >
          <Icon size={16} />
        </button>
      ))}

      <span className="toolbar-separator" />

      <button
        type="button"
        className="icon-btn"
        onClick={commands.undo}
        disabled={!canUndo}
        aria-label={t("Undo")}
        title={t("Undo (Ctrl+Z)")}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={commands.redo}
        disabled={!canRedo}
        aria-label={t("Redo")}
        title={t("Redo (Ctrl+Y)")}
      >
        <Redo2 size={16} />
      </button>

      <span className="toolbar-separator" />

      <button
        type="button"
        className="icon-btn"
        onClick={() => commands.rotateActive(-90)}
        disabled={pageCount === 0}
        aria-label={t("Rotate page left")}
        title={t("Rotate page left")}
      >
        <RotateCcw size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => commands.rotateActive(90)}
        disabled={pageCount === 0}
        aria-label={t("Rotate page right")}
        title={t("Rotate page right")}
      >
        <RotateCw size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={commands.duplicateActive}
        disabled={pageCount === 0}
        aria-label={t("Duplicate page")}
        title={t("Duplicate page")}
      >
        <CopyPlus size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={commands.insertBlank}
        aria-label={t("Insert blank page")}
        title={t("Insert blank page")}
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={commands.deleteActive}
        disabled={pageCount === 0}
        aria-label={t("Delete page")}
        title={t("Delete page")}
      >
        <Trash2 size={16} />
      </button>

      <span className="toolbar-separator" />

      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => useEditor.getState().openDialog("scan")}
        title={t("Scan pages from a scanner or camera")}
      >
        <Camera size={16} /> {t("Scan")}
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={commands.runOcr}
        disabled={pageCount === 0}
        title={t("Recognize text on this document")}
      >
        <ScanText size={16} /> OCR
      </button>

      <span className="toolbar-separator" />

      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => useEditor.getState().openDialog("signature")}
        disabled={pageCount === 0}
        title={t("Add your signature")}
      >
        <Signature size={16} /> {t("Sign")}
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => useEditor.getState().openDialog("stamp")}
        disabled={pageCount === 0}
        title={t("Add a stamp")}
      >
        <Stamp size={16} /> {t("Stamp")}
      </button>

      <span className="toolbar-separator" />

      <div className="toolbar-zoom">
        <button
          type="button"
          className="icon-btn"
          onClick={commands.zoomOut}
          aria-label={t("Zoom out")}
          title={t("Zoom out")}
        >
          <ZoomOut size={16} />
        </button>
        <span className="zoom-label">
          {fitMode === "custom"
            ? `${Math.round(zoom * 100)}%`
            : fitMode === "page"
              ? t("Fit page")
              : t("Fit width")}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={commands.zoomIn}
          aria-label={t("Zoom in")}
          title={t("Zoom in")}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={commands.fitPage}
          title={t("Fit the page in the window")}
        >
          {t("Fit page")}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={commands.fitWidth}
          title={t("Fit the page width")}
        >
          {t("Fit width")}
        </button>
      </div>

      <span className="toolbar-separator" />

      <button
        type="button"
        className="icon-btn"
        aria-pressed={showThumbnails}
        onClick={toggleThumbnails}
        aria-label={t("Show page thumbnails")}
        title={t("Show page thumbnails")}
      >
        <PanelLeft size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-pressed={showInspector}
        onClick={toggleInspector}
        aria-label={t("Show properties panel")}
        title={t("Show properties panel")}
      >
        <PanelRight size={16} />
      </button>
    </div>
  )
}
