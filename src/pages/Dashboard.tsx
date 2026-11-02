import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import { Icoon } from "../components/Icons"
import { Badge, Kaart, Laad, Melding, Stat, Tabel } from "../components/ui"
import { datumKort, datumLang, datumNumeriek, tijd } from "../lib/format"

type AankomendUitje = {
  id: number
  datum: string
  begin_tijd: string | null
  omschrijving: string
  capaciteit: number
  geplaatst: number
}

type DashboardData = {
  taak: { titel: string; uitleg: string; link: string; knop: string } | null
  periode: { id: number; naam: string; aanmelddeadline: string; status: string } | null
  aankomendeUitjes: AankomendUitje[]
  recenteWijzigingen: { tijd: string; gebruiker_naam: string; omschrijving: string }[]
  cijfers: {
    deelnemers: number
    uitjes: number
    opgaven: number
    teBellen: number
    declaratiesTeBeoordelen: number
    nieuweFeedback: number
  }
  vandaag: string
}

export function Dashboard() {
  const { gebruiker, mag, moduleAan } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [mijnUitjes, setMijnUitjes] = useState<
    { id: number; datum: string; omschrijving: string; voertuig_naam: string }[]
  >([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    async function haal() {
      try {
        const antwoord = await api<DashboardData>("/dashboard")
        setData(antwoord)
        if (gebruiker?.rol === "Chauffeur" && moduleAan("chauffeurskosten")) {
          const uitjes = await api<{ uitjes: typeof mijnUitjes }>("/declaraties/mijn-uitjes")
          setMijnUitjes(uitjes.uitjes)
        }
      } catch (e) {
        setFout(foutTekst(e))
      } finally {
        setLaden(false)
      }
    }
    void haal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (laden) return <Laad />
  if (fout) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  const aandacht: { icoon: "bellijst" | "declaraties" | "feedback"; titel: string; uitleg: string; link: string; label: string }[] = []
  if (data.cijfers.teBellen > 0) {
    aandacht.push({
      icoon: "bellijst",
      titel: `${data.cijfers.teBellen} mensen wachten op een belletje`,
      uitleg: "Werk de bellijst af en noteer wat er is afgesproken.",
      link: data.periode ? `/bellijst?periode=${data.periode.id}` : "/bellijst",
      label: "Naar de bellijst",
    })
  }
  if (data.cijfers.declaratiesTeBeoordelen > 0 && moduleAan("chauffeurskosten")) {
    aandacht.push({
      icoon: "declaraties",
      titel: `${data.cijfers.declaratiesTeBeoordelen} declaraties te beoordelen`,
      uitleg: "Chauffeurs wachten op goedkeuring van hun onkosten.",
      link: "/declaraties",
      label: "Beoordelen",
    })
  }
  if (data.cijfers.nieuweFeedback > 0) {
    aandacht.push({
      icoon: "feedback",
      titel: `${data.cijfers.nieuweFeedback} nieuwe feedbackmeldingen`,
      uitleg: "Vrijwilligers vertellen wat er beter kan.",
      link: "/feedback",
      label: "Bekijken",
    })
  }

  return (
    <div>
      <section className="hero">
        <div className="hero__tekst">
          <p className="hero__datum">{datumLang(data.vandaag)}</p>
          <h1>Welkom{gebruiker ? `, ${gebruiker.naam.split(" ")[0]}` : ""}</h1>
          <p>Hier zie je wat er vandaag speelt.</p>
        </div>
        <div className="hero__acties">
          {mag("deelnemers", "zien") && (
            <Link className="knop knop--primair knop--met-icoon" to="/deelnemers">
              <Icoon naam="zoeken" />
              Deelnemer zoeken
            </Link>
          )}
        </div>
      </section>

      <div className="kpi-grid">
        <Stat icoon="deelnemers" waarde={data.cijfers.deelnemers} label="actieve deelnemers" toon="rood" />
        <Stat icoon="programma" waarde={data.cijfers.uitjes} label="uitjes in deze periode" toon="blauw" />
        <Stat icoon="opgave" waarde={data.cijfers.opgaven} label="opgaven vastgelegd" toon="groen" />
        <Stat icoon="bellijst" waarde={data.cijfers.teBellen} label="mensen op de bellijst" toon="amber" />
      </div>

      <Kaart titel="Snel aan de slag" uitleg="De taken die het vaakst voorkomen.">
        <div className="snelraster">
          {mag("opgave", "aanmaken") && (
            <Link className="sneltegel" to="/opgave">
              <span className="sneltegel__icoon"><Icoon naam="opgave" /></span>
              <span><strong>Beschikbaarheid invoeren</strong><span>Beschikbaarheid per telefoon doorgeven</span></span>
              <Icoon naam="pijl" />
            </Link>
          )}
          {mag("indeling", "zien") && (
            <Link className="sneltegel" to="/indeling">
              <span className="sneltegel__icoon"><Icoon naam="indeling" /></span>
              <span><strong>Eerlijke indeling</strong><span>Voorstel berekenen en uitleg per plek</span></span>
              <Icoon naam="pijl" />
            </Link>
          )}
          {mag("reservelijst", "zien") && (
            <Link className="sneltegel" to="/bellijst">
              <span className="sneltegel__icoon"><Icoon naam="bellijst" /></span>
              <span><strong>Bellijst</strong><span>Wie bellen we over de uitslag?</span></span>
              <Icoon naam="pijl" />
            </Link>
          )}
          {mag("deelnemers", "zien") && (
            <Link className="sneltegel" to="/deelnemers">
              <span className="sneltegel__icoon"><Icoon naam="deelnemers" /></span>
              <span><strong>Deelnemers</strong><span>Zoeken, bellen en geschiedenis zien</span></span>
              <Icoon naam="pijl" />
            </Link>
          )}
        </div>
      </Kaart>

      {gebruiker?.rol === "Chauffeur" && (
        <Kaart titel="Mijn uitjes" uitleg="Je ziet alleen de uitjes waarvoor jij als chauffeur staat ingedeeld.">
          {mijnUitjes.length === 0 ? (
            <p className="muted">Er staan nog geen uitjes voor je klaar.</p>
          ) : (
            <Tabel kolommen={["Datum", "Uitje", "Voertuig", ""]}>
              {mijnUitjes.map((uitje) => (
                <tr key={`${uitje.id}-${uitje.voertuig_naam}`}>
                  <td className="nu">{datumNumeriek(uitje.datum)}</td>
                  <td>{uitje.omschrijving}</td>
                  <td>{uitje.voertuig_naam}</td>
                  <td className="rechts">
                    <Link className="knop knop--klein" to={`/declaraties?uitje=${uitje.id}`}>
                      Kosten invoeren
                    </Link>
                  </td>
                </tr>
              ))}
            </Tabel>
          )}
        </Kaart>
      )}

      <div className="dashboard-kolommen">
        <Kaart
          titel="Aankomende uitjes"
          uitleg={data.periode ? `Periode: ${data.periode.naam}` : "Er is nog geen actieve periode."}
          acties={
            mag("programma", "zien") ? (
              <Link className="knop knop--klein" to={data.periode ? `/programma/${data.periode.id}` : "/programma"}>
                Volledig programma
              </Link>
            ) : undefined
          }
        >
          {data.aankomendeUitjes.length === 0 ? (
            <p className="muted">Er staan nog geen uitjes gepland.</p>
          ) : (
            <div className="agenda">
              {data.aankomendeUitjes.map((uitje) => {
                const [dag, maand] = datumKort(uitje.datum).split(" ")
                const bezet = uitje.capaciteit > 0 ? Math.round((uitje.geplaatst / uitje.capaciteit) * 100) : 0
                return (
                  <Link className="agenda__item" key={uitje.id} to={`/uitje/${uitje.id}`}>
                    <span className="agenda__datum" aria-hidden="true">
                      <strong>{dag}</strong>
                      <span>{maand}</span>
                    </span>
                    <span className="agenda__body">
                      <strong className="agenda__titel">{uitje.omschrijving}</strong>
                      <span className="agenda__meta">
                        <Icoon naam="klok" />
                        {tijd(uitje.begin_tijd, null) || "Tijd volgt"}
                        {" · "}
                        {uitje.geplaatst}/{uitje.capaciteit} plekken bezet
                      </span>
                      {uitje.geplaatst > 0 && (
                        <span className="vulling" aria-hidden="true">
                          <span className="vulling__balk" style={{ width: `${Math.min(100, bezet)}%` }} />
                        </span>
                      )}
                    </span>
                    <Icoon naam="pijl" className="agenda__pijl" />
                  </Link>
                )
              })}
            </div>
          )}
        </Kaart>

        <div>
          <Kaart titel="Wat vraagt aandacht" uitleg="Prioriteit">
            {aandacht.length === 0 ? (
              <p className="muted">Niets blijft liggen. Mooi werk.</p>
            ) : (
              <div className="aandacht">
                {aandacht.map((punt) => (
                  <Link className="aandacht__item" key={punt.titel} to={punt.link}>
                    <span className="aandacht__icoon" aria-hidden="true">
                      <Icoon naam={punt.icoon} />
                    </span>
                    <span>
                      <strong>{punt.titel}</strong>
                      <span className="aandacht__uitleg">{punt.uitleg}</span>
                    </span>
                    <Badge toon="waarschuwing">Nu</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Kaart>

          {data.recenteWijzigingen.length > 0 && (
            <Kaart titel="Recente activiteit" acties={<Link className="knop knop--klein" to="/logboek">Alles</Link>}>
              <ul className="activiteit">
                {data.recenteWijzigingen.map((rij, index) => (
                  <li className="activiteit__item" key={index}>
                    <span className="activiteit__stip" aria-hidden="true" />
                    <div>
                      <strong>{rij.gebruiker_naam}</strong>
                      <p>{rij.omschrijving}</p>
                      <span className="klein muted">{datumNumeriek(rij.tijd)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Kaart>
          )}
        </div>
      </div>

    </div>
  )
}
