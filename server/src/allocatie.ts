/**
 * Eerlijke indeling.
 *
 * Regels, in deze vaste volgorde (zie Programma van eisen, sectie 5 en de Besluiten):
 *  1. Er wordt pas ingedeeld als de periode gesloten is.
 *  2. Een specifieke opgave gaat voor een opgave "alle uitjes".
 *  3. Wie nog geen 2 uitjes heeft gehad (nieuw) krijgt voorrang; de garantie geldt
 *     over de periode en blijft staan tot het tweede uitje.
 *  4. Wie in de laatste 12 maanden vaker meeging, staat achteraan.
 *  5. Wie het langst niet meeging, gaat voor.
 *  6. Bij een gelijke stand beslist een loting met een vaste seed, zodat dezelfde
 *     invoer altijd dezelfde uitkomst geeft en de uitslag later te herleiden is.
 *  7. Een groepje wordt altijd als geheel geplaatst of als geheel op de reservelijst.
 *  8. Wie zich voor alle data van een reeks opgaf, gaat naar de datum met de meeste ruimte.
 *
 * De coördinator houdt altijd het laatste woord; handmatige wijzigingen staan hier los van.
 */

export type AllocatieDeelnemer = {
  id: number
  naam: string
  groepje_id: number | null
  groepje_naam: string | null
  aantal_12m: number
  laatste_deelname: string | null
  totaal_deelnames: number
}

export type AllocatieUitje = {
  id: number
  datum: string
  omschrijving: string
  capaciteit: number
  reeks_id: number | null
}

export type AllocatieOpgave = {
  uitje_id: number
  deelnemer_id: number
  met_groepje: boolean
  reeks_keuze: boolean
}

export type AllocatieGroep = { id: number; naam: string; leden: number[] }

export type IndelingRij = {
  uitje_id: number
  deelnemer_id: number
  status: "geplaatst" | "reserve"
  uitleg: string
  positie: number | null
}

type Eenheid = {
  key: string
  leden: number[]
  groepNaam: string | null
  basis: string
}

