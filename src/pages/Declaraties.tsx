import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { api, download, foutTekst } from "../api"
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
  Tekstvak,
  Veld,
} from "../components/ui"
import { datumNumeriek, euro } from "../lib/format"

type Declaratie = {
  id: number
  uitje_id: number
  chauffeur_id: number
  bedrag: number
  soort: string
  omschrijving: string | null
  bon: string | null
  status: string
  ingediend: string
  goedgekeurd_op: string | null
  uitbetaald_op: string | null
  afgekeurd_reden: string | null
  chauffeur_naam: string
  goedgekeurd_door_naam: string | null
  datum: string
  uitje_omschrijving: string
  periode_naam: string
  periode_id: number
}

type DeclaratieData = {
  declaraties: Declaratie[]
  chauffeurs: { id: number; naam: string }[]
  uitjes: { id: number; omschrijving: string; datum: string; periode_naam: string }[]
  soorten: string[]
}

type Maandoverzicht = {
  maand: string
  declaraties: { uitje: string; datum: string; chauffeur_naam: string; bedrag: number; soort: string; status: string }[]
  kas: { uitje: string; datum: string; verwacht: number; geteld: number; verschil: number; geteld_door_naam: string | null }[]
  stortingen: { datum: string; bedrag: number; omschrijving: string | null }[]
  totaalDeclaraties: number
  totaalContant: number
  totaalGestort: number
}

function kleurVoorStatus(status: string) {
  if (status === "uitbetaald") return "goed" as const
  if (status === "goedgekeurd") return "info" as const
  if (status === "afgekeurd") return "fout" as const
  return "waarschuwing" as const
}

