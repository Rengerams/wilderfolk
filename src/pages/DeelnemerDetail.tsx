import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { api, download, foutTekst } from "../api"
import { useAuth } from "../auth"
import { DeelnemerForm, type DeelnemerVelden, veldenVan } from "../components/DeelnemerForm"
import {
  Badge,
  Bevestig,
  Kaart,
  Knop,
  Laad,
  Melding,
  Modal,
  PaginaKop,
  Tabel,
  Tekstvak,
  Veld,
} from "../components/ui"
import { datumNumeriek, tijd, volledigeNaam } from "../lib/format"
import type { Deelnemer } from "../types"

type Opgave = {
  id: number
  uitje_id: number
  reeks_keuze: boolean
  met_groepje: boolean
  notitie: string | null
  datum: string
  omschrijving: string
  begin_tijd: string | null
  eind_tijd: string | null
  periode_id: number
  periode_naam: string
  periode_status: string
  aanmelddeadline: string
}

type Detail = {
  deelnemer: Deelnemer
  geschiedenis: { id: number; datum: string; omschrijving: string; prijs: number; periode_naam: string }[]
  opgaven: Opgave[]
  groepje: { id: number; voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null }[]
}

export function DeelnemerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { mag, gebruiker } = useAuth()
  const [data, setData] = useState<Detail | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<{ tekst: string; ongedaan?: () => void } | null>(null)
  const [bewerk, setBewerk] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [anoniem, setAnoniem] = useState(false)
  const [afmelden, setAfmelden] = useState<Opgave | null>(null)
  const [reden, setReden] = useState("")

  async function haal() {
    setLaden(true)
    try {
      const antwoord = await api<Detail>(`/deelnemers/${id}`)
      setData(antwoord)
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

  async function wijzig(velden: DeelnemerVelden) {
    if (!data) return
    setBezig(true)
    try {
      const oud = veldenVan(data.deelnemer)
      await api(`/deelnemers/${data.deelnemer.id}`, {
        method: "PATCH",
        body: JSON.stringify(velden),
      })
      setBewerk(false)
      setMelding({
        tekst: "De gegevens zijn opgeslagen.",
        ongedaan: async () => {
          await api(`/deelnemers/${data.deelnemer.id}`, {
            method: "PATCH",
            body: JSON.stringify(oud),
          })
          setMelding(null)
          await haal()
        },
      })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function anonimiseer() {
    if (!data) return
    setBezig(true)
    try {
      await api(`/deelnemers/${data.deelnemer.id}/anonimiseren`, {
        method: "POST",
        body: JSON.stringify({ bevestig: true }),
      })
      setAnoniem(false)
      navigate("/deelnemers")
    } catch (e) {
      setFout(foutTekst(e))
      setAnoniem(false)
    } finally {
      setBezig(false)
    }
  }

  async function meldAf() {
    if (!afmelden) return
    setBezig(true)
    try {
      const antwoord = await api<{ bericht?: string }>(`/opgave/${afmelden.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reden }),
      })
      const oude = afmelden
      setAfmelden(null)
      setReden("")
      setMelding({
        tekst: antwoord.bericht ?? `Afgemeld voor ${oude.omschrijving}.`,
        ongedaan: async () => {
          await api("/opgave", {
            method: "POST",
            body: JSON.stringify({
              deelnemer_id: Number(id),
              uitje_ids: [oude.uitje_id],
              met_groepje: oude.met_groepje,
              reden: "Ongedaan maken van de afmelding",
            }),
          })
          setMelding(null)
          await haal()
        },
      })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />
  if (fout && !data) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  const { deelnemer, geschiedenis, opgaven, groepje } = data
  const naam = volledigeNaam(deelnemer)
  const kanWijzigen = mag("deelnemers", "wijzigen")
  const magOverschrijven = mag("indeling", "wijzigen")

  return (
    <div>
      <PaginaKop
        titel={naam}
        stap={
          opgaven.length > 0
            ? "Bekijk waarvoor deze deelnemer is opgegeven of voer een nieuwe opgave in."
            : "Voer een opgave in of bekijk de bezoekgeschiedenis."
        }
        uitleg={
          opgaven.length > 0
            ? "Bekijk hieronder waarvoor deze deelnemer is opgegeven. Nieuwe opgave? Gebruik de knop Beschikbaarheid invoeren."
            : "Nog geen opgaven voor deze deelnemer. Voer een opgave in via de telefoon, of bekijk de bezoekgeschiedenis."
        }
        acties={
          <>
            {mag("opgave", "aanmaken") && (
              <Link className="knop knop--primair" to={`/opgave?deelnemer=${deelnemer.id}`}>
                Beschikbaarheid invoeren
              </Link>
            )}
            {kanWijzigen && (
              <Knop onClick={() => setBewerk(true)}>Gegevens wijzigen</Knop>
            )}
          </>
        }
      />

      {melding && (
        <Melding
          type="succes"
          actie={
            melding.ongedaan
              ? { label: "Ongedaan maken", onClick: () => void melding.ongedaan?.() }
              : { label: "Sluiten", onClick: () => setMelding(null) }
          }
        >
          {melding.tekst}
        </Melding>
      )}
      {fout && <Melding type="fout">{fout}</Melding>}

      <div className="rij marge-boven--klein" style={{ marginBottom: "1rem" }}>
        <Badge toon={deelnemer.status === "actief" ? "goed" : deelnemer.status === "gestopt" ? "neutraal" : "waarschuwing"}>
          {deelnemer.status}
        </Badge>
        {deelnemer.groepje_naam && <Badge toon="info">Groepje: {deelnemer.groepje_naam}</Badge>}
        {deelnemer.heeft_mk && <Badge>Museumkaart</Badge>}
        {deelnemer.heeft_vl && <Badge>VIP-kaart (VL)</Badge>}
        {deelnemer.geanonimiseerd && <Badge toon="fout">Gegevens verwijderd (AVG)</Badge>}
      </div>

      <div className="grid-2">
        <Kaart titel="Contact">
          <div className="gegevens">
            <div className="gegevens__item">
              <div className="gegevens__label">Telefoon</div>
              <div className="gegevens__waarde">
                {deelnemer.telefoon ? <a href={`tel:${deelnemer.telefoon}`}>{deelnemer.telefoon}</a> : "—"}
              </div>
            </div>
            <div className="gegevens__item">
              <div className="gegevens__label">Tweede telefoon</div>
              <div className="gegevens__waarde">{deelnemer.telefoon_alt ?? "—"}</div>
            </div>
            <div className="gegevens__item">
              <div className="gegevens__label">E-mail</div>
              <div className="gegevens__waarde">{deelnemer.email ?? "—"}</div>
            </div>
            <div className="gegevens__item">
              <div className="gegevens__label">Voorkeur bericht</div>
              <div className="gegevens__waarde">
                {deelnemer.contactvoorkeur === "beide" ? "Bellen en e-mail" : deelnemer.contactvoorkeur === "email" ? "E-mail" : "Bellen"}
              </div>
            </div>
          </div>
          <h3 className="sectie-titel">Woonadres</h3>
          <p>
            {deelnemer.straat ? `${deelnemer.straat} ${deelnemer.huisnummer ?? ""}` : "Geen adres bekend"}
            {deelnemer.postcode && <><br />{deelnemer.postcode} {deelnemer.plaats}</>}
          </p>
        </Kaart>

        <Kaart titel="Meegaat gemakkelijker met">
          {deelnemer.mobiliteit.length === 0 ? (
            <p className="muted">Geen mobiliteitskenmerken vastgelegd.</p>
          ) : (
            <div className="rij">
              {deelnemer.mobiliteit.map((kenmerk) => (
                <Badge key={kenmerk} toon="waarschuwing">{kenmerk}</Badge>
              ))}
            </div>
          )}
          <h3 className="sectie-titel">Noodcontact</h3>
          <p>
            {deelnemer.noodcontact_naam
              ? `${deelnemer.noodcontact_naam}${deelnemer.noodcontact_telefoon ? ` · ${deelnemer.noodcontact_telefoon}` : ""}`
              : <span className="muted">Niet vastgelegd</span>}
          </p>
          <h3 className="sectie-titel">Opmerkingen</h3>
          <p>{deelnemer.opmerkingen || <span className="muted">Geen opmerkingen.</span>}</p>
        </Kaart>
      </div>

      <div className="grid-2">
        <Kaart titel="Groepje">
          {deelnemer.groepje_naam ? (
            <>
              <p>
                <strong>{deelnemer.groepje_naam}</strong> — samen met{" "}
                {groepje.map((lid) => volledigeNaam(lid)).join(", ") || "niemand anders"}.
              </p>
              <p className="klein muted">
                Bij de opgave wordt het groepje standaard meegenomen. Kies bij de opgave "Alleen" om een keer
                zonder het groepje te gaan.
              </p>
            </>
          ) : (
            <p className="muted">Deze deelnemer zit niet in een groepje.</p>
          )}
        </Kaart>

        <Kaart titel="Meegeweest">
          <div className="grid-3">
            <div className="stat">
              <div className="stat__waarde">{deelnemer.totaal_deelnames}</div>
              <div className="stat__label">keer in totaal</div>
            </div>
            <div className="stat">
              <div className="stat__waarde">{deelnemer.aantal_12m}</div>
              <div className="stat__label">keer in 12 maanden</div>
            </div>
            <div className="stat">
              <div className="stat__waarde">{deelnemer.laatste_deelname ? datumNumeriek(deelnemer.laatste_deelname) : "—"}</div>
              <div className="stat__label">laatst mee</div>
            </div>
          </div>
          <p className="klein muted marge-boven">
            {deelnemer.totaal_deelnames === 0
              ? "Deze deelnemer is nog nooit meegeweest en telt als nieuw. Nieuwe deelnemers hebben recht op twee uitjes."
              : "De indeling kijkt naar het aantal keer meegaan in de laatste 12 maanden."}
          </p>
        </Kaart>
      </div>

      <Kaart titel="Opgaven" uitleg="Waarvoor is deze deelnemer opgegeven? Wijzigingen worden in het wijzigingsoverzicht vastgelegd.">
        {opgaven.length === 0 ? (
          <div className="leeg">
            <p className="leeg__titel">Nog geen opgaven</p>
            <p className="leeg__uitleg">
              {mag("opgave", "aanmaken")
                ? "Gebruik de knop Beschikbaarheid invoeren bovenaan om deze deelnemer voor een uitje op te geven."
                : "De coördinator legt de opgaven telefonisch vast."}
            </p>
          </div>
        ) : (
          <Tabel kolommen={["Datum", "Uitje", "Tijd", "Periode", "Groepje", ""]}>
            {opgaven.map((opgave) => (
              <tr key={opgave.id}>
                <td className="nu">{datumNumeriek(opgave.datum)}</td>
                <td>
                  <strong>{opgave.omschrijving}</strong>
                  {opgave.reeks_keuze && <div className="klein muted">alle data van deze reeks</div>}
                  {opgave.notitie && <div className="klein muted">Notitie: {opgave.notitie}</div>}
                </td>
                <td className="nu">{tijd(opgave.begin_tijd, opgave.eind_tijd)}</td>
                <td>{opgave.periode_naam}</td>
                <td>{opgave.met_groepje ? "Met groepje" : "Alleen"}</td>
                <td className="rechts">
                  {mag("opgave", "wijzigen") && (
                    <Knop variant="rustig" onClick={() => setAfmelden(opgave)}>
                      Afmelden
                    </Knop>
                  )}
                </td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>

      <Kaart titel="Bezoekgeschiedenis" uitleg="Automatisch gevuld na het afronden van een uitje.">
        {geschiedenis.length === 0 ? (
          <p className="muted">Nog niet eerder meegeweest.</p>
        ) : (
          <Tabel kolommen={["Datum", "Uitje", "Periode"]}>
            {geschiedenis.map((bezoek) => (
              <tr key={`${bezoek.id}-${bezoek.datum}`}>
                <td className="nu">{datumNumeriek(bezoek.datum)}</td>
                <td>{bezoek.omschrijving}</td>
                <td>{bezoek.periode_naam}</td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>

      <Kaart
        titel="Privacy (AVG)"
        uitleg="Bekijk alle gegevens van deze persoon, of verwijder de persoonsgegevens. De bezoekgeschiedenis blijft anoniem bewaard."
        acties={
          <>
            <Knop onClick={() => void download(`/deelnemers/${deelnemer.id}/avg-overzicht`, `avg-overzicht-${deelnemer.id}.json`)}>
              Volledig overzicht downloaden
            </Knop>
            {mag("deelnemers", "verwijderen") && !deelnemer.geanonimiseerd && (
              <Knop variant="gevaar" onClick={() => setAnoniem(true)}>
                Persoonsgegevens verwijderen
              </Knop>
            )}
          </>
        }
      >
        <p className="klein muted">
          Inloggen op dit dossier wordt vastgelegd. Alleen medewerkers met rechten op deelnemers kunnen deze
          gegevens zien. Chauffeurs zien alleen naam, telefoon en mobiliteit van de deelnemers in hun eigen uitje.
        </p>
      </Kaart>

      {bewerk && (
        <Modal titel={`Gegevens van ${naam} wijzigen`} sluiten={() => setBewerk(false)} breed>
          <DeelnemerForm
            begin={veldenVan(deelnemer)}
            bewerk
            bezig={bezig}
            opslaan={(velden) => void wijzig(velden)}
            annuleer={() => setBewerk(false)}
          />
        </Modal>
      )}

      {anoniem && (
        <Bevestig
          titel="Persoonsgegevens verwijderen?"
          uitleg={`Hiermee worden naam, telefoon, adres, e-mail en opmerkingen van ${naam} gewist. De bezoekgeschiedenis blijft anoniem bewaard, zodat de eerlijke indeling blijft kloppen. Dit kan niet ongedaan worden gemaakt.`}
          bevestigLabel="Ja, gegevens verwijderen"
          gevaar
          bezig={bezig}
          bevestig={() => void anonimiseer()}
          annuleer={() => setAnoniem(false)}
        />
      )}

      {afmelden && (
        <Modal
          titel="Afmelden voor uitje"
          uitleg={`${naam} afmelden voor ${afmelden.omschrijving} op ${datumNumeriek(afmelden.datum)}.`}
          sluiten={() => setAfmelden(null)}
          acties={
            <>
              <Knop onClick={() => setAfmelden(null)}>Annuleren</Knop>
              <Knop variant="gevaar" onClick={() => void meldAf()} disabled={bezig}>
                {bezig ? "Bezig…" : "Afmelden"}
              </Knop>
            </>
          }
        >
          <Veld
            label="Reden"
            hint={
              afmelden.periode_status === "gesloten"
                ? "De opgave is gesloten. Alleen de coördinator kan met een reden afmelden."
                : "Bijvoorbeeld: de deelnemer is ziek."
            }
            verplicht={afmelden.periode_status === "gesloten"}
          >
            <Tekstvak value={reden} onChange={(e) => setReden(e.target.value)} autoFocus />
          </Veld>
          {afmelden.periode_status === "gesloten" && !magOverschrijven && (
            <Melding type="waarschuwing">
              Je hebt geen rechten om na de deadline af te melden. Vraag de coördinator.
            </Melding>
          )}
          {gebruiker?.rol === "Chauffeur" && (
            <Melding type="info">Als chauffeur kun je op dit scherm geen wijzigingen doorvoeren.</Melding>
          )}
        </Modal>
      )}
    </div>
  )
}
