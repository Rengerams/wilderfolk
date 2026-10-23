import { beforeEach, describe, expect, it } from "vitest"
import { useEditor } from "../src/app/store"
import { presetById } from "../src/pdf/pages"

function reset(count: number): void {
  useEditor.getState().newDocument({
    name: "history",
    size: presetById("a4"),
    orientation: "portrait",
    count,
  })
}

describe("document history", () => {
  beforeEach(() => reset(1))

  it("keeps a page selected after undoing an inserted page", () => {
    const store = useEditor.getState()
    store.insertBlankPage(store.doc.pages[0].id)
    const inserted = useEditor.getState().activePageId
    expect(useEditor.getState().doc.pages).toHaveLength(2)

    useEditor.getState().undo()

    const state = useEditor.getState()
    expect(state.doc.pages).toHaveLength(1)
    expect(state.activePageId).toBe(state.doc.pages[0].id)
    expect(state.activePageId).not.toBe(inserted)
  })

  it("keeps a page selected after redoing and undoing an inserted page", () => {
    const store = useEditor.getState()
    store.insertBlankPage(store.doc.pages[0].id)
    useEditor.getState().undo()
    useEditor.getState().redo()

    const restored = useEditor.getState()
    expect(restored.doc.pages).toHaveLength(2)
    expect(restored.doc.pages.some((page) => page.id === restored.activePageId)).toBe(true)

    useEditor.getState().undo()

    const state = useEditor.getState()
    expect(state.doc.pages).toHaveLength(1)
    expect(state.activePageId).toBe(state.doc.pages[0].id)
  })

  it("keeps a page selected after undoing a duplicated page", () => {
    const store = useEditor.getState()
    store.duplicatePage(store.doc.pages[0].id)
    expect(useEditor.getState().doc.pages).toHaveLength(2)

    useEditor.getState().undo()

    const state = useEditor.getState()
    expect(state.doc.pages).toHaveLength(1)
    expect(state.activePageId).toBe(state.doc.pages[0].id)
  })

  it("drops an object selection the restored document no longer holds", () => {
    const store = useEditor.getState()
    store.addAnnotation({
      id: "ann-history",
      pageId: store.doc.pages[0].id,
      type: "text",
      rect: { x: 0.1, y: 0.1, w: 0.4, h: 0.06 },
      text: "note",
      fontSize: 13,
      color: "#111111",
    })
    expect(useEditor.getState().selectedAnnotationId).toBe("ann-history")

    useEditor.getState().undo()

    const state = useEditor.getState()
    expect(state.doc.annotations).toHaveLength(0)
    expect(state.selectedAnnotationId).toBeNull()
  })
})
