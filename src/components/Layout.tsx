import { useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { useAuth } from "../auth"
import { api, foutTekst } from "../api"
import { Knop, Melding, Modal, Tekstvak, Veld } from "./ui"

const NAV: { pad: string; label: string; recht?: [string, "zien"]; module?: string }[] = [
  { pad: "/", label: "Vandaag" },
  { pad: "/start", label: "Aan de slag" },
  { pad: "/deelnemers", label: "Deelnemers", recht: ["deelnemers", "zien"] },
  { pad: "/groepjes", label: "Groepjes", recht: ["groepjes", "zien"] },
  { pad: "/programma", label: "Programma", recht: ["programma", "zien"] },
  { pad: "/opgave", label: "Opgave", recht: ["opgave", "zien"] },
  { pad: "/indeling", label: "Indeling", recht: ["indeling", "zien"] },
  { pad: "/bellijst", label: "Bellijst", recht: ["reservelijst", "zien"] },
  { pad: "/vervoer", label: "Vervoer", recht: ["vervoer", "zien"] },
  { pad: "/declaraties", label: "Declaraties", recht: ["declaraties", "zien"], module: "chauffeurskosten" },
  { pad: "/kas", label: "Kas", recht: ["kas", "zien"], module: "kas" },
  { pad: "/gebruikers", label: "Gebruikers", recht: ["gebruikers", "zien"] },
  { pad: "/rollen", label: "Rollen", recht: ["rollen", "zien"] },
  { pad: "/modules", label: "Modules", recht: ["modules", "zien"] },
  { pad: "/logboek", label: "Wijzigingen", recht: ["logboek", "zien"] },
  { pad: "/feedback", label: "Feedback", recht: ["feedback", "zien"] },
  { pad: "/assistent", label: "Assistent", module: "ai_assistent" },
  { pad: "/hulp", label: "Hulp" },
]

function FeedbackKnop() {
  const { gebruiker } = useAuth()
  const locatie = useLocation()
  const [open, setOpen] = useState(false)
  const [tekst, setTekst] = useState("")
  const [bezig, setBezig] = useState(false)
  const [klaar, setKlaar] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  async function verstuur() {
    setBezig(true)
    setFout(null)
    try {
      const antwoord = await api<{ bericht: string }>("/feedback", {
        method: "POST",
        body: JSON.stringify({ tekst, scherm: locatie.pathname }),
      })
      setKlaar(antwoord.bericht)
      setTekst("")
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <Knop variant="rustig" onClick={() => setOpen(true)}>
        Iets onduidelijk of werkt het niet goed? Vertel het ons
      </Knop>
      {open && (
        <Modal
          titel="Iets onduidelijk of werkt het niet goed?"
          uitleg={`Je zit op dit scherm: ${locatie.pathname}. We nemen je melding mee en laten zien wat ermee gebeurt.`}
          sluiten={() => {
            setOpen(false)
            setKlaar(null)
            setFout(null)
          }}
          acties={
            <>
              {!klaar && (
                <Knop variant="primair" onClick={verstuur} disabled={bezig || tekst.trim().length < 3}>
                  {bezig ? "Versturen…" : "Melding versturen"}
                </Knop>
              )}
            </>
          }
        >
          {klaar ? (
            <Melding type="succes" titel="Dank je wel">
              {klaar}
            </Melding>
          ) : (
            <>
              <Veld label="Wat is er onduidelijk of werkt niet?" hint="Een paar woorden is genoeg. Je hoeft je naam niet te noemen.">
                <Tekstvak
                  value={tekst}
                  onChange={(e) => setTekst(e.target.value)}
                  placeholder="Bijvoorbeeld: ik kan de knop 'opgave' niet vinden."
                  autoFocus
                />
              </Veld>
              {fout && <Melding type="fout">{fout}</Melding>}
              <p className="klein muted">
                Je melding komt bij de beheerder terecht met de naam van dit scherm. Je gegevens worden niet
                gedeeld met de AI-assistent.
              </p>
            </>
          )}
        </Modal>
      )}
      <span hidden>{gebruiker?.naam}</span>
    </>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { gebruiker, uitloggen, mag, moduleAan } = useAuth()
  const locatie = useLocation()

  const zichtbaar = NAV.filter((item) => {
    if (item.module && !moduleAan(item.module)) return false
    if (!item.recht) return true
    return mag(item.recht[0], item.recht[1])
  })

  const actief = (pad: string) =>
    pad === "/" ? locatie.pathname === "/" : locatie.pathname === pad || locatie.pathname.startsWith(`${pad}/`)

  return (
    <div className="app-shell">
      <aside className="zijbalk">
        <div className="zijbalk__merk">
          <img className="zijbalk__logo" src="/logo-diligence.jpg" alt="Stichting Diligence Almere" />
          <div className="zijbalk__naam">Beheersysteem</div>
        </div>

        <nav className="zijbalk__nav" aria-label="Hoofdmenu">
          {zichtbaar.map((item) => (
            <Link
              key={item.pad}
              to={item.pad}
              className={`nav-item${actief(item.pad) ? " is-actief" : ""}`}
              aria-current={actief(item.pad) ? "page" : undefined}
            >
              <span className="nav-item__stip" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="zijbalk__voet">
          <div>
            <strong>{gebruiker?.naam}</strong>
            {gebruiker?.rol}
          </div>
          <button type="button" onClick={() => void uitloggen()}>
            Uitloggen
          </button>
        </div>
      </aside>

      <div className="hoofd">
        <header className="topbalk">
          <div className="topbalk__taak">
            <strong>Hulp nodig?</strong> Gebruik de knop Hulp of vertel ons wat er beter kan.
          </div>
          <div className="topbalk__knoppen">
            <Link to="/hulp" className="knop knop--klein">
              Hulp
            </Link>
            <FeedbackKnop />
          </div>
        </header>
        <main className="inhoud" id="inhoud">
          {children}
        </main>
      </div>
    </div>
  )
}
