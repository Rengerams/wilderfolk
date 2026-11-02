import { Link } from "react-router-dom"
import type { Uitje } from "../types"
import { datumKort, tijd } from "../lib/format"

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
]

const DAGKOPPEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]

function maandSleutel(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}`
}

function isoDag(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`
}

/** Alle maanden tussen twee datums, in volgorde. */
function maandenTussen(start: string, eind: string): Date[] {
  const eerste = new Date(`${start.slice(0, 10)}T12:00:00`)
  const laatste = new Date(`${eind.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(eerste.getTime()) || Number.isNaN(laatste.getTime())) return []
  const maanden: Date[] = []
  const cursor = new Date(eerste.getFullYear(), eerste.getMonth(), 1, 12)
  while (cursor <= laatste && maanden.length < 24) {
    maanden.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return maanden
}

/**
 * Kalenderweergave van het programma (eis 3.7). Elke maand uit de periode wordt
 * een eigen tabel; uitjes zijn aanklikbaar en tonen tijd en omschrijving.
 */
export function ProgrammaKalender({
  uitjes,
  start,
  eind,
}: {
  uitjes: Uitje[]
  start: string
  eind: string
}) {
  const perDag = new Map<string, Uitje[]>()
  for (const uitje of uitjes) {
    const sleutel = uitje.datum.slice(0, 10)
    perDag.set(sleutel, [...(perDag.get(sleutel) ?? []), uitje])
  }

  const vandaag = isoDag(new Date())
  const maanden = maandenTussen(start, eind)

  if (maanden.length === 0) {
    return <p className="muted">De periode heeft nog geen geldige datums.</p>
  }

  return (
    <div className="kalender">
      {maanden.map((maand) => {
        const jaar = maand.getFullYear()
        const maandIndex = maand.getMonth()
        const aantalDagen = new Date(jaar, maandIndex + 1, 0).getDate()
        const eersteWeekdag = (new Date(jaar, maandIndex, 1).getDay() + 6) % 7
        const maandUitjes = uitjes
          .filter((uitje) => uitje.datum.slice(0, 7) === maandSleutel(maand))
          .sort((a, b) => a.datum.localeCompare(b.datum) || (a.begin_tijd ?? "").localeCompare(b.begin_tijd ?? ""))
        const cellen: (number | null)[] = [
          ...Array.from({ length: eersteWeekdag }, () => null),
          ...Array.from({ length: aantalDagen }, (_, index) => index + 1),
        ]
        while (cellen.length % 7 !== 0) cellen.push(null)

        return (
          <section className="kalender__maand" key={maandSleutel(maand)} aria-label={`${MAANDEN[maandIndex]} ${jaar}`}>
            <h3 className="kalender__titel">
              {MAANDEN[maandIndex]} <span className="muted">{jaar}</span>
            </h3>
            <table className="kalender__tabel">
              <thead>
                <tr>
                  {DAGKOPPEN.map((dag) => (
                    <th key={dag} scope="col">
                      {dag}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: cellen.length / 7 }, (_, week) => (
                  <tr key={week}>
                    {cellen.slice(week * 7, week * 7 + 7).map((dag, index) => {
                      if (!dag) return <td key={index} className="kalender__leeg" />
                      const datum = `${jaar}-${String(maandIndex + 1).padStart(2, "0")}-${String(dag).padStart(2, "0")}`
                      const dagUitjes = perDag.get(datum) ?? []
                      return (
                        <td key={index} className={`kalender__dag${datum === vandaag ? " is-vandaag" : ""}`}>
                          <span className="kalender__datum">{dag}</span>
                          {dagUitjes.map((uitje) => (
                            <Link
                              key={uitje.id}
                              to={`/uitje/${uitje.id}`}
                              className={`kalender__uitje${uitje.status === "geannuleerd" ? " is-geannuleerd" : ""}`}
                              title={`${uitje.omschrijving}${uitje.extra_kosten ? ` · ${uitje.extra_kosten}` : ""}`}
                            >
                              <span className="kalender__tijd">{tijd(uitje.begin_tijd, uitje.eind_tijd)}</span>
                              <span className="kalender__naam">{uitje.omschrijving}</span>
                            </Link>
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Op een telefoon past een weekrooster niet: dan een lijst per dag. */}
            <ul className="kalender__lijst">
              {maandUitjes.map((uitje) => (
                <li key={uitje.id}>
                  <span className="kalender__lijst-datum">{datumKort(uitje.datum)}</span>
                  <Link
                    to={`/uitje/${uitje.id}`}
                    className={`kalender__uitje${uitje.status === "geannuleerd" ? " is-geannuleerd" : ""}`}
                  >
                    <span className="kalender__tijd">{tijd(uitje.begin_tijd, uitje.eind_tijd)}</span>
                    <span className="kalender__naam">{uitje.omschrijving}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
