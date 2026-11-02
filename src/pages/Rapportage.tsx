import { useCallback, useEffect, useState } from "react"
import { api, download, foutTekst } from "../api"
import { useAuth } from "../auth"
import { Badge, Kaart, Knop, Laad, Melding, PaginaKop, Select, Stat, Tabel, Veld } from "../components/ui"
import { datumNumeriek, euro } from "../lib/format"

type Periode = { id: number; naam: string; start_op: string; eind_op: string; status: string }

type UitjeRij = {
  id: number
  datum: string
  omschrijving: string
  capaciteit: number
  status: string
  opgaven: number
  aanwezig: number
  afwezig: number
}

type RapportageData = {
  periodes: Periode[]
  periode: Periode | null
  cijfers: { actieve_deelnemers: number; gestopte_deelnemers: number; nieuwe_deelnemers: number } | null
  uitjes: UitjeRij[]
  statussen: { status: string; aantal: number }[]
  topDeelnemers: { naam: string; keer: number }[]
  declaraties: { status: string; aantal: number; bedrag: number }[] | null
  kas: { afsluitingen: number; verwacht: number; geteld: number; verschil: number } | null
}

const STATUS_LABEL: Record<string, string> = {
  actief: "Actief",
  gepauzeerd: "Tijdelijk gepauzeerd",
  gestopt: "Gestopt",
  ingediend: "Ingediend",
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
  uitbetaald: "Uitbetaald",
}

function percentage(deel: number, totaal: number): number {
  return totaal > 0 ? Math.round((deel / totaal) * 100) : 0
}