function hash(seed: string, sleutel: string): number {
  let h = 2166136261
  const tekst = `${seed}|${sleutel}`
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function datumGetal(datum: string | null): number {
  return datum ? Date.parse(`${datum.slice(0, 10)}T12:00:00Z`) : 0
}

export function berekenIndeling(invoer: {
  uitjes: AllocatieUitje[]
  deelnemers: AllocatieDeelnemer[]
  opgaven: AllocatieOpgave[]
  groepen: AllocatieGroep[]
  seed: string
}): { rijen: IndelingRij[]; samenvatting: string } {
  const { seed } = invoer
  const deelnemerMap = new Map(invoer.deelnemers.map((d) => [d.id, d]))
  const uitjeMap = new Map(invoer.uitjes.map((u) => [u.id, u]))
  const groepMap = new Map(invoer.groepen.map((g) => [g.id, g]))
  const uitjes = [...invoer.uitjes].sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id)

  /** Prioriteit: lager is eerder aan de beurt. */
  const prioriteit = (leden: number[]): number[] => {
    const mensen = leden.map((id) => deelnemerMap.get(id)).filter(Boolean) as AllocatieDeelnemer[]
    if (mensen.length === 0) return [999, 1, 0, 0]
    const gemiddeld = mensen.reduce((som, m) => som + m.aantal_12m, 0) / mensen.length
    const garantie = mensen.some((m) => m.totaal_deelnames < 2) ? 0 : 1
    const laatste = Math.min(...mensen.map((m) => datumGetal(m.laatste_deelname)))
    return [garantie, gemiddeld, laatste, hash(seed, leden.join("-"))]
  }

  const vergelijk = (a: Eenheid, b: Eenheid): number => {
    const pa = prioriteit(a.leden)
    const pb = prioriteit(b.leden)
    for (let i = 0; i < pa.length; i++) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i]
    }
    return a.key.localeCompare(b.key)
  }

  // Eenheden per uitje (specifiek) en per reeks (alle data).
  const specifiek = new Map<number, Map<string, Eenheid>>()
  const flexibel = new Map<string, { eenheid: Eenheid; reeksId: number }>()

  const maakEenheid = (deelnemerId: number, metGroepje: boolean, reeksKeuze: boolean): Eenheid => {
    const deelnemer = deelnemerMap.get(deelnemerId)
    const groep = deelnemer?.groepje_id ? groepMap.get(deelnemer.groepje_id) : undefined
    if (metGroepje && groep && groep.leden.length > 1) {
      return {
        key: `g${groep.id}`,
        leden: [...groep.leden].sort((a, b) => a - b),
        groepNaam: groep.naam,
        basis: `Groepje "${groep.naam}" wordt als geheel geplaatst.`,
      }
    }
    return {
      key: `d${deelnemerId}`,
      leden: [deelnemerId],
      groepNaam: null,
      basis: reeksKeuze
        ? "Opgegeven voor alle data van deze reeks; hier was de meeste ruimte."
        : "Specifiek voor deze datum opgegeven: gaat voor \"alle uitjes\".",
    }
  }

  for (const opgave of invoer.opgaven) {
    const uitje = uitjeMap.get(opgave.uitje_id)
    if (!uitje || !deelnemerMap.has(opgave.deelnemer_id)) continue
    const eenheid = maakEenheid(opgave.deelnemer_id, opgave.met_groepje, opgave.reeks_keuze)
    if (opgave.reeks_keuze && uitje.reeks_id) {
      const sleutel = `${eenheid.key}:${uitje.reeks_id}`
      if (!flexibel.has(sleutel)) {
        flexibel.set(sleutel, {
          eenheid: {
            ...eenheid,
            basis: eenheid.groepNaam
              ? `Groepje "${eenheid.groepNaam}" is opgegeven voor alle data; samen naar de datum met de meeste ruimte.`
              : eenheid.basis,
          },
          reeksId: uitje.reeks_id,
        })
      }
    } else {
      if (!specifiek.has(uitje.id)) specifiek.set(uitje.id, new Map())
      specifiek.get(uitje.id)!.set(eenheid.key, eenheid)
    }
  }

  const plekken = new Map<number, number>()
  for (const uitje of uitjes) plekken.set(uitje.id, uitje.capaciteit)

  const bezetInReeks = new Map<string, number>()
  const reeksSleutel = (deelnemerId: number, reeksId: number | null) =>
    reeksId ? `${deelnemerId}:${reeksId}` : ""

  const rijen: IndelingRij[] = []
  const reserves = new Map<number, { eenheid: Eenheid; uitleg: string }[]>()
  const geplaatstAantal = new Map<number, number>()

  const kanPlaatsen = (eenheid: Eenheid, uitje: AllocatieUitje): boolean => {
    if ((plekken.get(uitje.id) ?? 0) < eenheid.leden.length) return false
    for (const lid of eenheid.leden) {
      const sleutel = reeksSleutel(lid, uitje.reeks_id)
      if (sleutel && bezetInReeks.has(sleutel)) return false
    }
    return true
  }

  const plaats = (eenheid: Eenheid, uitje: AllocatieUitje, extraUitleg: string) => {
    rijen.push({
      uitje_id: uitje.id,
      deelnemer_id: eenheid.leden[0],
      status: "geplaatst",
      uitleg: [eenheid.basis, extraUitleg].filter(Boolean).join(" "),
      positie: null,
    })
    // Groepsleden krijgen ieder een eigen rij, zodat deelnemerslijsten compleet zijn.
    for (const lid of eenheid.leden.slice(1)) {
      rijen.push({
        uitje_id: uitje.id,
        deelnemer_id: lid,
        status: "geplaatst",
        uitleg: eenheid.basis,
        positie: null,
      })
    }
    plekken.set(uitje.id, (plekken.get(uitje.id) ?? 0) - eenheid.leden.length)
    for (const lid of eenheid.leden) {
      const sleutel = reeksSleutel(lid, uitje.reeks_id)
      if (sleutel) bezetInReeks.set(sleutel, uitje.id)
      geplaatstAantal.set(lid, (geplaatstAantal.get(lid) ?? 0) + 1)
    }
  }

  const reserveer = (eenheid: Eenheid, uitje: AllocatieUitje) => {
    if (!reserves.has(uitje.id)) reserves.set(uitje.id, [])
    reserves.get(uitje.id)!.push({ eenheid, uitleg: eenheid.basis })
  }

  const historieZin = (leden: number[]): string => {
    const mensen = leden.map((id) => deelnemerMap.get(id)).filter(Boolean) as AllocatieDeelnemer[]
    if (mensen.length === 0) return ""
    const gemiddeld =
      mensen.reduce((som, m) => som + m.aantal_12m, 0) / mensen.length
    if (mensen.every((m) => m.aantal_12m === 0)) {
      return "Nog niet eerder meegeweest in de afgelopen 12 maanden."
    }
    const aantal = Math.round(gemiddeld * 10) / 10
    return `${aantal.toString().replace(".", ",")}x meegeweest in de laatste 12 maanden.`
  }

  // Ronde 1: specifieke opgaven, per uitje op datum.
  for (const uitje of uitjes) {
    const eenheden = [...(specifiek.get(uitje.id)?.values() ?? [])].sort(vergelijk)
    for (const eenheid of eenheden) {
      if (kanPlaatsen(eenheid, uitje)) {
        plaats(eenheid, uitje, historieZin(eenheid.leden))
      } else {
        reserveer(eenheid, uitje)
      }
    }
  }

  // Ronde 2: "alle uitjes" van een reeks; kies de datum met de meeste ruimte.
  const flexibeleEenheden = [...flexibel.values()].sort((a, b) => vergelijk(a.eenheid, b.eenheid))
  for (const { eenheid, reeksId } of flexibeleEenheden) {
    const kandidaten = uitjes.filter(
      (uitje) => uitje.reeks_id === reeksId && kanPlaatsen(eenheid, uitje),
    )
    if (kandidaten.length > 0) {
      kandidaten.sort(
        (a, b) => (plekken.get(b.id) ?? 0) - (plekken.get(a.id) ?? 0) || a.datum.localeCompare(b.datum),
      )
      plaats(eenheid, kandidaten[0], historieZin(eenheid.leden))
    } else {
      const reeksUitjes = uitjes.filter((uitje) => uitje.reeks_id === reeksId)
      const ruimste = [...reeksUitjes].sort(
        (a, b) => (plekken.get(b.id) ?? 0) - (plekken.get(a.id) ?? 0) || a.datum.localeCompare(b.datum),
      )[0]
      if (ruimste) reserveer(eenheid, ruimste)
    }
  }

  // Ronde 3: garantie van 2 uitjes. Wie nog geen twee uitjes had, krijgt waar mogelijk
  // een extra plek bij een uitje waarvoor die persoon is opgegeven.
  const alleEenheden = new Map<string, Eenheid>()
  for (const perUitje of specifiek.values()) {
    for (const [key, eenheid] of perUitje) if (!alleEenheden.has(key)) alleEenheden.set(key, eenheid)
  }
  for (const { eenheid } of flexibel.values()) {
    if (!alleEenheden.has(eenheid.key)) alleEenheden.set(eenheid.key, eenheid)
  }
  const wensenPerEenheid = new Map<string, number[]>()
  for (const uitje of uitjes) {
    for (const key of specifiek.get(uitje.id)?.keys() ?? []) {
      if (!wensenPerEenheid.has(key)) wensenPerEenheid.set(key, [])
      wensenPerEenheid.get(key)!.push(uitje.id)
    }
  }
  for (const { eenheid, reeksId } of flexibel.values()) {
    if (!wensenPerEenheid.has(eenheid.key)) wensenPerEenheid.set(eenheid.key, [])
    for (const uitje of uitjes) {
      if (uitje.reeks_id === reeksId && !wensenPerEenheid.get(eenheid.key)!.includes(uitje.id)) {
        wensenPerEenheid.get(eenheid.key)!.push(uitje.id)
      }
    }
  }

  const garantieEenheden = [...alleEenheden.values()]
    .filter((eenheid) =>
      eenheid.leden.some((lid) => (deelnemerMap.get(lid)?.totaal_deelnames ?? 0) < 2),
    )
    .sort(vergelijk)

  for (const eenheid of garantieEenheden) {
    for (let ronde = 0; ronde < 2; ronde++) {
      const heeftNogNodig = eenheid.leden.some(
        (lid) =>
          (deelnemerMap.get(lid)?.totaal_deelnames ?? 0) + (geplaatstAantal.get(lid) ?? 0) < 2,
      )
      if (!heeftNogNodig) break
      const wensen = (wensenPerEenheid.get(eenheid.key) ?? [])
        .map((id) => uitjeMap.get(id))
        .filter(Boolean)
        .filter((uitje) => !rijen.some(
          (rij) => rij.uitje_id === uitje!.id && eenheid.leden.includes(rij.deelnemer_id),
        ))
        .filter((uitje) => kanPlaatsen(eenheid, uitje!)) as AllocatieUitje[]
      if (wensen.length === 0) break
      wensen.sort((a, b) => a.datum.localeCompare(b.datum))
      plaats(eenheid, wensen[0], "Aanvulling: nog recht op een tweede uitje.")
    }
  }

  // Reservelijst: volgorde van eerlijkheid, niet van tijdstip van opgave.
  const rijenPerUitje = new Map<number, Set<number>>()
  for (const rij of rijen) {
    if (!rijenPerUitje.has(rij.uitje_id)) rijenPerUitje.set(rij.uitje_id, new Set())
    rijenPerUitje.get(rij.uitje_id)!.add(rij.deelnemer_id)
  }

  // Eén plek per reeks, ook bij de garantie van een tweede uitje: wie al geplaatst
  // is op een datum van de reeks, hoort niet op de reservelijst van een andere datum
  // van diezelfde reeks te staan.
  const geplaatstPerReeks = new Set<string>()
  for (const rij of rijen) {
    if (rij.status !== "geplaatst") continue
    const reeksId = uitjeMap.get(rij.uitje_id)?.reeks_id ?? null
    if (reeksId) geplaatstPerReeks.add(reeksSleutel(rij.deelnemer_id, reeksId))
  }

  for (const uitje of uitjes) {
    const lijst = (reserves.get(uitje.id) ?? []).sort((a, b) => vergelijk(a.eenheid, b.eenheid))
    const kandidaten = lijst.flatMap(({ eenheid, uitleg }) =>
      eenheid.leden
        .filter((lid) => !rijenPerUitje.get(uitje.id)?.has(lid))
        .filter((lid) => {
          const sleutel = reeksSleutel(lid, uitje.reeks_id)
          return !sleutel || !geplaatstPerReeks.has(sleutel)
        })
        .map((lid) => ({ lid, uitleg })),
    )
    const totaalVraag = (rijenPerUitje.get(uitje.id)?.size ?? 0) + kandidaten.length
    kandidaten.forEach(({ lid, uitleg }, index) => {
      const positie = index + 1
      rijen.push({
        uitje_id: uitje.id,
        deelnemer_id: lid,
        status: "reserve",
        uitleg: `${uitleg} Geen plek: ${uitje.capaciteit} plekken en ${totaalVraag} opgaven.`
          + (positie > 1 ? ` Staat ${positie}e op de reservelijst.` : " Staat bovenaan de reservelijst."),
        positie,
      })
    })
  }

  const geplaatst = rijen.filter((rij) => rij.status === "geplaatst").length
  const reserve = rijen.filter((rij) => rij.status === "reserve").length
  const samenvatting =
    `${geplaatst} plaatsingen, ${reserve} op de reservelijst. ` +
    `${uitjes.length} uitjes verdeeld volgens de vaste regels.`
  return { rijen, samenvatting }
}
