import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
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
  Tekstvak,
  Veld,
} from "../components/ui"
import { datumKort, datumLang, datumNumeriek, euro, tijd, volledigeNaam } from "../lib/format"
import type { Deelnemer, Periode } from "../types"

type Overzicht = {
  periode: Periode
  uitjes: {
    id: number
    datum: string
    begin_tijd: string | null
    eind_tijd: string | null
    omschrijving: string
    prijs: number
    extra_kosten: string | null
    labels: string[]
    capaciteit: number
    geschiktheid: string | null
    reeks_id: number | null
    aantal_opgaven: number
  }[]
  open: boolean
  vandaag: string
}

type DeelnemerOpgave = {
  deelnemer: Deelnemer
  periode: Periode
  uitjes: Overzicht["uitjes"]
  groep: { id: number; naam: string } | null
  leden: Deelnemer[]
  eigenOpgaven: { id: number; uitje_id: number; reeks_keuze: boolean; met_groepje: boolean; notitie: string | null }[]
  groepsOpgaven: { deelnemer_id: number; uitje_id: number; reeks_keuze: boolean }[]
  open: boolean
}

export function Opgave() {
  const { mag } = useAuth()
  const [zoekParams] = useSearchParams()
  const [periodes, setPeriodes] = useState<Periode[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [overzicht, setOverzicht] = useState<Overzicht | null>(null)
  const [zoek, setZoek] = useState("")
  const [resultaten, setResultaten] = useState<Deelnemer[]>([])
  const [gekozen, setGekozen] = useState<DeelnemerOpgave | null>(null)
  const [geselecteerd, setGeselecteerd] = useState<number[]>([])
  const [geselecteerdeReeksen, setGeselecteerdeReeksen] = useState<number[]>([])
  const [metGroepje, setMetGroepje] = useState(true)
  const [notitie, setNotitie] = useState("")
  const [reden, setReden] = useState("")
  const [laden, setLaden] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [resultaat, setResultaat] = useState<{
    bevestiging: string
    groepsMelding: string | null
    waarschuwingen: string[]
    opgaveIds?: number[]
  } | null>(null)

  const laadOverzicht = useCallback(async (id: string) => {
    if (!id) return
    try {
      const antwoord = await api<Overzicht>(`/opgave/overzicht?periode_id=${id}`)
      setOverzicht(antwoord)
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    }
  }, [])

  useEffect(() => {
    async function start() {
      try {
        const antwoord = await api<{ periodes: Periode[] }>("/periodes")
        setPeriodes(antwoord.periodes)
        const voorkeur =
          antwoord.periodes.find((p) => p.status === "gepubliceerd") ?? antwoord.periodes[0]
        if (voorkeur) {
          setPeriodeId(String(voorkeur.id))
          await laadOverzicht(String(voorkeur.id))
        }
      } catch (e) {
        setFout(foutTekst(e))
      } finally {
        setLaden(false)
      }
    }
    void start()
  }, [laadOverzicht])

  useEffect(() => {
    const bestaand = zoekParams.get("deelnemer")
    if (bestaand && periodeId) {
      void kiesDeelnemer(Number(bestaand), periodeId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodeId])

  useEffect(() => {
    if (!zoek.trim()) {
      setResultaten([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const antwoord = await api<{ deelnemers: Deelnemer[] }>(
          `/deelnemers?q=${encodeURIComponent(zoek)}&status=actief`,
        )
        setResultaten(antwoord.deelnemers.slice(0, 8))
      } catch {
        setResultaten([])
      }
    }, 160)
    return () => clearTimeout(timer)
  }, [zoek])

  async function kiesDeelnemer(deelnemerId: number, periode: string) {
    setBezig(true)
    setFout(null)
    setResultaat(null)
    try {
      const antwoord = await api<DeelnemerOpgave>(`/opgave/deelnemer/${deelnemerId}?periode_id=${periode}`)
      setGekozen(antwoord)
      const eigen = antwoord.eigenOpgaven
      setGeselecteerd(eigen.map((opgave) => opgave.uitje_id))
      setGeselecteerdeReeksen(
        [
          ...new Set(
            eigen
              .filter((opgave) => opgave.reeks_keuze)
              .map((opgave) => antwoord.uitjes.find((uitje) => uitje.id === opgave.uitje_id)?.reeks_id)
              .filter((reeksId): reeksId is number => Boolean(reeksId)),
          ),
        ],
      )
      setMetGroepje(eigen[0]?.met_groepje ?? true)
      setNotitie("")
      setZoek("")
      setResultaten([])
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function opslaan() {
    if (!gekozen) return
    setBezig(true)
    setFout(null)
    setResultaat(null)
    try {
      const specifiek = geselecteerd.filter((uitjeId) => {
        const uitje = gekozen.uitjes.find((u) => u.id === uitjeId)
        return !uitje?.reeks_id || !geselecteerdeReeksen.includes(uitje.reeks_id)
      })
      const antwoord = await api<{
        bevestiging: string
        groepsMelding: string | null
        waarschuwingen: string[]
        opgave_ids: number[]
      }>("/opgave", {
        method: "POST",
        body: JSON.stringify({
          deelnemer_id: gekozen.deelnemer.id,
          uitje_ids: specifiek,
          reeks_ids: geselecteerdeReeksen,
          met_groepje: metGroepje,
          notitie,
          reden,
        }),
      })
      setResultaat({ ...antwoord, opgaveIds: antwoord.opgave_ids })
      setReden("")
      await kiesDeelnemer(gekozen.deelnemer.id, periodeId)
      await laadOverzicht(periodeId)
      setResultaat({ ...antwoord, opgaveIds: antwoord.opgave_ids })
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function meldAf(opgaveId: number, omschrijving: string, datum: string) {
    if (!gekozen) return
    setBezig(true)
    setFout(null)
    try {
      await api(`/opgave/${opgaveId}`, {
        method: "DELETE",
        body: JSON.stringify({ reden: reden || "Afgemeld via de balie" }),
      })
      setResultaat({
        bevestiging: `Afgemeld voor ${omschrijving} op ${datumLang(datum)}.`,
        groepsMelding: null,
        waarschuwingen: [],
      })
      await kiesDeelnemer(gekozen.deelnemer.id, periodeId)
      await laadOverzicht(periodeId)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function maakOngedaan(opgaveIds: number[]) {
    if (!gekozen) return
    setBezig(true)
    try {
      for (const opgaveId of opgaveIds) {
        await api(`/opgave/${opgaveId}`, {
          method: "DELETE",
          body: JSON.stringify({ reden: "Ongedaan maken van zojuist ingevoerde opgave" }),
        })
      }
      setResultaat({ bevestiging: "De opgave is ongedaan gemaakt.", groepsMelding: null, waarschuwingen: [] })
      await kiesDeelnemer(gekozen.deelnemer.id, periodeId)
      await laadOverzicht(periodeId)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />

  const groepen = new Map<number, { omschrijving: string; uitjeIds: number[] }>()
  for (const uitje of overzicht?.uitjes ?? []) {
    if (!uitje.reeks_id) continue
    if (!groepen.has(uitje.reeks_id)) {
      groepen.set(uitje.reeks_id, { omschrijving: uitje.omschrijving, uitjeIds: [] })
    }
    groepen.get(uitje.reeks_id)!.uitjeIds.push(uitje.id)
  }

  return (
    <div>
      <PaginaKop
        titel="Beschikbaarheid doorgeven"
        stap="Zoek de deelnemer en vink de uitjes aan waarvoor die meegaat."
        uitleg="Zoek de deelnemer, bekijk het programma en vink aan waarvoor die persoon meegaat. Na opslaan lees je de bevestiging voor aan de telefoon."
        acties={
          <label className="veld" style={{ marginBottom: 0 }}>
            <span className="veld__label">Periode</span>
            <Select
              value={periodeId}
              onChange={(e) => {
                setPeriodeId(e.target.value)
                setGekozen(null)
                setResultaat(null)
                void laadOverzicht(e.target.value)
              }}
            >
              {periodes.map((periode) => (
                <option key={periode.id} value={periode.id}>
                  {periode.naam} ({periode.status})
                </option>
              ))}
            </Select>
          </label>
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {resultaat && (
        <Melding
          type="succes"
          titel="Opgeslagen"
          actie={
            resultaat.opgaveIds && resultaat.opgaveIds.length > 0
              ? { label: "Ongedaan maken", onClick: () => void maakOngedaan(resultaat.opgaveIds!) }
              : { label: "Sluiten", onClick: () => setResultaat(null) }
          }
        >
          <p>{resultaat.bevestiging}</p>
          {resultaat.groepsMelding && <p>{resultaat.groepsMelding}</p>}
          {resultaat.waarschuwingen.map((waarschuwing) => (
            <p key={waarschuwing} className="klein">Let op: {waarschuwing}</p>
          ))}
        </Melding>
      )}
      {overzicht && !overzicht.open && (
        <Melding type="waarschuwing" titel="De opgave is gesloten">
          De deadline was {datumNumeriek(overzicht.periode.aanmelddeadline)}.{" "}
          {mag("indeling", "wijzigen")
            ? "Als coördinator kun je met een reden nog een wijziging doorvoeren; vul de reden hieronder in."
            : "Neem contact op met de coördinator als er toch iets moet veranderen."}
        </Melding>
      )}

      <Kaart
        titel="Stap 1: wie belt er?"
        uitleg="Typ een paar letters van de naam of een telefoonnummer. Resultaten verschijnen al tijdens het typen."
      >
        <div className="zoekveld">
          <Invoer
            type="search"
            placeholder="Naam of telefoonnummer"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            aria-label="Deelnemer zoeken"
            autoFocus
          />
        </div>
        {resultaten.length > 0 && (
          <ul className="lijst marge-boven">
            {resultaten.map((deelnemer) => (
              <li key={deelnemer.id} className="lijst-item">
                <div className="lijst-item__kop">
                  <div>
                    <strong>{volledigeNaam(deelnemer)}</strong>
                    <div className="klein muted">
                      {deelnemer.telefoon ?? "geen telefoon"}
                      {deelnemer.groepje_naam ? ` · groepje ${deelnemer.groepje_naam}` : ""}
                    </div>
                  </div>
                  <Knop variant="primair" onClick={() => void kiesDeelnemer(deelnemer.id, periodeId)}>
                    Deze deelnemer
                  </Knop>
                </div>
              </li>
            ))}
          </ul>
        )}
        {zoek && resultaten.length === 0 && (
          <p className="klein muted marge-boven">
            Geen deelnemer gevonden. Probeer een andere spelling, of controleer of de deelnemer bestaat.
          </p>
        )}
      </Kaart>

      {gekozen && (
        <>
          <Kaart
            titel={`Stap 2: waarvoor gaat ${volledigeNaam(gekozen.deelnemer)} mee?`}
            uitleg="Het programma staat in dezelfde volgorde en met dezelfde woorden als het programmablad."
            acties={
              <Knop variant="rustig" onClick={() => { setGekozen(null); setResultaat(null) }}>
                Andere deelnemer kiezen
              </Knop>
            }
          >
            <div className="rij" style={{ marginBottom: "1rem" }}>
              <Badge toon="info">{gekozen.deelnemer.telefoon ?? "geen telefoon"}</Badge>
              {gekozen.deelnemer.heeft_mk && <Badge>MK</Badge>}
              {gekozen.deelnemer.heeft_vl && <Badge>VL</Badge>}
              {(gekozen.deelnemer.mobiliteit ?? []).map((kenmerk) => (
                <Badge key={kenmerk} toon="waarschuwing">{kenmerk}</Badge>
              ))}
              {gekozen.deelnemer.aantal_12m === 0 && <Badge toon="goed">nieuw: recht op 2 uitjes</Badge>}
            </div>

            {gekozen.groep && (
              <Melding type="info" titel={`Groepje: ${gekozen.groep.naam}`}>
                <p>
                  {gekozen.leden.map((lid) => volledigeNaam(lid)).join(", ")} gaat standaard mee. Kies hieronder
                  "Alleen" als deze deelnemer een keer zonder het groepje gaat.
                </p>
                <div className="rij marge-boven--klein">
                  <label className="vinkje">
                    <input type="radio" name="groep" checked={metGroepje} onChange={() => setMetGroepje(true)} />
                    Met groepje
                  </label>
                  <label className="vinkje">
                    <input type="radio" name="groep" checked={!metGroepje} onChange={() => setMetGroepje(false)} />
                    Alleen
                  </label>
                </div>
              </Melding>
            )}

            <div className="lijst">
              {overzicht?.uitjes.map((uitje) => {
                const reeks = uitje.reeks_id ? groepen.get(uitje.reeks_id) : undefined
                const eersteVanReeks = reeks && reeks.uitjeIds[0] === uitje.id
                const reeksGekozen = uitje.reeks_id ? geselecteerdeReeksen.includes(uitje.reeks_id) : false
                return (
                  <div key={uitje.id}>
                    {eersteVanReeks && reeks && (
                      <label
                        className="vinkje"
                        style={{ width: "100%", marginBottom: "0.4rem", background: "var(--oppervlak-zacht)" }}
                      >
                        <input
                          type="checkbox"
                          checked={reeksGekozen}
                          onChange={(e) =>
                            setGeselecteerdeReeksen((huidig) =>
                              e.target.checked
                                ? [...huidig, uitje.reeks_id!]
                                : huidig.filter((reeksId) => reeksId !== uitje.reeks_id),
                            )
                          }
                        />
                        <span>
                          <strong>Alle data van "{reeks.omschrijving}"</strong>
                          <span className="klein muted">
                            {" "}
                            — de deelnemer gaat één keer mee; het systeem kiest de datum met de meeste ruimte.
                          </span>
                        </span>
                      </label>
                    )}
                    <label
                      className={`uitje-regel${reeksGekozen ? " is-reeks" : ""}`}
                      style={reeksGekozen ? { opacity: 0.75 } : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={geselecteerd.includes(uitje.id)}
                        disabled={reeksGekozen}
                        onChange={(e) => {
                          setGeselecteerd((huidig) =>
                            e.target.checked
                              ? [...new Set([...huidig, uitje.id])]
                              : huidig.filter((id) => id !== uitje.id),
                          )
                          setResultaat(null)
                        }}
                      />
                      <span>
                        <span className="uitje-regel__datum">
                          {datumKort(uitje.datum)} · {tijd(uitje.begin_tijd, uitje.eind_tijd)}
                        </span>
                        <span className="uitje-regel__titel">{uitje.omschrijving}</span>
                        <span className="uitje-regel__meta">
                          {euro(uitje.prijs)}
                          {uitje.extra_kosten ? ` · ${uitje.extra_kosten}` : ""} ·{" "}
                          {uitje.aantal_opgaven}/{uitje.capaciteit} opgaven
                        </span>
                      </span>
                      <span>
                        {(uitje.labels ?? []).map((label) => (
                          <span key={label} className="tag">{label}</span>
                        ))}
                        {uitje.geschiktheid && (
                          <span className="klein" style={{ color: "var(--accent)" }}>
                            {uitje.geschiktheid}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>

            <Veld label="Notitie bij deze opgave" hint="Bijvoorbeeld: wil graag naast mevrouw Jansen zitten.">
              <Tekstvak value={notitie} onChange={(e) => setNotitie(e.target.value)} rows={2} />
            </Veld>

            {!gekozen.open && mag("indeling", "wijzigen") && (
              <Veld label="Reden voor wijziging na de deadline" hint="Komt in het wijzigingsoverzicht.">
                <Invoer value={reden} onChange={(e) => setReden(e.target.value)} />
              </Veld>
            )}

            <div className="rij" style={{ justifyContent: "flex-end" }}>
              <Knop
                variant="primair"
                onClick={() => void opslaan()}
                disabled={bezig || (geselecteerd.length === 0 && geselecteerdeReeksen.length === 0)}
              >
                {bezig ? "Opslaan…" : "Opgave opslaan"}
              </Knop>
            </div>
          </Kaart>

          <Kaart
            titel="Dit heeft deze persoon al opgegeven"
            uitleg="Klopt er iets niet? Meld af met de knop achter de regel; daarna kun je opnieuw opgeven."
          >
            {gekozen.eigenOpgaven.length === 0 ? (
              <p className="muted">Nog geen opgaven in deze periode.</p>
            ) : (
              <Tabel kolommen={["Datum", "Uitje", "Tijd", "Keuze", "Groepje", ""]}>
                {gekozen.uitjes
                  .filter((uitje) => gekozen.eigenOpgaven.some((opgave) => opgave.uitje_id === uitje.id))
                  .map((uitje) => {
                    const opgave = gekozen.eigenOpgaven.find((rij) => rij.uitje_id === uitje.id)!
                    return (
                      <tr key={uitje.id}>
                        <td className="nu">{datumNumeriek(uitje.datum)}</td>
                        <td>{uitje.omschrijving}</td>
                        <td className="nu">{tijd(uitje.begin_tijd, uitje.eind_tijd)}</td>
                        <td>{opgave.reeks_keuze ? "Alle data van de reeks" : "Deze datum"}</td>
                        <td>{opgave.met_groepje ? "Met groepje" : "Alleen"}</td>
                        <td className="rechts">
                          <Knop
                            variant="rustig"
                            onClick={() => void meldAf(opgave.id, uitje.omschrijving, uitje.datum)}
                            disabled={bezig}
                          >
                            Afmelden
                          </Knop>
                        </td>
                      </tr>
                    )
                  })}
              </Tabel>
            )}
            {gekozen.groepsOpgaven.length > 0 && (
              <p className="klein muted marge-boven">
                Let op: het groepje heeft ook opgaven in deze periode. Bij "Met groepje" worden die samen
                behandeld.
              </p>
            )}
          </Kaart>
        </>
      )}
    </div>
  )
}
