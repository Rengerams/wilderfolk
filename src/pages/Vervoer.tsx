import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Badge,
  Invoer,
  Kaart,
  Knop,
  Laad,
  Melding,
  PaginaKop,
  Select,
  Tabel,
  Veld,
} from "../components/ui"
import { datumNumeriek, tijd } from "../lib/format"
import type { Periode } from "../types"

type VervoerUitje = {
  id: number
  datum: string
  begin_tijd: string | null
  eind_tijd: string | null
  omschrijving: string
  capaciteit: number
  geplaatst: number
  vervoerscapaciteit: number
  chauffeurOntbreekt: boolean
  begeleiderOntbreekt: boolean
  voertuigen: {
    id: number
    naam: string
    kenteken: string | null
    capaciteit: number
    chauffeur_id: number | null
    chauffeur_naam: string | null
    begeleider_id: number | null
    begeleider_naam: string | null
  }[]
}

type VervoerData = {
  periode: Periode
  uitjes: VervoerUitje[]
  voertuigen: { id: number; naam: string; kenteken: string | null; capaciteit: number; actief: boolean }[]
  chauffeurs: { id: number; naam: string }[]
  medewerkers: { id: number; naam: string }[]
}

export function Vervoer() {
  const { mag } = useAuth()
  const [periodes, setPeriodes] = useState<Periode[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [data, setData] = useState<VervoerData | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [keuzes, setKeuzes] = useState<Record<number, { voertuig: string; chauffeur: string; begeleider: string }>>({})
  const [nieuwVoertuig, setNieuwVoertuig] = useState({ naam: "", kenteken: "", capaciteit: "7" })

  const haal = useCallback(async (id: string) => {
    if (!id) return
    setLaden(true)
    try {
      const antwoord = await api<VervoerData>(`/periodes/${id}/vervoer`)
      setData(antwoord)
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
        const voorkeur = antwoord.periodes.find((p) => p.status !== "concept") ?? antwoord.periodes[0]
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
  }, [haal])

  async function koppel(uitjeId: number) {
    const keuze = keuzes[uitjeId]
    if (!keuze?.voertuig) return
    setBezig(true)
    setFout(null)
    try {
      await api(`/periodes/uitje/${uitjeId}/voertuigen`, {
        method: "POST",
        body: JSON.stringify({
          voertuig_id: Number(keuze.voertuig),
          chauffeur_id: keuze.chauffeur ? Number(keuze.chauffeur) : null,
          begeleider_id: keuze.begeleider ? Number(keuze.begeleider) : null,
        }),
      })
      setMelding("Voertuig gekoppeld.")
      setKeuzes({ ...keuzes, [uitjeId]: { voertuig: "", chauffeur: "", begeleider: "" } })
      await haal(periodeId)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function voegVoertuigToe() {
    setBezig(true)
    try {
      await api("/voertuigen", {
        method: "POST",
        body: JSON.stringify({
          naam: nieuwVoertuig.naam,
          kenteken: nieuwVoertuig.kenteken,
          capaciteit: Number(nieuwVoertuig.capaciteit),
        }),
      })
      setNieuwVoertuig({ naam: "", kenteken: "", capaciteit: "7" })
      setMelding("Voertuig toegevoegd.")
      await haal(periodeId)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />
  if (fout && !data) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  const zonderBezetting = data.uitjes.filter((uitje) => uitje.chauffeurOntbreekt || uitje.begeleiderOntbreekt)

  return (
    <div>
      <PaginaKop
        titel="Vervoer"
        uitleg="De capaciteit van een uitje bepaalt automatisch welke busjes nodig zijn. Koppel per voertuig een chauffeur én een begeleider; het systeem waarschuwt als er nog iemand ontbreekt."
        acties={
          <label className="veld" style={{ marginBottom: 0 }}>
            <span className="veld__label">Periode</span>
            <Select
              value={periodeId}
              onChange={(e) => {
                setPeriodeId(e.target.value)
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
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}
      {zonderBezetting.length > 0 && (
        <Melding type="waarschuwing" titel="Chauffeur of begeleider ontbreekt">
          Voor {zonderBezetting.length} uitje(s) is nog geen chauffeur of begeleider gekoppeld:{" "}
          {zonderBezetting.map((uitje) => `${uitje.omschrijving} (${datumNumeriek(uitje.datum)})`).join(", ")}.
          Er gaat altijd een chauffeur én een begeleider mee.
        </Melding>
      )}

      {data.uitjes.length === 0 ? (
        <div className="leeg">
          <p className="leeg__titel">Nog geen uitjes in deze periode</p>
          <p className="leeg__uitleg">Voeg eerst uitjes toe bij het programma. Daarna verschijnt hier het vervoer.</p>
        </div>
      ) : (
        <div className="lijst">
          {data.uitjes.map((uitje) => (
            <Kaart
              key={uitje.id}
              titel={`${uitje.omschrijving} · ${datumNumeriek(uitje.datum)}`}
              uitleg={`${tijd(uitje.begin_tijd, uitje.eind_tijd)} · ${uitje.capaciteit} deelnemers · ${uitje.vervoerscapaciteit} vervoersplekken`}
              acties={
                <>
                  {uitje.vervoerscapaciteit < uitje.capaciteit && (
                    <Badge toon="waarschuwing">te weinig plekken</Badge>
                  )}
                  {uitje.chauffeurOntbreekt && <Badge toon="fout">chauffeur ontbreekt</Badge>}
                  <Link className="knop knop--klein" to={`/uitje/${uitje.id}`}>
                    Deelnemerslijst
                  </Link>
                </>
              }
            >
              {uitje.voertuigen.length === 0 ? (
                <p className="muted">Nog geen voertuig gekoppeld.</p>
              ) : (
                <Tabel kolommen={["Voertuig", "Plekken", "Chauffeur", "Begeleider"]}>
                  {uitje.voertuigen.map((voertuig) => (
                    <tr key={voertuig.id}>
                      <td>
                        {voertuig.naam}
                        {voertuig.kenteken && <div className="klein muted">{voertuig.kenteken}</div>}
                      </td>
                      <td className="getal">{voertuig.capaciteit}</td>
                      <td>{voertuig.chauffeur_naam ?? <Badge toon="waarschuwing">nog niet toegewezen</Badge>}</td>
                      <td>{voertuig.begeleider_naam ?? <Badge toon="waarschuwing">nog niet toegewezen</Badge>}</td>
                    </tr>
                  ))}
                </Tabel>
              )}
              {mag("vervoer", "wijzigen") && (
                <div className="rij marge-boven">
                  <Select
                    value={keuzes[uitje.id]?.voertuig ?? ""}
                    onChange={(e) =>
                      setKeuzes({
                        ...keuzes,
                        [uitje.id]: {
                          voertuig: e.target.value,
                          chauffeur: keuzes[uitje.id]?.chauffeur ?? "",
                          begeleider: keuzes[uitje.id]?.begeleider ?? "",
                        },
                      })
                    }
                    aria-label={`Voertuig voor ${uitje.omschrijving}`}
                  >
                    <option value="">Voertuig kiezen…</option>
                    {data.voertuigen.map((voertuig) => (
                      <option key={voertuig.id} value={voertuig.id}>
                        {voertuig.naam}
                        {voertuig.kenteken ? ` (${voertuig.kenteken})` : ""} · {voertuig.capaciteit} plekken
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={keuzes[uitje.id]?.chauffeur ?? ""}
                    onChange={(e) =>
                      setKeuzes({
                        ...keuzes,
                        [uitje.id]: {
                          voertuig: keuzes[uitje.id]?.voertuig ?? "",
                          chauffeur: e.target.value,
                          begeleider: keuzes[uitje.id]?.begeleider ?? "",
                        },
                      })
                    }
                    aria-label={`Chauffeur voor ${uitje.omschrijving}`}
                  >
                    <option value="">Chauffeur kiezen…</option>
                    {data.chauffeurs.map((chauffeur) => (
                      <option key={chauffeur.id} value={chauffeur.id}>
                        {chauffeur.naam}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={keuzes[uitje.id]?.begeleider ?? ""}
                    onChange={(e) =>
                      setKeuzes({
                        ...keuzes,
                        [uitje.id]: {
                          voertuig: keuzes[uitje.id]?.voertuig ?? "",
                          chauffeur: keuzes[uitje.id]?.chauffeur ?? "",
                          begeleider: e.target.value,
                        },
                      })
                    }
                    aria-label={`Begeleider voor ${uitje.omschrijving}`}
                  >
                    <option value="">Begeleider kiezen…</option>
                    {data.medewerkers.map((medewerker) => (
                      <option key={medewerker.id} value={medewerker.id}>
                        {medewerker.naam}
                      </option>
                    ))}
                  </Select>
                  <Knop
                    onClick={() => void koppel(uitje.id)}
                    disabled={bezig || !keuzes[uitje.id]?.voertuig}
                  >
                    Koppelen
                  </Knop>
                </div>
              )}
            </Kaart>
          ))}
        </div>
      )}

      <Kaart
        titel="Voertuigen"
        uitleg="Busjes en touringcars met hun kenteken en capaciteit. Je noemt een busje zoals je het zelf noemt; het kenteken staat erbij voor de administratie. Een voertuig kan niet dubbel geboekt worden op dezelfde dag."
      >
        <Tabel kolommen={["Voertuig", "Kenteken", "Plekken", "In gebruik"]}>
          {data.voertuigen.map((voertuig) => (
            <tr key={voertuig.id}>
              <td>{voertuig.naam}</td>
              <td className="nu">{voertuig.kenteken ?? <span className="muted">—</span>}</td>
              <td className="getal">{voertuig.capaciteit}</td>
              <td>{voertuig.actief ? "ja" : "nee"}</td>
            </tr>
          ))}
        </Tabel>
        {mag("vervoer", "aanmaken") && (
          <div className="rij marge-boven">
            <Veld label="Naam" hint="Zoals jullie het busje noemen.">
              <Invoer
                value={nieuwVoertuig.naam}
                onChange={(e) => setNieuwVoertuig({ ...nieuwVoertuig, naam: e.target.value })}
                placeholder="Bijvoorbeeld: Busje 3"
              />
            </Veld>
            <Veld label="Kenteken" hint="Met of zonder streepjes.">
              <Invoer
                value={nieuwVoertuig.kenteken}
                onChange={(e) => setNieuwVoertuig({ ...nieuwVoertuig, kenteken: e.target.value })}
                placeholder="Bijvoorbeeld: 12-ABC-3"
              />
            </Veld>
            <Veld label="Plekken">
              <Invoer
                inputMode="numeric"
                value={nieuwVoertuig.capaciteit}
                onChange={(e) => setNieuwVoertuig({ ...nieuwVoertuig, capaciteit: e.target.value })}
              />
            </Veld>
            <Knop onClick={() => void voegVoertuigToe()} disabled={bezig || !nieuwVoertuig.naam.trim()}>
              Voertuig toevoegen
            </Knop>
          </div>
        )}
      </Kaart>
    </div>
  )
}