export function Declaraties() {
  const { gebruiker, mag, moduleAan } = useAuth()
  const [zoekParams] = useSearchParams()
  const [data, setData] = useState<DeclaratieData | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [filter, setFilter] = useState("alles")
  const [formulier, setFormulier] = useState({
    uitje_id: zoekParams.get("uitje") ?? "",
    bedrag: "",
    soort: "brandstof",
    omschrijving: "",
    bon: "",
  })
  const [bewerk, setBewerk] = useState<Declaratie | null>(null)
  const [beoordeel, setBeoordeel] = useState<{ declaratie: Declaratie; goedkeuren: boolean } | null>(null)
  const [reden, setReden] = useState("")
  const [bonModal, setBonModal] = useState<string | null>(null)
  const [maand, setMaand] = useState(new Date().toISOString().slice(0, 7))
  const [overzicht, setOverzicht] = useState<Maandoverzicht | null>(null)

  const haal = useCallback(async () => {
    setLaden(true)
    try {
      const antwoord = await api<DeclaratieData>("/declaraties")
      setData(antwoord)
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    void haal()
  }, [haal])

  async function voegToe() {
    setBezig(true)
    setFout(null)
    try {
      await api("/declaraties", {
        method: "POST",
        body: JSON.stringify({
          uitje_id: Number(formulier.uitje_id),
          bedrag: Number(formulier.bedrag.replace(",", ".")),
          soort: formulier.soort,
          omschrijving: formulier.omschrijving,
          bon: formulier.bon,
        }),
      })
      setMelding("Je kosten zijn ingediend. De penningmeester keurt ze goed.")
      setFormulier({ uitje_id: "", bedrag: "", soort: "brandstof", omschrijving: "", bon: "" })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function kiesBon(bestand: File | null) {
    if (!bestand) return
    if (bestand.size > 4 * 1024 * 1024) {
      setFout("De foto is groter dan 4 MB. Maak een kleinere foto.")
      return
    }
    const lezer = new FileReader()
    lezer.onload = () => setFormulier((huidig) => ({ ...huidig, bon: String(lezer.result) }))
    lezer.readAsDataURL(bestand)
  }

  async function slaBewerkingOp() {
    if (!bewerk) return
    setBezig(true)
    try {
      await api(`/declaraties/${bewerk.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          bedrag: Number(String(bewerk.bedrag).replace(",", ".")),
          soort: bewerk.soort,
          omschrijving: bewerk.omschrijving,
        }),
      })
      setBewerk(null)
      setMelding("De declaratie is aangepast.")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function trekIn(id: number) {
    setBezig(true)
    try {
      await api(`/declaraties/${id}`, { method: "DELETE" })
      setMelding("De declaratie is ingetrokken.")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function beoordeelNu() {
    if (!beoordeel) return
    setBezig(true)
    try {
      await api(`/declaraties/${beoordeel.declaratie.id}/beoordelen`, {
        method: "POST",
        body: JSON.stringify({ goedkeuren: beoordeel.goedkeuren, reden }),
      })
      setMelding(beoordeel.goedkeuren ? "De declaratie is goedgekeurd." : "De declaratie is afgekeurd.")
      setBeoordeel(null)
      setReden("")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function betaalUit(id: number) {
    setBezig(true)
    try {
      await api(`/declaraties/${id}/uitbetalen`, { method: "POST" })
      setMelding("De declaratie staat op uitbetaald.")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function haalOverzicht() {
    try {
      const antwoord = await api<Maandoverzicht>(`/declaraties/maandoverzicht?maand=${maand}`)
      setOverzicht(antwoord)
    } catch (e) {
      setFout(foutTekst(e))
    }
  }

  if (!moduleAan("chauffeurskosten")) {
    return (
      <Kaart titel="De module Chauffeurskosten staat uit">
        <p>
          De beheerder kan deze module aanzetten bij Modules. Zolang de module uit staat, werkt de stichting op de
          oude manier met papier en blijven alle gegevens bewaard.
        </p>
      </Kaart>
    )
  }

  if (laden) return <Laad />
  if (fout && !data) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  const isChauffeur = gebruiker?.rol === "Chauffeur"
  // Beoordelen en uitbetalen zijn voorbehouden aan de penningmeester en beheerders.
  const isFinancieel = ["Penningmeester", "Admin", "Beheerder"].includes(gebruiker?.rol ?? "")
  const zichtbaar = data.declaraties.filter((declaratie) => filter === "alles" || declaratie.status === filter)
  const teBeoordelen = data.declaraties.filter((declaratie) => declaratie.status === "ingediend").length

  return (
    <div>
      <PaginaKop
        titel="Chauffeurskosten"
        stap={
          isChauffeur
            ? "Dien je kosten in zodra je terug bent van het uitje."
            : "Controleer de declaraties en keur ze goed."
        }
        uitleg={
          isChauffeur
            ? "Vul na elk uitje je kosten in. Je kunt een declaratie aanpassen zolang de penningmeester hem nog niet heeft beoordeeld."
            : "Controleer de declaraties, keur ze goed en haal het maandoverzicht op voor de administratie."
        }
        acties={
          <Knop onClick={() => void download("/declaraties/export", "declaraties.csv")}>Exporteren als CSV</Knop>
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}
      {teBeoordelen > 0 && !isChauffeur && (
        <Melding type="waarschuwing">{teBeoordelen} declaratie(s) wachten op goedkeuring.</Melding>
      )}

      <div className="grid-2">
        <Kaart titel="Kosten invoeren" uitleg="Bedrag, soort en een korte omschrijving. Een foto van de bon mag erbij.">
          {data.uitjes.length === 0 ? (
            <p className="muted">Er zijn nog geen uitjes waarvoor je kosten kunt invoeren.</p>
          ) : (
            <>
              <Veld label="Uitje" verplicht>
                <Select
                  value={formulier.uitje_id}
                  onChange={(e) => setFormulier({ ...formulier, uitje_id: e.target.value })}
                >
                  <option value="">Kies een uitje…</option>
                  {data.uitjes.map((uitje) => (
                    <option key={uitje.id} value={uitje.id}>
                      {datumNumeriek(uitje.datum)} · {uitje.omschrijving}
                    </option>
                  ))}
                </Select>
              </Veld>
              <div className="grid-2">
                <Veld label="Bedrag (€)" verplicht>
                  <Invoer
                    inputMode="decimal"
                    value={formulier.bedrag}
                    onChange={(e) => setFormulier({ ...formulier, bedrag: e.target.value })}
                    placeholder="0,00"
                  />
                </Veld>
                <Veld label="Soort" verplicht>
                  <Select
                    value={formulier.soort}
                    onChange={(e) => setFormulier({ ...formulier, soort: e.target.value })}
                  >
                    {data.soorten.map((soort) => (
                      <option key={soort} value={soort}>
                        {soort}
                      </option>
                    ))}
                  </Select>
                </Veld>
              </div>
              <Veld label="Korte omschrijving">
                <Tekstvak
                  value={formulier.omschrijving}
                  onChange={(e) => setFormulier({ ...formulier, omschrijving: e.target.value })}
                  placeholder="Bijvoorbeeld: getankt bij vertrek"
                  rows={2}
                />
              </Veld>
              <Veld label="Foto van de bon" hint="Maak een foto met de camera van je telefoon of kies een bestand.">
                <Invoer type="file" accept="image/*" capture="environment" onChange={(e) => void kiesBon(e.target.files?.[0] ?? null)} />
              </Veld>
              {formulier.bon && <p className="klein muted">Foto toegevoegd.</p>}
              <Knop
                variant="primair"
                onClick={() => void voegToe()}
                disabled={bezig || !formulier.uitje_id || !formulier.bedrag}
              >
                {bezig ? "Versturen…" : "Kosten indienen"}
              </Knop>
              <p className="klein muted marge-boven">
                Je declaratie wordt gekoppeld aan het uitje en het voertuig, zodat de penningmeester hem later kan
                nacalculeren.
              </p>
            </>
          )}
        </Kaart>

        <Kaart
          titel="Maandoverzicht"
          uitleg="Alles wat de penningmeester nodig heeft, zonder overtypen."
        >
          <div className="rij">
            <Invoer type="month" value={maand} onChange={(e) => setMaand(e.target.value)} />
            <Knop onClick={() => void haalOverzicht()}>Ophalen</Knop>
            <Knop
              onClick={() => void download(`/declaraties/maandoverzicht/export?maand=${maand}`, `maandoverzicht-${maand}.csv`)}
            >
              Downloaden
            </Knop>
          </div>
          {overzicht && (
            <div className="marge-boven">
              <div className="grid-3">
                <div className="stat">
                  <div className="stat__waarde">{euro(overzicht.totaalDeclaraties)}</div>
                  <div className="stat__label">declaraties</div>
                </div>
                <div className="stat">
                  <div className="stat__waarde">{euro(overzicht.totaalContant)}</div>
                  <div className="stat__label">contant geteld</div>
                </div>
                <div className="stat">
                  <div className="stat__waarde">{euro(overzicht.totaalGestort)}</div>
                  <div className="stat__label">gestort</div>
                </div>
              </div>
              <Tabel compact kolommen={["Datum", "Uitje", "Chauffeur", "Soort", { tekst: "Bedrag", getal: true }, "Status"]}>
                {overzicht.declaraties.map((rij, index) => (
                  <tr key={index}>
                    <td className="nu">{datumNumeriek(rij.datum)}</td>
                    <td>{rij.uitje}</td>
                    <td>{rij.chauffeur_naam}</td>
                    <td>{rij.soort}</td>
                    <td className="getal">{euro(rij.bedrag)}</td>
                    <td>{rij.status}</td>
                  </tr>
                ))}
              </Tabel>
            </div>
          )}
        </Kaart>
      </div>

      <Kaart
        titel={`Declaraties (${zichtbaar.length})`}
        acties={
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter op status">
            <option value="alles">Alle statussen</option>
            <option value="ingediend">Ingediend</option>
            <option value="goedgekeurd">Goedgekeurd</option>
            <option value="uitbetaald">Uitbetaald</option>
            <option value="afgekeurd">Afgekeurd</option>
          </Select>
        }
      >
        {zichtbaar.length === 0 ? (
          <p className="muted">Geen declaraties met deze status.</p>
        ) : (
          <Tabel
            kolommen={[
              "Datum",
              "Uitje",
              "Chauffeur",
              "Soort",
              { tekst: "Bedrag", getal: true },
              "Status",
              "Bon",
              "",
            ]}
          >
            {zichtbaar.map((declaratie) => (
              <tr key={declaratie.id}>
                <td className="nu">{datumNumeriek(declaratie.datum)}</td>
                <td>
                  {declaratie.uitje_omschrijving}
                  {declaratie.omschrijving && (
                    <div className="klein muted">{declaratie.omschrijving}</div>
                  )}
                  {declaratie.periode_naam && <div className="klein muted">{declaratie.periode_naam}</div>}
                </td>
                <td>{declaratie.chauffeur_naam}</td>
                <td>{declaratie.soort}</td>
                <td className="getal">{euro(declaratie.bedrag)}</td>
                <td>
                  <Badge toon={kleurVoorStatus(declaratie.status)}>{declaratie.status}</Badge>
                  {declaratie.afgekeurd_reden && (
                    <div className="klein muted">{declaratie.afgekeurd_reden}</div>
                  )}
                </td>
                <td>
                  {declaratie.bon ? (
                    <Knop variant="rustig" onClick={() => setBonModal(declaratie.bon)}>
                      Bekijken
                    </Knop>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="rechts">
                  <div className="rij" style={{ justifyContent: "flex-end" }}>
                    {declaratie.status === "ingediend" &&
                      (declaratie.chauffeur_id === gebruiker?.id || mag("declaraties", "wijzigen")) && (
                        <>
                          <Knop variant="rustig" onClick={() => setBewerk(declaratie)}>
                            Wijzigen
                          </Knop>
                          {declaratie.chauffeur_id === gebruiker?.id && (
                            <Knop variant="rustig" onClick={() => void trekIn(declaratie.id)}>
                              Intrekken
                            </Knop>
                          )}
                        </>
                      )}
                    {declaratie.status === "ingediend" && isFinancieel &&
                      declaratie.chauffeur_id !== gebruiker?.id && mag("declaraties", "wijzigen") && (
                      <>
                        <Knop variant="primair" onClick={() => { setBeoordeel({ declaratie, goedkeuren: true }); setReden("") }}>
                          Goedkeuren
                        </Knop>
                        <Knop variant="gevaar" onClick={() => { setBeoordeel({ declaratie, goedkeuren: false }); setReden("") }}>
                          Afkeuren
                        </Knop>
                      </>
                    )}
                    {declaratie.status === "goedgekeurd" && isFinancieel &&
                      declaratie.chauffeur_id !== gebruiker?.id && mag("declaraties", "wijzigen") && (
                      <Knop onClick={() => void betaalUit(declaratie.id)}>Uitbetalen</Knop>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>

      {bewerk && (
        <Modal
          titel="Declaratie aanpassen"
          uitleg="Dit kan alleen zolang de declaratie nog niet is beoordeeld."
          sluiten={() => setBewerk(null)}
          acties={
            <>
              <Knop onClick={() => setBewerk(null)}>Annuleren</Knop>
              <Knop variant="primair" onClick={() => void slaBewerkingOp()} disabled={bezig}>
                Opslaan
              </Knop>
            </>
          }
        >
          <Veld label="Bedrag (€)">
            <Invoer
              inputMode="decimal"
              value={String(bewerk.bedrag)}
              onChange={(e) => setBewerk({ ...bewerk, bedrag: Number(e.target.value.replace(",", ".")) || 0 })}
            />
          </Veld>
          <Veld label="Soort">
            <Select value={bewerk.soort} onChange={(e) => setBewerk({ ...bewerk, soort: e.target.value })}>
              {data.soorten.map((soort) => (
                <option key={soort} value={soort}>
                  {soort}
                </option>
              ))}
            </Select>
          </Veld>
          <Veld label="Omschrijving">
            <Tekstvak
              value={bewerk.omschrijving ?? ""}
              onChange={(e) => setBewerk({ ...bewerk, omschrijving: e.target.value })}
            />
          </Veld>
        </Modal>
      )}

      {beoordeel && (
        <Bevestig
          titel={beoordeel.goedkeuren ? "Declaratie goedkeuren?" : "Declaratie afkeuren?"}
          uitleg={`${beoordeel.declaratie.chauffeur_naam} declareerde ${euro(beoordeel.declaratie.bedrag)} voor ${beoordeel.declaratie.soort}.`}
          bevestigLabel={beoordeel.goedkeuren ? "Ja, goedkeuren" : "Ja, afkeuren"}
          gevaar={!beoordeel.goedkeuren}
          bezig={bezig}
          bevestig={() => void beoordeelNu()}
          annuleer={() => setBeoordeel(null)}
        >
          {!beoordeel.goedkeuren && (
            <Veld label="Reden van afkeuren" verplicht>
              <Tekstvak value={reden} onChange={(e) => setReden(e.target.value)} autoFocus />
            </Veld>
          )}
        </Bevestig>
      )}

      {bonModal && (
        <Modal titel="Foto van de bon" sluiten={() => setBonModal(null)} breed acties={<Knop onClick={() => setBonModal(null)}>Sluiten</Knop>}>
          {bonModal.startsWith("data:image") ? (
            <img src={bonModal} alt="Foto van de bon" style={{ maxWidth: "100%", borderRadius: 8 }} />
          ) : (
            <p className="muted">Deze bon is als bestand opgeslagen en kan hier niet worden getoond.</p>
          )}
        </Modal>
      )}
    </div>
  )
}
