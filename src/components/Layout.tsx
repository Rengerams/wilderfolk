import { useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { useAuth } from "../auth"
import { api, foutTekst, initiaal } from "../api"
import { Icoon, type IcoonNaam } from "./Icons"
import { Knop, Melding, Modal, Tekstvak, Veld } from "./ui"

type NavItem = {
  pad: string
  label: string
  icoon: IcoonNaam
  groep: "Overzicht" | "Klanten" | "Evenementen" | "Financiën" | "Beheer"
  recht?: [string, "zien"]
  module?: string
}

const NAV: NavItem[] = [
  { pad: "/", label: "Vandaag", icoon: "vandaag", groep: "Overzicht" },
  { pad: "/start", label: "Aan de slag", icoon: "start", groep: "Overzicht" },
  { pad: "/rapportage", label: "Rapportage", icoon: "rapportage", groep: "Overzicht", recht: ["rapportage", "zien"] },
  { pad: "/assistent", label: "Assistent", icoon: "assistent", groep: "Overzicht", module: "ai_assistent" },
  { pad: "/deelnemers", label: "Deelnemers", icoon: "deelnemers", groep: "Klanten", recht: ["deelnemers", "zien"] },
  { pad: "/groepjes", label: "Groepjes", icoon: "groepjes", groep: "Klanten", recht: ["groepjes", "zien"] },
  { pad: "/programma", label: "Programma", icoon: "programma", groep: "Evenementen", recht: ["programma", "zien"] },
  { pad: "/opgave", label: "Beschikbaarheid", icoon: "opgave", groep: "Evenementen", recht: ["opgave", "zien"] },
  { pad: "/indeling", label: "Indeling", icoon: "indeling", groep: "Evenementen", recht: ["indeling", "zien"] },
  { pad: "/bellijst", label: "Bellijst", icoon: "bellijst", groep: "Evenementen", recht: ["reservelijst", "zien"] },
  {
    pad: "/declaraties",
    label: "Declaraties",
    icoon: "declaraties",
    groep: "Financiën",
    recht: ["declaraties", "zien"],
    module: "chauffeurskosten",
  },
  { pad: "/kas", label: "Kas", icoon: "kas", groep: "Financiën", recht: ["kas", "zien"], module: "kas" },
  { pad: "/gebruikers", label: "Gebruikers", icoon: "gebruikers", groep: "Beheer", recht: ["gebruikers", "zien"] },
  { pad: "/rollen", label: "Rollen", icoon: "rollen", groep: "Beheer", recht: ["rollen", "zien"] },
  { pad: "/modules", label: "Functies", icoon: "functies", groep: "Beheer", recht: ["modules", "zien"] },
  { pad: "/logboek", label: "Logboek", icoon: "logboek", groep: "Beheer", recht: ["logboek", "zien"] },
  { pad: "/feedback", label: "Feedback", icoon: "feedback", groep: "Beheer", recht: ["feedback", "zien"] },
  { pad: "/hulp", label: "Hulp", icoon: "hulp", groep: "Beheer" },
]

const GROEPEN = ["Overzicht", "Klanten", "Evenementen", "Financiën", "Beheer"] as const

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
      <Knop variant="rustig" className="knop--met-icoon" onClick={() => setOpen(true)}>
        <Icoon naam="feedback" />
        Feedback geven
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

  const huidig =
    NAV.find((item) => actief(item.pad) && zichtbaar.includes(item)) ??
    (locatie.pathname.startsWith("/uitje") ? NAV.find((item) => item.pad === "/programma") : undefined)

  return (
    <div className="app-shell">
      <aside className="zijbalk">
        <div className="zijbalk__merk">
          <img className="zijbalk__logo" src="/logo-diligence.jpg" alt="Stichting Diligence Almere" />
          <div className="zijbalk__naam">Beheersysteem</div>
        </div>

        <nav className="zijbalk__nav" aria-label="Hoofdmenu">
          {GROEPEN.map((groep) => {
            const items = zichtbaar.filter((item) => item.groep === groep)
            if (items.length === 0) return null
            return (
              <div className="nav-groep" key={groep}>
                <p className="nav-groep__titel">{groep}</p>
                {items.map((item) => (
                  <Link
                    key={item.pad}
                    to={item.pad}
                    className={`nav-item${actief(item.pad) ? " is-actief" : ""}`}
                    aria-current={actief(item.pad) ? "page" : undefined}
                  >
                    <Icoon naam={item.icoon} className="nav-item__icoon" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="zijbalk__voet">
          <div className="gebruiker-kaart">
            <span className="avatar" aria-hidden="true">
              {gebruiker ? initiaal(gebruiker.naam) : "?"}
            </span>
            <div className="gebruiker-kaart__tekst">
              <strong>{gebruiker?.naam}</strong>
              <span>{gebruiker?.rol}</span>
            </div>
          </div>
          <button type="button" className="gebruiker-kaart__uitlog" onClick={() => void uitloggen()}>
            <Icoon naam="uitloggen" />
            Uitloggen
          </button>
        </div>
      </aside>

      <div className="hoofd">
        <header className="topbalk">
          <div className="topbalk__kruimel">
            <span>Beheersysteem</span>
            <strong>{huidig?.label ?? "Vandaag"}</strong>
          </div>
          <div className="topbalk__knoppen">
            <Link to="/hulp" className="knop knop--klein knop--met-icoon">
              <Icoon naam="hulp" />
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