export function Rapportage() {
  const { moduleAan } = useAuth()
  const [data, setData] = useState<RapportageData | null>(null)
  const [periodeId, setPeriodeId] = useState("")
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)

  const haal = useCallback(async (gekozen: string) => {
    setLaden(true)
    setFout(null)
    try {
      const antwoord = await api<RapportageData>(`/rapportage${gekozen ? `?periode=${gekozen}` : ""}`)
      setData(antwoord)
      setPeriodeId(antwoord.periode ? String(antwoord.periode.id) : "")
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    void haal("")
  }, [haal])

  if (laden && !data) return <Laad tekst="Rapportage wordt berekend…" />
  if (fout) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  if (!data.periode || !data.cijfers) {
    return (
      <div>
        <PaginaKop titel="Rapportage" uitleg="De cijfers van een periode op één scherm." />
        <Melding type="info">Er is nog geen periode om over te rapporteren. Maak eerst een periode aan bij Programma.</Melding>
      </div>
    )
  }

  const telbaar = data.uitjes.filter((uitje) => uitje.status !== "geannuleerd")
  const gemiddeldeBezetting =
    telbaar.length > 0
      ? Math.round(
          telbaar.reduce((som, uitje) => som + percentage(uitje.opgaven, uitje.capaciteit), 0) / telbaar.length,
        )
      : 0
  const aanwezig = telbaar.reduce((som, uitje) => som + uitje.aanwezig, 0)
  const afwezig = telbaar.reduce((som, uitje) => som + uitje.afwezig, 0)

  return (
    <div>
      <PaginaKop
        titel="Rapportage"
        uitleg="Kies een periode en zie in één oogopslag hoe de uitjes, de deelnemers en het geld ervoor staan."
        acties={
          <Knop onClick={() => void download(`/rapportage/export?periode=${periodeId}`, "rapportage.csv")}>
            Exporteren als CSV
          </Knop>
        }
      />

      <Kaart>
        <div className="filters">
          <Veld label="Periode">
            <Select
              value={periodeId}
              onChange={(e) => {
                setPeriodeId(e.target.value)
                void haal(e.target.value)
              }}
            >
              {data.periodes.map((periode) => (
                <option key={periode.id} value={periode.id}>
                  {periode.naam} ({datumNumeriek(periode.start_op)} – {datumNumeriek(periode.eind_op)})
                </option>
              ))}
            </Select>
          </Veld>
        </div>

        <div className="kpi-grid">
          <Stat icoon="deelnemers" waarde={data.cijfers.actieve_deelnemers} label="actieve deelnemers" toon="rood" />
          <Stat icoon="programma" waarde={telbaar.length} label="uitjes in deze periode" toon="blauw" />
          <Stat icoon="indeling" waarde={`${gemiddeldeBezetting}%`} label="gemiddelde bezetting" toon="groen" />
          <Stat icoon="bellijst" waarde={percentage(aanwezig, aanwezig + afwezig)} label="procent komen opdagen" toon="amber" />
        </div>
      </Kaart>

      <Kaart
        titel="Per uitje"
        uitleg="Opgaven zijn de mensen die zich hebben aangemeld. Aanwezig wordt bijgehouden als het uitje is afgerond."
      >
        {data.uitjes.length === 0 ? (
          <p className="muted">In deze periode staan nog geen uitjes.</p>
        ) : (
          <Tabel
            kolommen={[
              "Datum",
              "Uitje",
              { tekst: "Opgaven", getal: true },
              { tekst: "Aanwezig", getal: true },
              { tekst: "Afwezig", getal: true },
              { tekst: "Bezetting", getal: true },
            ]}
          >
            {data.uitjes.map((uitje) => (
              <tr key={uitje.id}>
                <td className="nu">{datumNumeriek(uitje.datum)}</td>
                <td>
                  {uitje.omschrijving}
                  {uitje.status === "geannuleerd" && <> <Badge toon="fout">Geannuleerd</Badge></>}
                </td>
                <td className="getal">{uitje.opgaven}</td>
                <td className="getal">{uitje.aanwezig}</td>
                <td className="getal">{uitje.afwezig}</td>
                <td className="getal">{percentage(uitje.opgaven, uitje.capaciteit)}%</td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>

      <div className="grid-2">
        <Kaart titel="Deelnemers" uitleg={`${data.cijfers.nieuwe_deelnemers} nieuwe aanmeldingen in deze periode.`}>
          <Tabel kolommen={["Status", { tekst: "Aantal", getal: true }]}>
            {data.statussen.map((rij) => (
              <tr key={rij.status}>
                <td>{STATUS_LABEL[rij.status] ?? rij.status}</td>
                <td className="getal">{rij.aantal}</td>
              </tr>
            ))}
          </Tabel>
        </Kaart>

        <Kaart titel="Meest meegeweest" uitleg="Deelnemers die in deze periode het vaakst aanwezig waren.">
          {data.topDeelnemers.length === 0 ? (
            <p className="muted">Nog geen aanwezigheid geregistreerd.</p>
          ) : (
            <Tabel kolommen={["Deelnemer", { tekst: "Keer", getal: true }]}>
              {data.topDeelnemers.map((persoon) => (
                <tr key={persoon.naam}>
                  <td>{persoon.naam}</td>
                  <td className="getal">{persoon.keer}</td>
                </tr>
              ))}
            </Tabel>
          )}
        </Kaart>
      </div>

      {(data.declaraties || data.kas) && (
        <Kaart titel="Geld" uitleg="Declaraties en kas van deze periode.">
          <div className="grid-2">
            {moduleAan("chauffeurskosten") && data.declaraties && (
              <div>
                <h3>Declaraties</h3>
                <Tabel kolommen={["Status", { tekst: "Aantal", getal: true }, { tekst: "Bedrag", getal: true }]}>
                  {data.declaraties.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">Geen declaraties in deze periode.</td>
                    </tr>
                  ) : (
                    data.declaraties.map((rij) => (
                      <tr key={rij.status}>
                        <td>{STATUS_LABEL[rij.status] ?? rij.status}</td>
                        <td className="getal">{rij.aantal}</td>
                        <td className="getal">{euro(rij.bedrag)}</td>
                      </tr>
                    ))
                  )}
                </Tabel>
              </div>
            )}

            {moduleAan("kas") && data.kas && (
              <div>
                <h3>Kas</h3>
                <Tabel kolommen={["", { tekst: "Bedrag", getal: true }]}>
                  <tr>
                    <td>Afgesloten uitjes</td>
                    <td className="getal">{data.kas.afsluitingen}</td>
                  </tr>
                  <tr>
                    <td>Verwacht</td>
                    <td className="getal">{euro(data.kas.verwacht)}</td>
                  </tr>
                  <tr>
                    <td>Geteld</td>
                    <td className="getal">{euro(data.kas.geteld)}</td>
                  </tr>
                  <tr>
                    <td>Verschil</td>
                    <td className="getal">{euro(data.kas.verschil)}</td>
                  </tr>
                </Tabel>
              </div>
            )}
          </div>
        </Kaart>
      )}
    </div>
  )
}
