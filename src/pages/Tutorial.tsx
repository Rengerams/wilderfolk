import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { Badge, Kaart, Knop, PaginaKop } from "../components/ui"

const SLEUTEL = "diligence-tutorial-voortgang"

type Stap = {
  id: string
  titel: string
  uitleg: string
  link: string
  knop: string
  recht?: [string, "zien"]
  module?: string
}

const STAPPEN: Stap[] = [
  {
    id: "rondkijken",
    titel: "Kijk rustig rond op Vandaag",
    uitleg: "Het eerste scherm laat zien wat nu het belangrijkste is. Je hoeft nog niets te doen.",
    link: "/",
    knop: "Naar Vandaag",
  },
  {
    id: "deelnemer",
    titel: "Zoek een deelnemer op",
    uitleg: "Typ een paar letters van de naam of een telefoonnummer. Je ziet meteen wie het is, ook bij een typefout.",
    link: "/deelnemers",
    knop: "Deelnemers openen",
    recht: ["deelnemers", "zien"],
  },
  {
    id: "programma",
    titel: "Bekijk het programma",
    uitleg: "Hier staan de periodes en de uitjes: datum, tijd, prijs en het aantal plekken.",
    link: "/programma",
    knop: "Programma openen",
    recht: ["programma", "zien"],
  },
  {
    id: "opgave",
    titel: "Voer een opgave in",
    uitleg: "Tijdens de opgaveperiode noteer je hier de telefoontjes. De bevestigingsregel lees je voor aan de telefoon.",
    link: "/opgave",
    knop: "Opgave openen",
    recht: ["opgave", "zien"],
  },
  {
    id: "indeling",
    titel: "Bekijk de eerlijke indeling",
    uitleg: "Per deelnemer staat uitgelegd waarom iemand wel of niet meegaat. Jij houdt de regie en kunt bijsturen.",
    link: "/indeling",
    knop: "Indeling openen",
    recht: ["indeling", "zien"],
  },
  {
    id: "bellen",
    titel: "Werk de bellijst af",
    uitleg: "De boodschap staat klaar om voor te lezen. Na elk gesprek klik je op 'Gebeld' of 'Niet bereikt'.",
    link: "/bellijst",
    knop: "Bellijst openen",
    recht: ["reservelijst", "zien"],
  },
  {
    id: "kosten",
    titel: "Dien je kosten in",
    uitleg: "Rijd je mee als chauffeur? Vul het bedrag in en maak een foto van de bon. De penningmeester keurt goed.",
    link: "/declaraties",
    knop: "Declaraties openen",
    recht: ["declaraties", "zien"],
    module: "chauffeurskosten",
  },
  {
    id: "hulp",
    titel: "Weet waar je hulp vindt",
    uitleg: "Bij Hulp staan korte stappenplannen per taak. Loopt je ergens vast? Gebruik de feedbackknop rechtsboven.",
    link: "/hulp",
    knop: "Naar Hulp",
  },
]

const STROOM: { nummer: number; titel: string; uitleg: string; link: string; recht?: [string, "zien"] }[] = [
  {
    nummer: 1,
    titel: "Programma klaarzetten",
    uitleg: "Periode, uitjes en de aanmelddeadline vastleggen.",
    link: "/programma",
    recht: ["programma", "zien"],
  },
  {
    nummer: 2,
    titel: "Opgave aan de telefoon",
    uitleg: "Tijdens het gesprek invullen wie er meegaat.",
    link: "/opgave",
    recht: ["opgave", "zien"],
  },
  {
    nummer: 3,
    titel: "Indeling bevestigen",
    uitleg: "Eerlijk verdeeld, met uitleg per deelnemer.",
    link: "/indeling",
    recht: ["indeling", "zien"],
  },
  {
    nummer: 4,
    titel: "Bellen en afronden",
    uitleg: "Bellijst afwerken en het uitje afsluiten.",
    link: "/bellijst",
    recht: ["reservelijst", "zien"],
  },
]

const ROLLEN: { rol: string; uitleg: string; punten: string[] }[] = [
  {
    rol: "Beheerder",
    uitleg: "Houdt het systeem en de gegevens op orde.",
    punten: [
      "Beheert deelnemers, groepjes en het programma.",
      "Nodigt vrijwilligers uit en stelt hun rechten in.",
      "Zet modules aan of uit, zoals Chauffeurskosten en Kas.",
    ],
  },
  {
    rol: "Coördinator",
    uitleg: "Regelt de opgave, de indeling en de belronde.",
    punten: [
      "Voert opgaven in aan de telefoon.",
      "Berekent en bevestigt de eerlijke indeling.",
      "Werkt de bellijst en de reservelijst af.",
    ],
  },
  {
    rol: "Chauffeur",
    uitleg: "Rijdt mee en declareert de onkosten.",
    punten: [
      "Ziet alleen de uitjes waarvoor je bent ingedeeld.",
      "Dient brandstof, parkeren en andere kosten in.",
      "Volgt de status van de declaratie.",
    ],
  },
  {
    rol: "Penningmeester",
    uitleg: "Controleert de geldzaken.",
    punten: [
      "Beoordeelt en keurt declaraties goed.",
      "Sluit de kas af per uitje.",
      "Ziet het saldo contant geld op kantoor.",
    ],
  },
  {
    rol: "Admin",
    uitleg: "Beheert alles, inclusief rollen en rechten.",
    punten: [
      "Doet alles wat een beheerder doet.",
      "Maakt rollen en rechten op maat.",
      "Ziet het volledige wijzigingenlogboek.",
    ],
  },
]

