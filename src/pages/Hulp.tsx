import { Kaart, PaginaKop } from "../components/ui"

const TAKEN: { titel: string; intro: string; stappen: string[] }[] = [
  {
    titel: "Een opgave aan de telefoon invoeren",
    intro: "Dit is het scherm dat je tijdens de opgaveperiode het meest gebruikt.",
    stappen: [
      "Open links het onderdeel Opgave.",
      "Typ een paar letters van de naam of het telefoonnummer. De juiste deelnemer verschijnt al tijdens het typen.",
      "Klik op 'Deze deelnemer'.",
      "Vink de uitjes aan waarvoor de deelnemer meegaat. Gaat het om alle data van hetzelfde uitje? Vink dan 'Alle data van deze reeks' aan.",
      "Laat 'Met groepje' staan, tenzij de deelnemer deze keer alleen gaat.",
      "Controleer de bevestigingsregel en lees die voor aan de telefoon.",
      "Klaar? Klik op 'Opgave opslaan'. Met 'Ongedaan maken' kun je een fout meteen herstellen.",
    ],
  },
  {
    titel: "Een nieuwe periode en het programma klaarzetten",
    intro: "Een periode duurt meestal twee maanden.",
    stappen: [
      "Open Programma en klik op 'Nieuwe periode'.",
      "Vul de eerste en laatste dag in en de aanmelddeadline.",
      "Open de periode en voeg uitjes toe, of importeer het programmabestand.",
      "Controleer de uitjes: datum, tijd, prijs, plekken en extra kosten.",
      "Klik op 'Opgave openen' als het programma klopt. Daarna kunnen opgaven worden ingevoerd.",
    ],
  },
  {
    titel: "Het programmabestand importeren uit Excel of CSV",
    intro: "Je hoeft het programma niet opnieuw te typen.",
    stappen: [
      "Open de periode en klik op 'Importeren uit Excel'.",
      "Kies het bestand. Een maandkop als NOVEMBER en regels als 'ma 02' en '10:30-14:30' worden herkend.",
      "Vul de standaard capaciteit in voor rijen zonder plekken.",
      "Klik op 'Bestand controleren'. Je ziet precies welke uitjes herkend zijn en welke regels een fout hebben.",
      "Klopt het aantal? Bevestig dan. De hele import is daarna in één keer ongedaan te maken.",
      "Download het lege sjabloon als je de volgende periode op dezelfde manier wilt klaarzetten.",
    ],
  },
  {
    titel: "De eerlijke indeling maken en bevestigen",
    intro: "Dit kan pas als de opgave gesloten is.",
    stappen: [
      "Sluit de opgave bij het programma. De deadline is dan verstreken.",
      "Open Indeling en kies de periode.",
      "Klik op 'Voorstel berekenen'. Er wordt nog niemand bevestigd of gebeld.",
      "Bekijk per uitje wie er geplaatst is en waarom. Gebruik 'Waarom?' voor de uitleg van het systeem.",
      "Klopt er iets niet? Pas de status aan. Het systeem waarschuwt bij overvolle uitjes, maar blokkeert niet.",
      "Bekijk de verschillen tussen het systeem en je handmatige keuzes.",
      "Klik op 'Indeling bevestigen'. Daarna worden de bellijst en de e-mails klaargezet.",
    ],
  },
  {
    titel: "Hoe het systeem kiest bij de indeling",
    intro: "Deze volgorde staat vast en is door de opdrachtgever bevestigd.",
    stappen: [
      'Een specifieke opgave gaat voor een opgave "alle uitjes".',
      "Wie nog geen twee uitjes heeft gehad, krijgt voorrang; de garantie geldt over de hele periode.",
      "Wie in de laatste 12 maanden vaker meeging, staat achteraan.",
      "Bij een gelijke stand gaat voor wie het langst niet meeging; daarna beslist een vaste loting.",
      "Een groepje wordt altijd als geheel geplaatst of als geheel op de reservelijst gezet.",
      "Bij een reeks gaat de deelnemer naar de datum met de meeste ruimte.",
      "Je kunt elke plek met de hand aanpassen. Het systeem waarschuwt bij overvolle uitjes of een gesplitst groepje, maar blokkeert nooit.",
    ],
  },
  {
    titel: "De bellijst afwerken",
    intro: "De meeste deelnemers worden gebeld over de uitslag.",
    stappen: [
      "Open Bellijst en kies de periode.",
      "Bel de bovenste persoon. De boodschap staat klaar om voor te lezen.",
      "Klik op 'Gebeld' of 'Niet bereikt'.",
      "Staat iemand op de reservelijst? Kies 'Komt mee', 'Kan niet' of 'Niet bereikt'. Bij 'Kan niet' komt de volgende reservist bovenaan.",
      "Werk de lijst af tot er niemand meer op 'nog te bellen' staat.",
    ],
  },
  {
    titel: "Kosten declareren als chauffeur",
    intro: "Dit kan alleen als de module Chauffeurskosten aan staat.",
    stappen: [
      "Open Declaraties. Je ziet alleen je eigen uitjes.",
      "Kies het uitje, vul het bedrag en de soort kosten in.",
      "Maak eventueel een foto van de bon met je telefoon.",
      "Klik op 'Kosten indienen'. De penningmeester keurt goed.",
      "Zolang de declaratie nog niet beoordeeld is, kun je hem aanpassen of intrekken.",
    ],
  },
  {
    titel: "Iets onduidelijk of werkt het niet goed?",
    intro: "Elke vrijwilliger kan direct feedback geven.",
    stappen: [
      "Klik rechtsboven op 'Iets onduidelijk of werkt het niet goed? Vertel het ons'.",
      "Typ in een paar woorden wat er aan de hand is.",
      "Verstuur de melding. Het scherm waar je stond wordt automatisch meegestuurd.",
      "De beheerder ziet de melding bij Feedback en zet hem op 'in behandeling' of 'afgehandeld'.",
    ],
  },
]

export function Hulp() {
  return (
    <div>
      <PaginaKop
        titel="Hulp"
        stap="Kies hieronder de taak waarvoor je hulp nodig hebt."
        uitleg="Korte stappenplannen voor de belangrijkste taken. Geen jargon, gewoon wat je moet doen."
      />
      {TAKEN.map((taak) => (
        <Kaart key={taak.titel} titel={taak.titel} uitleg={taak.intro}>
          <ol className="stappen">
            {taak.stappen.map((stap) => (
              <li key={stap}>{stap}</li>
            ))}
          </ol>
        </Kaart>
      ))}
      <Kaart titel="Toetsenbord en telefoon">
        <p>
          Je kunt dit systeem gebruiken op een laptop, tablet en telefoon. Er is geen aparte app nodig. Alles werkt
          in de browser. De knoppen zijn groot genoeg om met één hand te bedienen.
        </p>
        <p className="klein muted">
          Werkt iets niet zoals beschreven? Gebruik dan de feedbackknop rechtsboven. Dan kunnen we het samen
          verbeteren.
        </p>
      </Kaart>
    </div>
  )
}
