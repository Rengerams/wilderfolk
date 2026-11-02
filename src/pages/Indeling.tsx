import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Badge,
  Bevestig,
  Kaart,
  Knop,
  Laad,
  Melding,
  PaginaKop,
  Select,
  Tabel,
} from "../components/ui"
import { datumLang, datumNumeriek, volledigeNaam } from "../lib/format"
import type { IndelingRij, Periode } from "../types"

type IndelingData = {
  periode: Periode
  run: { id: number; modus: string; samenvatting: string | null; aangemaakt: string } | null
  runs: { id: number; modus: string; samenvatting: string | null; aangemaakt: string }[]
  rijen: IndelingRij[]
  verschillen: number
  aantalOpgaven: number
  magIndelen: boolean
  vandaag: string
}

type Verschillen = {
  verschillen: {
    deelnemer: string
    uitje: string
    systeem: string
    handmatig: string
    uitlegSysteem: string | null
    uitlegHandmatig: string | null
  }[]
  perDeelnemer: { naam: string; aantal: number }[]
  samenvatting: string | null
}

const STATUS_TEKST: Record<string, string> = {
  geplaatst: "Geplaatst",
  reserve: "Reservelijst",
  afgewezen: "Afgewezen",
  afgemeld: "Afgemeld",
  aangemeld: "Aangemeld",
}