export function Tutorial() {
  const { gebruiker, mag, moduleAan } = useAuth()

  const [gedaan, setGedaan] = useState<string[]>(() => {
    try {
      const opgeslagen = window.localStorage.getItem(SLEUTEL)
      return opgeslagen ? (JSON.parse(opgeslagen) as string[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(SLEUTEL, JSON.stringify(gedaan))
    } catch {
      // Voortgang bewaren is een extraatje; het scherm werkt ook zonder.
    }
  }, [gedaan])

  const zichtbaar = (recht?: [string, "zien"], module?: string) =>
    (!module || moduleAan(module)) && (!recht || mag(recht[0], recht[1]))

  const stappen = STAPPEN.filter((stap) => zichtbaar(stap.recht, stap.module))
  const stroom = STROOM.filter((stap) => zichtbaar(stap.recht))
  const afgevinkt = stappen.filter((stap) => gedaan.includes(stap.id)).length
  const klaar = stappen.length > 0 && afgevinkt === stappen.length

  function wissel(id: string) {
    setGedaan((huidig) =>
      huidig.includes(id) ? huidig.filter((item) => item !== id) : [...huidig, id],
    )
  }

  return (
    <div>
      <PaginaKop
        titel="Aan de slag"
        stap="Volg de stappen hieronder in volgorde."
        uitleg="Nieuw in het systeem? In een paar minuten weet je hoe het werkt en wat je eerste stappen zijn."
        acties={
          <Link className="knop knop--primair" to="/">
            Naar Vandaag
          </Link>
        }
      />

      <Kaart
        titel="Wat doet dit systeem?"
        uitleg="Alles voor de uitjes van Stichting Diligence staat op één plek. Deelnemers, het programma, de opgave aan de telefoon en de eerlijke indeling."
      >
        <p>
          Een periode loopt altijd hetzelfde: eerst zet je het programma klaar, dan nemen vrijwilligers de opgaven
          aan de telefoon aan, daarna rekent het systeem een eerlijke indeling uit en tot slot bel je iedereen met de
          uitslag. De deelnemers zelf hebben geen inlog; jij voert alles namens hen in.
        </p>
        <ol className="stroom grid-4">
          {stroom.map((stap) => (
            <li key={stap.nummer}>
              <Link className="stroom-stap" to={stap.link}>
                <span className="stroom-stap__nummer" aria-hidden="true">{stap.nummer}</span>
                <span className="stroom-stap__titel">{stap.titel}</span>
                <span className="stroom-stap__uitleg">{stap.uitleg}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Kaart>

      <Kaart
        titel="Je eerste stappen"
        uitleg="Vink af wat je al gedaan hebt. Je voortgang wordt op dit apparaat bewaard."
        acties={
          <div className="tutorial-voortgang">
            <Badge toon={klaar ? "goed" : "info"}>
              {klaar ? "Alles gedaan" : `${afgevinkt} van ${stappen.length} gedaan`}
            </Badge>
            {afgevinkt > 0 && (
              <Knop variant="rustig" onClick={() => setGedaan([])}>
                Voortgang wissen
              </Knop>
            )}
          </div>
        }
      >
        <ul className="tutorial-stappen">
          {stappen.map((stap) => {
            const isGedaan = gedaan.includes(stap.id)
            return (
              <li key={stap.id} className="tutorial-stap">
                <input
                  type="checkbox"
                  id={`stap-${stap.id}`}
                  checked={isGedaan}
                  onChange={() => wissel(stap.id)}
                />
                <div className="tutorial-stap__tekst">
                  <label className="tutorial-stap__titel" htmlFor={`stap-${stap.id}`}>
                    {stap.titel}
                  </label>
                  <p className="tutorial-stap__uitleg">{stap.uitleg}</p>
                </div>
                <Link className="knop knop--klein" to={stap.link}>
                  {stap.knop}
                </Link>
              </li>
            )
          })}
        </ul>
      </Kaart>

      <Kaart
        titel="Wat past bij jouw rol?"
        uitleg="Je ziet alleen de onderdelen die bij jouw rechten horen. Dit is wat elke rol ongeveer doet."
      >
        <div className="grid-2">
          {ROLLEN.map((rol) => (
            <section
              key={rol.rol}
              className={`rol-kaart${gebruiker?.rol === rol.rol ? " is-jouw-rol" : ""}`}
            >
              <div className="rol-kaart__kop">
                <h3>{rol.rol}</h3>
                {gebruiker?.rol === rol.rol && <Badge toon="goed">Jouw rol</Badge>}
              </div>
              <p className="klein muted">{rol.uitleg}</p>
              <ul className="rol-kaart__lijst">
                {rol.punten.map((punt) => (
                  <li key={punt}>{punt}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Kaart>

      <Kaart titel="Goed om te weten">
        <ul className="rol-kaart__lijst">
          <li>Deelnemers hebben geen inlog. Jij voert namens hen alles in.</li>
          <li>Niets wordt zomaar verwijderd. Deelnemers die stoppen worden gearchiveerd.</li>
          <li>Elke wijziging wordt bewaard in het logboek, met datum en naam.</li>
          <li>Grote knoppen en gewone taal, op een laptop, tablet en telefoon.</li>
        </ul>
        <p className="klein muted">
          Meer uitleg per taak? Bekijk <Link to="/hulp">Hulp</Link>. Werkt iets niet goed? Gebruik de knop
          rechtsboven om het ons te laten weten.
        </p>
      </Kaart>
    </div>
  )
}
