import { describe, expect, it } from "vitest"
import { blankPage } from "../src/pdf/pages"
import { pageNumberLabel, pageNumberStamps } from "../src/pdf/pageStamps"

function a4Pages(count: number) {
  return Array.from({ length: count }, () => blankPage({ width: 595, height: 842 }))
}

describe("page number labels", () => {
  it("formats every style", () => {
    expect(pageNumberLabel("plain", 3, 9)).toBe("3")
    expect(pageNumberLabel("of-total", 3, 9)).toBe("3 / 9")
    expect(pageNumberLabel("page", 3, 9)).toBe("Page 3")
    expect(pageNumberLabel("page-of", 3, 9)).toBe("Page 3 of 9")
  })
})

describe("page number stamps", () => {
  it("stamps only the requested range", () => {
    const pages = a4Pages(4)
    const stamps = pageNumberStamps(pages, {
      position: "bottom-center",
      format: "plain",
      startAt: 1,
      fontSize: 10,
      from: 2,
      to: 3,
    })
    expect(stamps.map((stamp) => stamp.pageId)).toEqual([pages[1].id, pages[2].id])
  })

  it("continues numbering from the start value", () => {
    const pages = a4Pages(3)
    const stamps = pageNumberStamps(pages, {
      position: "top-right",
      format: "plain",
      startAt: 10,
      fontSize: 10,
      from: 1,
      to: 3,
    })
    expect(stamps.map((stamp) => (stamp.type === "text" ? stamp.text : ""))).toEqual(["10", "11", "12"])
  })

  it("clamps a range that runs past the last page", () => {
    const pages = a4Pages(2)
    const stamps = pageNumberStamps(pages, {
      position: "bottom-left",
      format: "plain",
      startAt: 1,
      fontSize: 10,
      from: 1,
      to: 99,
    })
    expect(stamps).toHaveLength(2)
  })

  it("puts top stamps near the top edge and bottom stamps near the bottom edge", () => {
    const pages = a4Pages(1)
    const [top] = pageNumberStamps(pages, {
      position: "top-center",
      format: "plain",
      startAt: 1,
      fontSize: 10,
      from: 1,
      to: 1,
    })
    const [bottom] = pageNumberStamps(pages, {
      position: "bottom-center",
      format: "plain",
      startAt: 1,
      fontSize: 10,
      from: 1,
      to: 1,
    })
    expect(top.type === "text" && top.rect.y).toBeCloseTo(0.05, 2)
    expect(bottom.type === "text" ? bottom.rect.y + bottom.rect.h : 0).toBeCloseTo(0.95, 2)
  })
})