export function Indeling() {
  const { periodeId } = useParams()
  const { mag } = useAuth()
  const [periodes, setPeriodes] = useState<Periode[]>([])
  const [gekozenPeriode, setGekozenPeriode] = useState(periodeId ?? "")
  const [data, setData] = useState<IndelingData | null>(null)
  const [verschillen, setVerschillen] = useState<Verschillen | null>(null)
  const [laden, setLaden] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [waarschuwing, setWaarschuwing] = useState<string | null>(null)
  const [bewaarHandmatig, setBewaarHandmatig] = useState(true)
  const [bevestigOpen, setBevestigOpen] = useState(false)
  const [toonUitleg, setToonUitleg] = useState<number | null>(null)

  const haal = useCallback(async (id: string) => {
    if (!id) return
    setLaden(true)
    try {
      const antwoord = await api<IndelingData>(`/indeling/${id}`)
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
        const voorkeur =
          antwoord.periodes.find((p) => String(p.id) === periodeId) ??
          antwoord.periodes.find((p) => p.status === "gesloten") ??
          antwoord.periodes[0]
        if (voorkeur) {
          setGekozenPeriode(String(voorkeur.id))
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

  async function bereken() {
    if (!data) return
    setBezig(true)
    setFout(null)
    setMelding(null)
    try {
      const antwoord = await api<{ samenvatting: string }>(`/indeling/${data.periode.id}/bereken`, {
        method: "POST",
        body: JSON.stringify({ bewaar_handmatig: bewaarHandmatig }),
      })
      setMelding(`Voorstel berekend (proefmodus; er is nog niemand bevestigd of gebeld). ${antwoord.samenvatting}`)
      await haal(String(data.periode.id))
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function wijzigStatus(rij: IndelingRij, status: string) {
    setBezig(true)
    setFout(null)
    setWaarschuwing(null)
    try {
      const antwoord = await api<{ waarschuwing: string | null }>(`/indeling/rij/${rij.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
      setWaarschuwing(antwoord.waarschuwing)
      setMelding(`${volledigeNaam(rij)} staat nu op: ${STATUS_TEKST[status] ?? status}. De wijziging is als handmatig vastgelegd.`)
      await haal(String(data!.periode.id))
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function bevestig() {
    if (!data?.run) return
    setBezig(true)
    setFout(null)
    try {
      const antwoord = await api<{ bericht: string }>(`/indeling/${data.periode.id}/bevestig`, {
        method: "POST",
        body: JSON.stringify({ run_id: data.run.id, bevestig: true }),
      })
      setBevestigOpen(false)
      setMelding(antwoord.bericht)
      await haal(String(data.periode.id))
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function haalVerschillen() {
    if (!data) return
    try {
      const antwoord = await api<Verschillen>(`/indeling/${data.periode.id}/verschillen`)
      setVerschillen(antwoord)
    } catch (e) {
      setFout(foutTekst(e))
    }
  }

  if (laden) return <Laad />
  if (fout && !data) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  const perUitje = new Map<number, IndelingRij[]>()
  for (const rij of data.rijen) {
    if (!perUitje.has(rij.uitje_id)) perUitje.set(rij.uitje_id, [])
    perUitje.get(rij.uitje_id)!.push(rij)
  }
  const isDefinitief = data.run?.modus === "definitief"

  return (
    <div>
      <PaginaKop
        titel="Eerlijke indeling"
        stap={
          data.magIndelen
            ? data.run
              ? "Controleer het voorstel en bevestig daarna de indeling."
              : "Bereken het voorstel. Er wordt nog niemand bevestigd of gebeld."
            : "Sluit eerst de opgave bij het programma."
        }
        uitleg={
          data.magIndelen
            ? "Bereken een voorstel. Het systeem legt bij elke plek uit waarom. De coördinator houdt altijd het laatste woord."
            : "De indeling kan pas als de periode gesloten is. Sluit eerst de opgave bij het programma."
        }
        acties={
          <>
            <label className="veld" style={{ marginBottom: 0 }}>
              <span className="veld__label">Periode</span>
              <Select
                value={gekozenPeriode}
                onChange={(e) => {
                  setGekozenPeriode(e.target.value)
                  setVerschillen(null)
                  setMelding(null)
                  void haal(e.target.value)
                }}
              >
                {periodes.map((periode) => (
                  <option key={periode.id} value={periode.id}>
                    {periode.naam} ({periode.status})
                  </option>
                ))}
              </Select>
            </label>
            {data.magIndelen && mag("indeling", "wijzigen") && (
              <Knop variant="primair" onClick={() => void bereken()} disabled={bezig}>
                {bezig ? "Berekenen…" : data.run ? "Opnieuw berekenen" : "Voorstel berekenen"}
              </Knop>
            )}
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

      {!data.magIndelen && (
        <Melding type="info" titel="Nog niet indeelbaar">
          De periode is nog niet gesloten. Bij het programma kun je de opgave sluiten; daarna weet je wie zich
          heeft opgegeven en kan het voorstel worden berekend.
        </Melding>
      )}

      {data.magIndelen && mag("indeling", "wijzigen") && (
        <Kaart titel="Voorstel" uitleg={data.run ? data.run.samenvatting ?? "" : "Er is nog geen voorstel berekend."}>
          <div className="rij">
            <label className="vinkje">
              <input
                type="checkbox"
                checked={bewaarHandmatig}
                onChange={(e) => setBewaarHandmatig(e.target.checked)}
              />
              Handmatige keuzes bewaren bij opnieuw berekenen
            </label>
            {data.verschillen > 0 && <Badge toon="waarschuwing">{data.verschillen} handmatige wijzigingen</Badge>}
            {isDefinitief && <Badge toon="goed">Deze indeling is bevestigd</Badge>}
          </div>
          {data.run && (
            <div className="rij marge-boven">
              <Knop onClick={() => void haalVerschillen()}>Verschillen bekijken</Knop>
              <Link className="knop" to={`/bellijst?periode=${data.periode.id}`}>
                Naar de bellijst
              </Link>
              {!isDefinitief && (
                <Knop variant="primair" onClick={() => setBevestigOpen(true)}>
                  Indeling bevestigen
                </Knop>
              )}
            </div>
          )}
          {!data.run && (
            <div className="leeg marge-boven">
              <p className="leeg__titel">Nog geen voorstel</p>
              <p className="leeg__uitleg">
                {data.aantalOpgaven === 0
                  ? "Er zijn nog geen opgaven in deze periode. Zonder opgaven valt er niets te verdelen."
                  : `Er zijn ${data.aantalOpgaven} opgaven. Bereken nu een voorstel; er wordt nog niemand bevestigd of gebeld.`}
              </p>
              {data.aantalOpgaven > 0 && (
                <div className="leeg__actie">
                  <Knop variant="primair" onClick={() => void bereken()} disabled={bezig}>
                    Voorstel berekenen
                  </Knop>
                </div>
              )}
            </div>
          )}
        </Kaart>
      )}

      {data.rijen.length > 0 && (
        <>
          {[...perUitje.entries()].map(([uitjeId, rijen]) => {
            const eerste = rijen[0]
            const geplaatst = rijen.filter((rij) => rij.status === "geplaatst")
            const reserve = rijen.filter((rij) => rij.status === "reserve")
            const overvol = geplaatst.length > eerste.capaciteit
            return (
              <Kaart
                key={uitjeId}
                titel={`${eerste.omschrijving} · ${datumLang(eerste.datum)}`}
                uitleg={`${geplaatst.length} van ${eerste.capaciteit} plekken bezet · ${reserve.length} op de reservelijst`}
                acties={overvol ? <Badge toon="fout">overvol</Badge> : undefined}
              >
                <Tabel kolommen={["Naam", "Telefoon", "Groepje", "Status", "Uitleg", ""]}>
                  {rijen.map((rij) => (
                    <tr key={rij.id}>
                      <td className="tabel__naam">{volledigeNaam(rij)}</td>
                      <td className="nu">{rij.telefoon ?? "—"}</td>
                      <td>{rij.groepje_naam ?? "—"}</td>
                      <td>
                        {isDefinitief || !mag("indeling", "wijzigen") ? (
                          <Badge
                            toon={
                              rij.status === "geplaatst"
                                ? "goed"
                                : rij.status === "reserve"
                                  ? "waarschuwing"
                                  : rij.status === "afgemeld"
                                    ? "neutraal"
                                    : "fout"
                            }
                          >
                            {STATUS_TEKST[rij.status] ?? rij.status}
                            {rij.positie ? ` ${rij.positie}` : ""}
                          </Badge>
                        ) : (
                          <Select
                            value={rij.status}
                            onChange={(e) => void wijzigStatus(rij, e.target.value)}
                            aria-label={`Status van ${volledigeNaam(rij)}`}
                          >
                            <option value="geplaatst">Geplaatst</option>
                            <option value="reserve">Reservelijst</option>
                            <option value="afgewezen">Afgewezen</option>
                          </Select>
                        )}
                        {rij.handmatig && <div><Badge toon="info">handmatig</Badge></div>}
                      </td>
                      <td>
                        <div className="klein">{rij.uitleg}</div>
                        {rij.handmatig && rij.systeem_uitleg && toonUitleg === rij.id && (
                          <div className="klein muted marge-boven--klein">
                            <strong>Systeem zei:</strong> {rij.systeem_uitleg}
                          </div>
                        )}
                      </td>
                      <td className="rechts">
                        {rij.handmatig && rij.systeem_uitleg && (
                          <Knop
                            variant="rustig"
                            onClick={() => setToonUitleg(toonUitleg === rij.id ? null : rij.id)}
                          >
                            {toonUitleg === rij.id ? "Verbergen" : "Waarom?"}
                          </Knop>
                        )}
                      </td>
                    </tr>
                  ))}
                </Tabel>
              </Kaart>
            )
          })}
        </>
      )}

      {verschillen && (
        <Kaart
          titel="Verschillen tussen systeem en handmatige indeling"
          uitleg={verschillen.samenvatting ?? "Geen verschillen."}
        >
          {verschillen.verschillen.length === 0 ? (
            <p className="muted">Het systeemvoorstel en de handmatige indeling zijn gelijk.</p>
          ) : (
            <Tabel kolommen={["Deelnemer", "Uitje", "Systeem", "Handmatig", "Uitleg systeem"]}>
              {verschillen.verschillen.map((verschil, index) => (
                <tr key={index}>
                  <td>{verschil.deelnemer}</td>
                  <td>{verschil.uitje}</td>
                  <td>{STATUS_TEKST[verschil.systeem] ?? verschil.systeem}</td>
                  <td>{STATUS_TEKST[verschil.handmatig] ?? verschil.handmatig}</td>
                  <td className="klein">{verschil.uitlegSysteem}</td>
                </tr>
              ))}
            </Tabel>
          )}
          <h3 className="sectie-titel">Aantal uitjes per deelnemer</h3>
          <Tabel kolommen={["Deelnemer", { tekst: "Geplaatst", getal: true }]}>
            {verschillen.perDeelnemer.map((persoon) => (
              <tr key={persoon.naam}>
                <td>{persoon.naam}</td>
                <td className="getal">{persoon.aantal}</td>
              </tr>
            ))}
          </Tabel>
        </Kaart>
      )}

      {bevestigOpen && data.run && (
        <Bevestig
          titel="Indeling bevestigen?"
          uitleg={
            <>
              <p>
                Je bevestigt nu {data.rijen.filter((rij) => rij.status === "geplaatst").length} plaatsingen en{" "}
                {data.rijen.filter((rij) => rij.status === "reserve").length} plekken op de reservelijst.
              </p>
              <p>
                Daarna maakt het systeem de bellijst en verstuurt het e-mails aan deelnemers met een e-mailadres.
                Deelnemers zonder e-mail of met de voorkeur "bellen" komen op de bellijst.
              </p>
              <p>Na bevestigen kun je de indeling niet meer aanpassen zonder een nieuwe proef te maken.</p>
            </>
          }
          bevestigLabel="Ja, indeling bevestigen en bellijst maken"
          bezig={bezig}
          bevestig={() => void bevestig()}
          annuleer={() => setBevestigOpen(false)}
        />
      )}

      <p className="klein muted">
        Laatst berekend: {data.run ? datumNumeriek(data.run.aangemaakt.slice(0, 10)) : "nog niet"} ·{" "}
        {data.aantalOpgaven} opgaven in deze periode.
      </p>
    </div>
  )
}
