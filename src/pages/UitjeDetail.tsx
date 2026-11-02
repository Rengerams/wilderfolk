import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Badge,
  Bevestig,
  Invoer,
  Kaart,
  Knop,
  Laad,
  Melding,
  Modal,
  PaginaKop,
  Select,
  Tabel,
  Veld,
} from "../components/ui"
import { PlekkenKeuze } from "../components/PlekkenKeuze"
import { datumLang, euro, tijd, volledigeNaam } from "../lib/format"
import type { Periode, Uitje } from "../types"

const LABELS = ["Nieuw", "Op herhaling", "Op veler verzoek", "Eenmalig", "Uitgelicht"]

type Detail = {
  uitje: Uitje & { periode: Periode }
  voertuigen: {
    id: number
    voertuig_id: number
    naam: string
    kenteken: string | null
    capaciteit: number
    chauffeur_id: number | null
    chauffeur_naam: string | null
    begeleider_id: number | null
    begeleider_naam: string | null
  }[]
  alleVoertuigen: { id: number; naam: string; kenteken: string | null; capaciteit: number }[]
  chauffeurs: { id: number; naam: string }[]
  medewerkers: { id: number; naam: string }[]
}

type Lijst = {
  uitje: Uitje
  deelnemers: {
    id: number
    voornaam: string
    tussenvoegsel: string | null
    achternaam: string
    telefoon: string | null
    mobiliteit: string[]
    heeft_mk: boolean
    heeft_vl: boolean
    opmerkingen: string | null
    status: string
    positie: number | null
    groepje_naam: string | null
  }[]
  aanwezig: number[]
  voertuigen: {
    id: number
    naam: string
    kenteken: string | null
    capaciteit: number
    chauffeur_naam: string | null
    begeleider_naam: string | null
  }[]
  heeftIndeling: boolean
}

