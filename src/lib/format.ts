const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
]
const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"]

export function datumLang(datum: string | null | undefined): string {
  if (!datum) return ""
  const d = new Date(`${datum.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return datum
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`
}

export function datumKort(datum: string | null | undefined): string {
  if (!datum) return ""
  const d = new Date(`${datum.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return datum
  return `${d.getDate()} ${MAANDEN[d.getMonth()].slice(0, 3)}`
}

export function datumNumeriek(datum: string | null | undefined): string {
  if (!datum) return ""
  const d = new Date(`${datum.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return datum
  return d.toLocaleDateString("nl-NL")
}

export function tijd(begin: string | null | undefined, eind: string | null | undefined): string {
  return [begin?.slice(0, 5), eind?.slice(0, 5)].filter(Boolean).join(" – ")
}

export function euro(bedrag: number | string | null | undefined): string {
  const getal = typeof bedrag === "string" ? Number.parseFloat(bedrag) : (bedrag ?? 0)
  return `€ ${(Number.isFinite(getal) ? getal : 0).toFixed(2).replace(".", ",")}`
}

export function volledigeNaam(persoon: {
  voornaam: string
  tussenvoegsel?: string | null
  achternaam: string
}): string {
  return [persoon.voornaam, persoon.tussenvoegsel, persoon.achternaam].filter(Boolean).join(" ")
}

export function vandaagIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function maandOpties(): { waarde: string; label: string }[] {
  return MAANDEN.map((naam, index) => {
    const nu = new Date()
    const jaar = index > nu.getMonth() ? nu.getFullYear() - 1 : nu.getFullYear()
    return { waarde: `${jaar}-${String(index + 1).padStart(2, "0")}`, label: `${naam} ${jaar}` }
  }).reverse()
}
