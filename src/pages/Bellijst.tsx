import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Badge,
  Kaart,
  Knop,
  Laad,
  Melding,
  PaginaKop,
  Select,
  Tabel,
} from "../components/ui"
import { datumNumeriek, volledigeNaam } from "../lib/format"
import type { Periode } from "../types"

type BelTaak = {
  id: number
  periode_id: number
  uitje_id: number | null
  deelnemer_id: number
  type: string
  boodschap: string
  status: string
  telefoonnummer: string | null
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  contactvoorkeur: string
  omschrijving: string | null
  datum: string | null
  begin_tijd: string | null
}

const TYPE_TEKST: Record<string, string> = {
  plaatsing: "Plaatsing",
  reserve: "Reservelijst",
  vrijgekomen: "Plek vrijgekomen",
  niet_ingedeeld: "Geen plek",
  annulering: "Annulering",
}

export function Bellijst() {
  const { mag } = useAuth()
  const [zoekParams] = useSearchParams()
  const [periodes, setPeriodes] = useState<Periode[]>([])
  const [periodeId, setPeriodeId] = useState(zoekParams.get("periode") ?? "")
  const [rijen, setRijen] = useState<BelTaak[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [waarschuwing, setWaarschuwing] = useState<string | null>(null)
  const [volgende, setVolgende] = useState<{ voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null; positie: number | null } | null>(null)
  const [filter, setFilter] = useState("te_bellen")
  const [bezig, setBezig] = useState(false)

  const haal = useCallback(async (id: string) => {
    if (!id) return
    setLaden(true)
    try {
      const antwoord = await api<{ periode: Periode; rijen: BelTaak[] }>(`/bellijst?periode_id=${id}`)
      setRijen(antwoord.rijen)
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    async function start() {
      try {
        const antwoord = await api<{ periodes: Periode[] }>("/periodes")
        setPeriodes(antwoord.periodes)
        const voorkeur =
          antwoord.periodes.find((p) => String(p.id) === periodeId) ??
          antwoord.periodes.find((p) => p.status === "gesloten") ??
          antwoord.periodes[0]
        if (voorkeur) {
          setPeriodeId(String(voorkeur.id))
          await haal(String(voorkeur.id))
        }
      } catch (e) {
        setFout(foutTekst(e))
        setLaden(false)
      }
    }
    void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function zetStatus(rij: BelTaak, status: string) {
    setBezig(true)
    try {
      await api(`/bellijst/${rij.id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      setMelding(`${volledigeNaam(rij)} staat op "${status === "gebeld" ? "gebeld" : "niet bereikt"}".`)
      await haal(periodeId)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function reserveUitkomst(rij: BelTaak, uitkomst: "komt_mee" | "kan_niet" | "niet_bereikt") {
    setBezig(true)
    setFout(null)
    setWaarschuwing(null)
    setVolgende(null)
    try {
      const antwoord = await api<{
        bericht: string
        waarschuwing: string | null
        volgende: { voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null; positie: number | null } | null
      }>(`/bellijst/${rij.id}/reserve-uitkomst`, {
        method: "POST",
        body: JSON.stringify({ uitkomst }),
      })
      setMelding(antwoord.bericht)
      setWaarschuwing(antwoord.waarschuwing)
      setVolgende(antwoord.volgende)
      await haal(periodeId)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />

  const zichtbaar = filter === "alles" ? rijen : rijen.filter((rij) => rij.status === filter)
  const teBellen = rijen.filter((rij) => rij.status === "te_bellen").length

  return (
    <div>
      <PaginaKop
        titel="Bellijst"
        stap="Bel de bovenste persoon en zet meteen het resultaat erbij."
        uitleg="De meeste deelnemers worden gebeld. Werk de lijst van boven naar beneden af; na een afzegging komt de volgende reservist vanzelf bovenaan."
        acties={
          <>
            <label className="veld" style={{ marginBottom: 0 }}>
              <span className="veld__label">Periode</span>
              <Select
                value={periodeId}
                onChange={(e) => {
                  setPeriodeId(e.target.value)
                  setMelding(null)
                  setVolgende(null)
                  void haal(e.target.value)
                }}
              >
                {periodes.map((periode) => (
                  <option key={periode.id} value={periode.id}>
                    {periode.naam}
                  </option>
                ))}
              </Select>
            </label>
            <Link className="knop" to={`/indeling/${periodeId}`}>
              Naar de indeling
            </Link>
          </>
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}
      {waarschuwing && <Melding type="waarschuwing">{waarschuwing}</Melding>}
      {volgende && (
        <Melding type="info" titel="Volgende reservist staat bovenaan">
          <p>
            {volledigeNaam(volgende)}
            {volgende.positie ? ` (${volgende.positie}e plek)` : ""} ·{" "}
            {volgende.telefoon ? <a href={`tel:${volgende.telefoon}`}>{volgende.telefoon}</a> : "geen telefoonnummer"}
          </p>
        </Melding>
      )}

      <div className="filters">
        <label className="veld">
          <span className="veld__label">Tonen</span>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="te_bellen">Nog te bellen ({teBellen})</option>
            <option value="gebeld">Gebeld</option>
            <option value="niet_bereikt">Niet bereikt</option>
            <option value="alles">Alles</option>
          </Select>
        </label>
      </div>

      {zichtbaar.length === 0 ? (
        <div className="leeg">
          <p className="leeg__titel">Niets te bellen</p>
          <p className="leeg__uitleg">
            {rijen.length === 0
              ? "Er is nog geen bellijst. Bevestig eerst de indeling bij het onderdeel Indeling."
              : "Alle bellijst-taken met deze status zijn afgewerkt. Mooi werk."}
          </p>
        </div>
      ) : (
        <div className="lijst">
          {zichtbaar.map((rij) => (
            <Kaart key={rij.id}>
              <div className="lijst-item__kop">
                <div>
                  <h2 style={{ marginBottom: "0.2rem" }}>{volledigeNaam(rij)}</h2>
                  <div className="klein muted">
                    {rij.telefoonnummer ? (
                      <a href={`tel:${rij.telefoonnummer}`}>{rij.telefoonnummer}</a>
                    ) : (
                      "Geen telefoonnummer bekend"
                    )}
                    {rij.omschrijving && ` · ${rij.omschrijving}`}
                    {rij.datum && ` op ${datumNumeriek(rij.datum)}`}
                  </div>
                </div>
                <div className="rij">
                  <Badge
                    toon={
                      rij.type === "annulering"
                        ? "fout"
                        : rij.type === "vrijgekomen"
                          ? "goed"
                          : rij.type === "reserve"
                            ? "waarschuwing"
                            : "info"
                    }
                  >
                    {TYPE_TEKST[rij.type] ?? rij.type}
                  </Badge>
                  <Badge toon={rij.status === "gebeld" ? "goed" : rij.status === "niet_bereikt" ? "waarschuwing" : "neutraal"}>
                    {rij.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
              <p style={{ marginTop: "0.6rem" }}>
                <strong>Boodschap om door te geven:</strong> {rij.boodschap}
              </p>
              {mag("reservelijst", "wijzigen") && (
                <div className="rij marge-boven">
                  {rij.type === "reserve" || rij.type === "vrijgekomen" ? (
                    <>
                      <Knop variant="primair" onClick={() => void reserveUitkomst(rij, "komt_mee")} disabled={bezig}>
                        Komt mee
                      </Knop>
                      <Knop onClick={() => void reserveUitkomst(rij, "kan_niet")} disabled={bezig}>
                        Kan niet
                      </Knop>
                      <Knop onClick={() => void reserveUitkomst(rij, "niet_bereikt")} disabled={bezig}>
                        Niet bereikt
                      </Knop>
                    </>
                  ) : (
                    <>
                      {rij.status !== "gebeld" && (
                        <Knop variant="primair" onClick={() => void zetStatus(rij, "gebeld")} disabled={bezig}>
                          Gebeld
                        </Knop>
                      )}
                      {rij.status !== "niet_bereikt" && (
                        <Knop onClick={() => void zetStatus(rij, "niet_bereikt")} disabled={bezig}>
                          Niet bereikt
                        </Knop>
                      )}
                      {rij.status !== "te_bellen" && (
                        <Knop variant="rustig" onClick={() => void zetStatus(rij, "te_bellen")} disabled={bezig}>
                          Toch nog bellen
                        </Knop>
                      )}
                    </>
                  )}
                </div>
              )}
            </Kaart>
          ))}
        </div>
      )}

      {rijen.length > 0 && (
        <Kaart titel="Samenvatting" uitleg="Zo zie je in één oogopslag hoe ver de bellijst is.">
          <Tabel kolommen={["Soort", "Aantal"]}>
            {(["plaatsing", "reserve", "vrijgekomen", "niet_ingedeeld", "annulering"] as const).map((type) => (
              <tr key={type}>
                <td>{TYPE_TEKST[type]}</td>
                <td className="getal">{rijen.filter((rij) => rij.type === type).length}</td>
              </tr>
            ))}
          </Tabel>
        </Kaart>
      )}
    </div>
  )
}