export function UitjeDetail() {
  const { id } = useParams()
  const { mag, gebruiker } = useAuth()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [lijst, setLijst] = useState<Lijst | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  const [bewerk, setBewerk] = useState(false)
  const [velden, setVelden] = useState({
    datum: "", begin_tijd: "", eind_tijd: "", omschrijving: "", prijs: "0",
    extra_kosten: "", capaciteit: "14", geschiktheid: "", labels: [] as string[], status: "actief",
  })
  const [voertuigId, setVoertuigId] = useState("")
  const [chauffeurId, setChauffeurId] = useState("")
  const [begeleiderId, setBegeleiderId] = useState("")
  const [aanwezig, setAanwezig] = useState<number[]>([])
  const [afronden, setAfronden] = useState(false)
  const [annuleren, setAnnuleren] = useState(false)
  const [belLijst, setBelLijst] = useState<{ voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null }[] | null>(null)

  async function haal() {
    setLaden(true)
    try {
      const [detailAntwoord, lijstAntwoord] = await Promise.all([
        api<Detail>(`/periodes/uitje/${id}`),
        api<Lijst>(`/periodes/uitje/${id}/deelnemerslijst`),
      ])
      setDetail(detailAntwoord)
      setLijst(lijstAntwoord)
      setAanwezig(lijstAntwoord.aanwezig)
      setVelden({
        datum: detailAntwoord.uitje.datum.slice(0, 10),
        begin_tijd: detailAntwoord.uitje.begin_tijd?.slice(0, 5) ?? "",
        eind_tijd: detailAntwoord.uitje.eind_tijd?.slice(0, 5) ?? "",
        omschrijving: detailAntwoord.uitje.omschrijving,
        prijs: String(detailAntwoord.uitje.prijs),
        extra_kosten: detailAntwoord.uitje.extra_kosten ?? "",
        capaciteit: String(detailAntwoord.uitje.capaciteit),
        geschiktheid: detailAntwoord.uitje.geschiktheid ?? "",
        labels: detailAntwoord.uitje.labels ?? [],
        status: detailAntwoord.uitje.status,
      })
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    void haal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function opslaan() {
    setBezig(true)
    try {
      const antwoord = await api<{ bericht?: string }>(`/periodes/uitje/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...velden, prijs: Number(velden.prijs.replace(",", ".")) || 0, capaciteit: Number(velden.capaciteit) || 14 }),
      })
      setBewerk(false)
      setMelding(antwoord.bericht ?? "Het uitje is bijgewerkt.")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function koppelVoertuig() {
    setBezig(true)
    try {
      const antwoord = await api<{ waarschuwing?: string; bericht: string }>(`/periodes/uitje/${id}/voertuigen`, {
        method: "POST",
        body: JSON.stringify({
          voertuig_id: Number(voertuigId),
          chauffeur_id: chauffeurId ? Number(chauffeurId) : null,
          begeleider_id: begeleiderId ? Number(begeleiderId) : null,
        }),
      })
      setMelding(antwoord.bericht)
      setVoertuigId("")
      setChauffeurId("")
      setBegeleiderId("")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function verwijderVoertuig(koppelingId: number) {
    setBezig(true)
    try {
      await api(`/periodes/uitje-voertuig/${koppelingId}`, { method: "DELETE" })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function rondAf() {
    setBezig(true)
    try {
      const antwoord = await api<{ bericht: string }>(`/periodes/uitje/${id}/afronden`, {
        method: "POST",
        body: JSON.stringify({ aanwezig }),
      })
      setAfronden(false)
      setMelding(antwoord.bericht)
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function annuleerUitje() {
    setBezig(true)
    try {
      const antwoord = await api<{ deelnemers: { voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null }[] }>(
        `/periodes/uitje/${id}/annuleer`,
        { method: "POST" },
      )
      setAnnuleren(false)
      setBelLijst(antwoord.deelnemers)
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />
  if (fout && !detail) return <Melding type="fout">{fout}</Melding>
  if (!detail || !lijst) return null

  const { uitje } = detail
  const geplaatst = lijst.deelnemers.filter((d) => d.status === "geplaatst" || d.status === "aangemeld")
  const reserve = lijst.deelnemers.filter((d) => d.status === "reserve")
  const chauffeurZonderRechten = gebruiker?.rol === "Chauffeur" && !mag("deelnemers", "zien")
  const magWijzigen = mag("programma", "wijzigen") && !chauffeurZonderRechten

  return (
    <div>
      <div className="print-kop">
        <h1>{uitje.omschrijving}</h1>
        <p>
          {datumLang(uitje.datum)} · {tijd(uitje.begin_tijd, uitje.eind_tijd)} · {uitje.periode.naam}
        </p>
        <p>Deelnemerslijst voor de chauffeur en de medewerker die belt.</p>
      </div>

      <PaginaKop
        titel={uitje.omschrijving}
        stap="Controleer de deelnemerslijst en wijs chauffeur en begeleider toe."
        uitleg={`${datumLang(uitje.datum)} · ${tijd(uitje.begin_tijd, uitje.eind_tijd)} · ${uitje.periode.naam}`}
        acties={
          <>
            <Link className="knop" to={`/programma/${uitje.periode_id}`}>
              Terug naar programma
            </Link>
            <Knop onClick={() => window.print()}>Deelnemerslijst afdrukken</Knop>
            {magWijzigen && <Knop onClick={() => setBewerk(true)}>Uitje wijzigen</Knop>}
          </>
        }
      />

      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}
      {fout && <Melding type="fout">{fout}</Melding>}
      {uitje.status === "geannuleerd" && (
        <Melding type="fout" titel="Dit uitje is geannuleerd">
          Alle deelnemers staan op de bellijst met de boodschap dat het uitje niet doorgaat.
        </Melding>
      )}
      {!lijst.heeftIndeling && (
        <Melding type="info">
          Er is nog geen bevestigde indeling. Hieronder staan alle opgaven; na het bevestigen van de indeling
          zie je hier wie er echt meegaat en wie op de reservelijst staat.
        </Melding>
      )}

      <Kaart>
        <div className="gegevens">
          <div className="gegevens__item">
            <div className="gegevens__label">Datum en tijd</div>
            <div className="gegevens__waarde">
              {datumLang(uitje.datum)} · {tijd(uitje.begin_tijd, uitje.eind_tijd)}
            </div>
          </div>
          <div className="gegevens__item">
            <div className="gegevens__label">Prijs per persoon</div>
            <div className="gegevens__waarde">{euro(uitje.prijs)}</div>
          </div>
          <div className="gegevens__item">
            <div className="gegevens__label">Extra kosten</div>
            <div className="gegevens__waarde">{uitje.extra_kosten ?? "—"}</div>
          </div>
          <div className="gegevens__item">
            <div className="gegevens__label">Plekken</div>
            <div className="gegevens__waarde">
              {uitje.capaciteit} · {geplaatst.length} geplaatst · {reserve.length} reserve
            </div>
          </div>
          <div className="gegevens__item">
            <div className="gegevens__label">Geschiktheid</div>
            <div className="gegevens__waarde">{uitje.geschiktheid ?? "Geen bijzonderheden"}</div>
          </div>
          <div className="gegevens__item">
            <div className="gegevens__label">Vervoer</div>
            <div className="gegevens__waarde">
              {lijst.voertuigen.length === 0
                ? "Nog geen voertuig gekoppeld"
                : lijst.voertuigen
                    .map(
                      (v) =>
                        `${v.naam}${v.kenteken ? ` (${v.kenteken})` : ""} · chauffeur: ${
                          v.chauffeur_naam ?? "nog niet bekend"
                        }${v.begeleider_naam ? ` · begeleider: ${v.begeleider_naam}` : ""}`,
                    )
                    .join(" | ")}
            </div>
          </div>
        </div>
        {(uitje.labels ?? []).length > 0 && (
          <div className="rij marge-boven">
            {uitje.labels.map((label) => (
              <span key={label} className="tag">{label}</span>
            ))}
          </div>
        )}
      </Kaart>

      <Kaart
        titel={`Wie gaat er mee (${geplaatst.length})`}
        uitleg="Naam, telefoon, groepje, kaarten en mobiliteit. Print deze lijst voor de chauffeur."
        acties={
          magWijzigen ? (
            <>
              <Knop variant="primair" onClick={() => setAfronden(true)}>
                Uitje afronden
              </Knop>
              {uitje.status !== "geannuleerd" && (
                <Knop variant="gevaar" onClick={() => setAnnuleren(true)}>
                  Uitje annuleren
                </Knop>
              )}
            </>
          ) : undefined
        }
      >
        {geplaatst.length === 0 ? (
          <p className="muted">Nog niemand geplaatst voor dit uitje.</p>
        ) : (
          <Tabel kolommen={["Naam", "Telefoon", "Groepje", "Kaarten", "Meegaat gemakkelijker met", "Aanwezig"]}>
            {geplaatst.map((deelnemer) => (
              <tr key={deelnemer.id}>
                <td className="tabel__naam">
                  <Link to={`/deelnemers/${deelnemer.id}`}>{volledigeNaam(deelnemer)}</Link>
                  {deelnemer.opmerkingen && <div className="klein muted">{deelnemer.opmerkingen}</div>}
                </td>
                <td className="nu">
                  {deelnemer.telefoon ? <a href={`tel:${deelnemer.telefoon}`}>{deelnemer.telefoon}</a> : "—"}
                </td>
                <td>{deelnemer.groepje_naam ?? <span className="muted">—</span>}</td>
                <td>
                  {deelnemer.heeft_mk && <span className="tag">MK</span>}
                  {deelnemer.heeft_vl && <span className="tag">VL</span>}
                </td>
                <td>
                  {(deelnemer.mobiliteit ?? []).length === 0
                    ? <span className="muted">—</span>
                    : deelnemer.mobiliteit.join(", ")}
                </td>
                <td>
                  {magWijzigen && !uitje.afgerond_op ? (
                    <label className="vinkje">
                      <input
                        type="checkbox"
                        checked={aanwezig.includes(deelnemer.id)}
                        onChange={(e) =>
                          setAanwezig((huidig) =>
                            e.target.checked
                              ? [...huidig, deelnemer.id]
                              : huidig.filter((persoonId) => persoonId !== deelnemer.id),
                          )
                        }
                      />
                      was er
                    </label>
                  ) : aanwezig.includes(deelnemer.id) ? (
                    <Badge toon="goed">aanwezig</Badge>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Tabel>
        )}

        {reserve.length > 0 && (
          <>
            <h3 className="sectie-titel">Reservelijst ({reserve.length})</h3>
            <Tabel kolommen={["Volgorde", "Naam", "Telefoon", "Groepje"]}>
              {reserve
                .slice()
                .sort((a, b) => (a.positie ?? 99) - (b.positie ?? 99))
                .map((deelnemer, index) => (
                  <tr key={deelnemer.id}>
                    <td className="getal">{deelnemer.positie ?? index + 1}</td>
                    <td>{volledigeNaam(deelnemer)}</td>
                    <td className="nu">{deelnemer.telefoon ?? "—"}</td>
                    <td>{deelnemer.groepje_naam ?? "—"}</td>
                  </tr>
                ))}
            </Tabel>
          </>
        )}
      </Kaart>

      <Kaart
        titel="Vervoer"
        uitleg="De capaciteit van het uitje bepaalt automatisch de voertuigen. Je kunt handmatig een voertuig toevoegen, bijvoorbeeld een touringcar."
      >
        {detail.voertuigen.length === 0 ? (
          <p className="muted">Nog geen voertuig gekoppeld.</p>
        ) : (
          <Tabel kolommen={["Voertuig", "Plekken", "Chauffeur", "Begeleider", ""]}>
            {detail.voertuigen.map((voertuig) => (
              <tr key={voertuig.id}>
                <td>
                  {voertuig.naam}
                  {voertuig.kenteken && <div className="klein muted">{voertuig.kenteken}</div>}
                </td>
                <td className="getal">{voertuig.capaciteit}</td>
                <td>{voertuig.chauffeur_naam ?? <Badge toon="waarschuwing">geen chauffeur</Badge>}</td>
                <td>{voertuig.begeleider_naam ?? <Badge toon="waarschuwing">geen begeleider</Badge>}</td>
                <td className="rechts">
                  {magWijzigen && (
                    <Knop variant="rustig" onClick={() => void verwijderVoertuig(voertuig.id)}>
                      Verwijderen
                    </Knop>
                  )}
                </td>
              </tr>
            ))}
          </Tabel>
        )}
        {magWijzigen && (
          <div className="rij marge-boven">
            <Select value={voertuigId} onChange={(e) => setVoertuigId(e.target.value)} aria-label="Voertuig">
              <option value="">Kies een voertuig…</option>
              {detail.alleVoertuigen.map((voertuig) => (
                <option key={voertuig.id} value={voertuig.id}>
                  {voertuig.naam}
                  {voertuig.kenteken ? ` (${voertuig.kenteken})` : ""} · {voertuig.capaciteit} plekken
                </option>
              ))}
            </Select>
            <Select value={chauffeurId} onChange={(e) => setChauffeurId(e.target.value)} aria-label="Chauffeur">
              <option value="">Chauffeur later…</option>
              {detail.chauffeurs.map((chauffeur) => (
                <option key={chauffeur.id} value={chauffeur.id}>
                  {chauffeur.naam}
                </option>
              ))}
            </Select>
            <Select value={begeleiderId} onChange={(e) => setBegeleiderId(e.target.value)} aria-label="Begeleider">
              <option value="">Begeleider later…</option>
              {detail.medewerkers.map((medewerker) => (
                <option key={medewerker.id} value={medewerker.id}>
                  {medewerker.naam}
                </option>
              ))}
            </Select>
            <Knop onClick={() => void koppelVoertuig()} disabled={!voertuigId || bezig}>
              Voertuig koppelen
            </Knop>
          </div>
        )}
        {(detail.voertuigen.some((v) => !v.chauffeur_id) || detail.voertuigen.some((v) => !v.begeleider_id)) && (
          <Melding type="waarschuwing">
            Let op: er ontbreekt nog een chauffeur of begeleider. Er gaat altijd allebei iemand mee; regel het
            voordat de dag begint.
          </Melding>
        )}
      </Kaart>

      {bewerk && (
        <Modal
          titel="Uitje wijzigen"
          sluiten={() => setBewerk(false)}
          breed
          acties={
            <>
              <Knop onClick={() => setBewerk(false)}>Annuleren</Knop>
              <Knop variant="primair" onClick={() => void opslaan()} disabled={bezig}>
                Opslaan
              </Knop>
            </>
          }
        >
          <Veld label="Omschrijving">
            <Invoer value={velden.omschrijving} onChange={(e) => setVelden({ ...velden, omschrijving: e.target.value })} />
          </Veld>
          <PlekkenKeuze
            waarde={velden.capaciteit}
            onChange={(waarde) => setVelden({ ...velden, capaciteit: waarde })}
            hint="Bij meer plekken schuift de reservelijst op en wordt de eerste reservist meteen op de bellijst gezet."
          />
          <div className="grid-2">
            <Veld label="Datum">
              <Invoer type="date" value={velden.datum} onChange={(e) => setVelden({ ...velden, datum: e.target.value })} />
            </Veld>
            <Veld label="Begintijd">
              <Invoer type="time" value={velden.begin_tijd} onChange={(e) => setVelden({ ...velden, begin_tijd: e.target.value })} />
            </Veld>
            <Veld label="Eindtijd">
              <Invoer type="time" value={velden.eind_tijd} onChange={(e) => setVelden({ ...velden, eind_tijd: e.target.value })} />
            </Veld>
            <Veld label="Prijs per persoon (€)">
              <Invoer inputMode="decimal" value={velden.prijs} onChange={(e) => setVelden({ ...velden, prijs: e.target.value })} />
            </Veld>
            <Veld label="Extra kosten (tekst)">
              <Invoer value={velden.extra_kosten} onChange={(e) => setVelden({ ...velden, extra_kosten: e.target.value })} />
            </Veld>
          </div>
          <Veld label="Geschiktheid">
            <Invoer value={velden.geschiktheid} onChange={(e) => setVelden({ ...velden, geschiktheid: e.target.value })} />
          </Veld>
          <p className="veld__label">Labels</p>
          <div className="rij">
            {LABELS.map((label) => (
              <label key={label} className="vinkje">
                <input
                  type="checkbox"
                  checked={velden.labels.includes(label)}
                  onChange={(e) =>
                    setVelden({
                      ...velden,
                      labels: e.target.checked
                        ? [...velden.labels, label]
                        : velden.labels.filter((l) => l !== label),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </Modal>
      )}

      {afronden && (
        <Bevestig
          titel="Uitje afronden?"
          uitleg={`Je gaat vastleggen wie er echt was. ${aanwezig.length} deelnemers staan aangevinkt. Dit vult de bezoekgeschiedenis en telt mee bij de eerlijke indeling.`}
          bevestigLabel="Ja, aanwezigheid opslaan"
          bezig={bezig}
          bevestig={() => void rondAf()}
          annuleer={() => setAfronden(false)}
        >
          {aanwezig.length === 0 && (
            <Melding type="waarschuwing">
              Je hebt nog niemand aangevinkt. Als je nu afrondt, telt niemand als aanwezig.
            </Melding>
          )}
        </Bevestig>
      )}

      {annuleren && (
        <Bevestig
          titel="Uitje annuleren?"
          uitleg="Alle deelnemers komen op de bellijst met de boodschap dat het uitje niet doorgaat. Zij moeten gebeld worden. De opgaven blijven bewaard."
          bevestigLabel="Ja, uitje annuleren"
          gevaar
          bezig={bezig}
          bevestig={() => void annuleerUitje()}
          annuleer={() => setAnnuleren(false)}
        />
      )}

      {belLijst && (
        <Modal
          titel="Uitje geannuleerd: deze mensen moeten gebeld worden"
          uitleg="De bellijst is bijgewerkt. Je kunt deze lijst ook later openen via Bellijst."
          sluiten={() => setBelLijst(null)}
          breed
          acties={<Knop variant="primair" onClick={() => setBelLijst(null)}>Sluiten</Knop>}
        >
          <Tabel kolommen={["Naam", "Telefoon"]}>
            {belLijst.map((deelnemer, index) => (
              <tr key={index}>
                <td>{volledigeNaam(deelnemer)}</td>
                <td className="nu">{deelnemer.telefoon ?? "geen nummer"}</td>
              </tr>
            ))}
          </Tabel>
        </Modal>
      )}
    </div>
  )
}
