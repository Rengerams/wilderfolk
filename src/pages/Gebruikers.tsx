import { useEffect, useState } from "react"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Badge,
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
import { datumNumeriek } from "../lib/format"

type GebruikerRij = {
  id: number
  naam: string
  email: string
  actief: boolean
  twee_staps: boolean
  laatste_login: string | null
  rol_id: number
  rol_naam: string
}

type Rol = { id: number; naam: string; beschrijving: string | null }

export function Gebruikers() {
  const { mag, gebruiker } = useAuth()
  const [gebruikers, setGebruikers] = useState<GebruikerRij[]>([])
  const [rollen, setRollen] = useState<Rol[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [nieuw, setNieuw] = useState(false)
  const [bewerk, setBewerk] = useState<GebruikerRij | null>(null)
  const [formulier, setFormulier] = useState({ naam: "", email: "", wachtwoord: "", rol_id: "", twee_staps: false })
  const [wachtwoord, setWachtwoord] = useState("")

  async function haal() {
    setLaden(true)
    try {
      const antwoord = await api<{ gebruikers: GebruikerRij[]; rollen: Rol[] }>("/gebruikers")
      setGebruikers(antwoord.gebruikers)
      setRollen(antwoord.rollen)
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    void haal()
  }, [])

  async function maakAccount() {
    setBezig(true)
    setFout(null)
    try {
      await api("/gebruikers", {
        method: "POST",
        body: JSON.stringify({ ...formulier, rol_id: Number(formulier.rol_id) }),
      })
      setNieuw(false)
      setFormulier({ naam: "", email: "", wachtwoord: "", rol_id: "", twee_staps: false })
      setMelding("Het account is aangemaakt. Geef het wachtwoord persoonlijk door.")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function wijzigAccount() {
    if (!bewerk) return
    setBezig(true)
    setFout(null)
    try {
      await api(`/gebruikers/${bewerk.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          naam: bewerk.naam,
          email: bewerk.email,
          rol_id: bewerk.rol_id,
          actief: bewerk.actief,
          twee_staps: bewerk.twee_staps,
          wachtwoord: wachtwoord || undefined,
        }),
      })
      setBewerk(null)
      setWachtwoord("")
      setMelding("Het account is bijgewerkt.")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />

  return (
    <div>
      <PaginaKop
        titel="Gebruikers"
        stap="Maak een account aan of schakel iemand uit."
        uitleg="Accounts worden door de beheerder aangemaakt. Schakel iemand uit in plaats van te verwijderen, zodat het wijzigingsoverzicht blijft kloppen."
        acties={
          mag("gebruikers", "aanmaken") ? (
            <Knop variant="primair" onClick={() => setNieuw(true)}>
              Nieuw account
            </Knop>
          ) : undefined
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}

      <Kaart>
        <Tabel kolommen={["Naam", "E-mail", "Rol", "Tweestaps", "Laatst ingelogd", "Status", ""]}>
          {gebruikers.map((rij) => (
            <tr key={rij.id}>
              <td className="tabel__naam">{rij.naam}</td>
              <td>{rij.email}</td>
              <td>{rij.rol_naam}</td>
              <td>{rij.twee_staps ? <Badge toon="goed">aan</Badge> : <Badge>uit</Badge>}</td>
              <td className="nu">{rij.laatste_login ? datumNumeriek(rij.laatste_login.slice(0, 10)) : "—"}</td>
              <td>{rij.actief ? <Badge toon="goed">actief</Badge> : <Badge toon="fout">uitgeschakeld</Badge>}</td>
              <td className="rechts">
                {mag("gebruikers", "wijzigen") && (
                  <Knop
                    variant="rustig"
                    onClick={() => {
                      setBewerk(rij)
                      setWachtwoord("")
                    }}
                  >
                    Wijzigen
                  </Knop>
                )}
              </td>
            </tr>
          ))}
        </Tabel>
      </Kaart>

      {nieuw && (
        <Modal
          titel="Nieuw account"
          uitleg="Kies een rol. De rechten van die rol bepalen wat iemand ziet en mag."
          sluiten={() => setNieuw(false)}
          acties={
            <>
              <Knop onClick={() => setNieuw(false)}>Annuleren</Knop>
              <Knop
                variant="primair"
                onClick={() => void maakAccount()}
                disabled={bezig || !formulier.naam || !formulier.email || formulier.wachtwoord.length < 10 || !formulier.rol_id}
              >
                {bezig ? "Opslaan…" : "Account aanmaken"}
              </Knop>
            </>
          }
        >
          <Veld label="Naam" verplicht>
            <Invoer value={formulier.naam} onChange={(e) => setFormulier({ ...formulier, naam: e.target.value })} autoFocus />
          </Veld>
          <Veld label="E-mailadres" verplicht>
            <Invoer type="email" value={formulier.email} onChange={(e) => setFormulier({ ...formulier, email: e.target.value })} />
          </Veld>
          <Veld label="Tijdelijk wachtwoord" hint="Minstens 10 tekens. Een lange zin werkt het beste. Geef het persoonlijk door." verplicht>
            <Invoer
              type="text"
              value={formulier.wachtwoord}
              onChange={(e) => setFormulier({ ...formulier, wachtwoord: e.target.value })}
            />
          </Veld>
          <Veld label="Rol" verplicht>
            <Select value={formulier.rol_id} onChange={(e) => setFormulier({ ...formulier, rol_id: e.target.value })}>
              <option value="">Kies een rol…</option>
              {rollen.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.naam}
                </option>
              ))}
            </Select>
          </Veld>
          <label className="vinkje">
            <input
              type="checkbox"
              checked={formulier.twee_staps}
              onChange={(e) => setFormulier({ ...formulier, twee_staps: e.target.checked })}
            />
            Tweestapsverificatie via e-mailcode
          </label>
        </Modal>
      )}

      {bewerk && (
        <Modal
          titel={`Account van ${bewerk.naam} wijzigen`}
          sluiten={() => setBewerk(null)}
          acties={
            <>
              <Knop onClick={() => setBewerk(null)}>Annuleren</Knop>
              <Knop variant="primair" onClick={() => void wijzigAccount()} disabled={bezig}>
                Opslaan
              </Knop>
            </>
          }
        >
          <Veld label="Naam">
            <Invoer value={bewerk.naam} onChange={(e) => setBewerk({ ...bewerk, naam: e.target.value })} />
          </Veld>
          <Veld label="E-mailadres">
            <Invoer type="email" value={bewerk.email} onChange={(e) => setBewerk({ ...bewerk, email: e.target.value })} />
          </Veld>
          <Veld label="Rol">
            <Select value={bewerk.rol_id} onChange={(e) => setBewerk({ ...bewerk, rol_id: Number(e.target.value) })}>
              {rollen.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.naam}
                </option>
              ))}
            </Select>
          </Veld>
          <Veld label="Nieuw wachtwoord" hint="Laat leeg om het wachtwoord niet te wijzigen.">
            <Invoer type="text" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} />
          </Veld>
          <label className="vinkje">
            <input
              type="checkbox"
              checked={bewerk.twee_staps}
              onChange={(e) => setBewerk({ ...bewerk, twee_staps: e.target.checked })}
            />
            Tweestapsverificatie via e-mailcode
          </label>
          <label className="vinkje marge-boven">
            <input
              type="checkbox"
              checked={bewerk.actief}
              disabled={bewerk.id === gebruiker?.id}
              onChange={(e) => setBewerk({ ...bewerk, actief: e.target.checked })}
            />
            Account is actief
          </label>
          <p className="klein muted">
            Een account wordt nooit verwijderd, alleen uitgeschakeld. Daardoor blijft het wijzigingsoverzicht
            betrouwbaar.
          </p>
        </Modal>
      )}
    </div>
  )
}
