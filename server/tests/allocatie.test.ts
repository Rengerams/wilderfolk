/**
 * Tests voor de reeksregel in de indeling: vier data van dezelfde reeks betekenen
 * "het maakt niet uit welke", niet "ik wil vier keer mee".
 *
 * Eén deelnemer krijgt per reeks maximaal één plaatsing en staat niet op de
 * reservelijst van de andere data van diezelfde reeks. Een tweede uitje uit een
 * ándere reeks blijft wel mogelijk (garantie van twee uitjes).
 *
 * Deze test heeft geen database nodig: `berekenIndeling` is pure logica.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { berekenIndeling, type AllocatieDeelnemer, type AllocatieUitje } from "../src/allocatie"

const deelnemer = (id: number, totaal_deelnames: number): AllocatieDeelnemer => ({
  id,
  naam: `Deelnemer ${id}`,
  groepje_id: null,
  groepje_naam: null,
  aantal_12m: totaal_deelnames,
  laatste_deelname: totaal_deelnames ? "2026-01-01" : null,
  totaal_deelnames,
})

const reeks = (reeksId: number, eersteId: number, dagen: string[]): AllocatieUitje[] =>
  dagen.map((datum, index) => ({
    id: eersteId + index,
    datum,
    omschrijving: `Reeks ${reeksId}`,
    capaciteit: 10,
    reeks_id: reeksId,
  }))

describe("reeksregel in de indeling", () => {
  it("plaatst een deelnemer met vier reeksdata maar één keer in die reeks", () => {
    const uitjes = reeks(1, 1, ["2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"])
    const { rijen } = berekenIndeling({
      uitjes,
      deelnemers: [deelnemer(1, 0)],
      opgaven: uitjes.map((uitje) => ({
        uitje_id: uitje.id,
        deelnemer_id: 1,
        met_groepje: false,
        reeks_keuze: true,
      })),
      groepen: [],
      seed: "test",
    })
    const eigen = rijen.filter((rij) => rij.deelnemer_id === 1)
    assert.equal(eigen.filter((rij) => rij.status === "geplaatst").length, 1)
    assert.equal(eigen.filter((rij) => rij.status === "reserve").length, 0)
  })

  it("zet vier los opgegeven data van dezelfde reeks niet op de reservelijst", () => {
    const uitjes = reeks(1, 1, ["2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"])
    const { rijen } = berekenIndeling({
      uitjes,
      deelnemers: [deelnemer(1, 0)],
      opgaven: uitjes.map((uitje) => ({
        uitje_id: uitje.id,
        deelnemer_id: 1,
        met_groepje: false,
        reeks_keuze: false,
      })),
      groepen: [],
      seed: "test",
    })
    const eigen = rijen.filter((rij) => rij.deelnemer_id === 1)
    assert.equal(eigen.filter((rij) => rij.status === "geplaatst").length, 1)
    assert.equal(eigen.filter((rij) => rij.status === "reserve").length, 0)
  })

  it("geeft een tweede uitje uit een andere reeks wel", () => {
    const eersteReeks = reeks(1, 1, ["2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"])
    const tweedeReeks = reeks(2, 11, ["2026-06-02", "2026-06-03"])
    const uitjes = [...eersteReeks, ...tweedeReeks]
    const { rijen } = berekenIndeling({
      uitjes,
      deelnemers: [deelnemer(1, 0)],
      opgaven: uitjes.map((uitje) => ({
        uitje_id: uitje.id,
        deelnemer_id: 1,
        met_groepje: false,
        reeks_keuze: true,
      })),
      groepen: [],
      seed: "test",
    })
    const geplaatst = rijen.filter((rij) => rij.deelnemer_id === 1 && rij.status === "geplaatst")
    assert.equal(geplaatst.length, 2)
    const reeksen = geplaatst.map((rij) => uitjes.find((uitje) => uitje.id === rij.uitje_id)!.reeks_id)
    assert.deepEqual([...new Set(reeksen)].length, 2)
  })
})
