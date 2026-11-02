import { useState } from "react"
import type { Deelnemer } from "../types"
import { Invoer, Knop, Select, Tekstvak, Veld } from "./ui"

export type DeelnemerVelden = {
  voornaam: string
  tussenvoegsel: string
  achternaam: string
  telefoon: string
  telefoon_alt: string
  email: string
  contactvoorkeur: string
  straat: string
  huisnummer: string
  postcode: string
  plaats: string
  opmerkingen: string
  mobiliteit: string[]
  heeft_mk: boolean
  heeft_vl: boolean
  noodcontact_naam: string
  noodcontact_telefoon: string
  status: string
}

const MOBILITEIT = ["rollator", "rolstoel", "hulp bij instappen"]

export function legeVelden(): DeelnemerVelden {
  return {
    voornaam: "", tussenvoegsel: "", achternaam: "", telefoon: "", telefoon_alt: "",
    email: "", contactvoorkeur: "telefoon", straat: "", huisnummer: "", postcode: "",
    plaats: "Almere", opmerkingen: "", mobiliteit: [], heeft_mk: false, heeft_vl: false,
    noodcontact_naam: "", noodcontact_telefoon: "", status: "actief",
  }
}

export function veldenVan(deelnemer: Deelnemer): DeelnemerVelden {
  return {
    voornaam: deelnemer.voornaam,
    tussenvoegsel: deelnemer.tussenvoegsel ?? "",
    achternaam: deelnemer.achternaam,
    telefoon: deelnemer.telefoon ?? "",
    telefoon_alt: deelnemer.telefoon_alt ?? "",
    email: deelnemer.email ?? "",
    contactvoorkeur: deelnemer.contactvoorkeur,
    straat: deelnemer.straat ?? "",
    huisnummer: deelnemer.huisnummer ?? "",
    postcode: deelnemer.postcode ?? "",
    plaats: deelnemer.plaats ?? "",
    opmerkingen: deelnemer.opmerkingen ?? "",
    mobiliteit: deelnemer.mobiliteit ?? [],
    heeft_mk: deelnemer.heeft_mk,
    heeft_vl: deelnemer.heeft_vl,
    noodcontact_naam: deelnemer.noodcontact_naam ?? "",
    noodcontact_telefoon: deelnemer.noodcontact_telefoon ?? "",
    status: deelnemer.status,
  }
}

export function DeelnemerForm({
  begin,
  opslaan,
  annuleer,
  bezig,
  bewerk,
}: {
  begin?: DeelnemerVelden
  opslaan: (velden: DeelnemerVelden) => void
  annuleer: () => void
  bezig?: boolean
  bewerk?: boolean
}) {
  const [velden, setVelden] = useState<DeelnemerVelden>(begin ?? legeVelden())

  function zet<K extends keyof DeelnemerVelden>(sleutel: K, waarde: DeelnemerVelden[K]) {
    setVelden((huidig) => ({ ...huidig, [sleutel]: waarde }))
  }

  function wisselMobiliteit(optie: string) {
    zet(
      "mobiliteit",
      velden.mobiliteit.includes(optie)
        ? velden.mobiliteit.filter((m) => m !== optie)
        : [...velden.mobiliteit, optie],
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        opslaan(velden)
      }}
    >
      <div className="grid-2">
        <Veld label="Voornaam" verplicht>
          <Invoer value={velden.voornaam} onChange={(e) => zet("voornaam", e.target.value)} required autoFocus />
        </Veld>
        <Veld label="Achternaam" verplicht>
          <Invoer value={velden.achternaam} onChange={(e) => zet("achternaam", e.target.value)} required />
        </Veld>
      </div>
      <Veld label="Tussenvoegsel" hint="Bijvoorbeeld 'de' of 'van den'.">
        <Invoer value={velden.tussenvoegsel} onChange={(e) => zet("tussenvoegsel", e.target.value)} />
      </Veld>

      <div className="grid-2">
        <Veld label="Telefoonnummer" hint="Het nummer waarop we bellen.">
          <Invoer type="tel" value={velden.telefoon} onChange={(e) => zet("telefoon", e.target.value)} />
        </Veld>
        <Veld label="Tweede telefoonnummer" hint="Bijvoorbeeld van een familielid.">
          <Invoer type="tel" value={velden.telefoon_alt} onChange={(e) => zet("telefoon_alt", e.target.value)} />
        </Veld>
      </div>

      <div className="grid-2">
        <Veld label="E-mailadres">
          <Invoer type="email" value={velden.email} onChange={(e) => zet("email", e.target.value)} />
        </Veld>
        <Veld label="Hoe wil deze deelnemer bericht krijgen?" hint="Standaard bellen; dat werkt voor de meeste deelnemers.">
          <Select value={velden.contactvoorkeur} onChange={(e) => zet("contactvoorkeur", e.target.value)}>
            <option value="telefoon">Bellen</option>
            <option value="email">E-mail</option>
            <option value="beide">Bellen én e-mail</option>
          </Select>
        </Veld>
      </div>

      <h3 className="sectie-titel">Woonadres</h3>
      <div className="grid-2">
        <Veld label="Straat">
          <Invoer value={velden.straat} onChange={(e) => zet("straat", e.target.value)} />
        </Veld>
        <Veld label="Huisnummer">
          <Invoer value={velden.huisnummer} onChange={(e) => zet("huisnummer", e.target.value)} />
        </Veld>
        <Veld label="Postcode">
          <Invoer value={velden.postcode} onChange={(e) => zet("postcode", e.target.value)} />
        </Veld>
        <Veld label="Plaats">
          <Invoer value={velden.plaats} onChange={(e) => zet("plaats", e.target.value)} />
        </Veld>
      </div>

      <h3 className="sectie-titel">Meegaat gemakkelijker met</h3>
      <div className="rij marge-boven--klein">
        {MOBILITEIT.map((optie) => (
          <label key={optie} className="vinkje">
            <input
              type="checkbox"
              checked={velden.mobiliteit.includes(optie)}
              onChange={() => wisselMobiliteit(optie)}
            />
            {optie.charAt(0).toUpperCase() + optie.slice(1)}
          </label>
        ))}
      </div>
      <p className="klein muted marge-boven--klein">
        Dit is een vast gegeven, zodat de indeling en het vervoer er rekening mee kunnen houden.
      </p>

      <h3 className="sectie-titel">Kortingskaarten</h3>
      <div className="rij marge-boven--klein">
        <label className="vinkje">
          <input type="checkbox" checked={velden.heeft_mk} onChange={(e) => zet("heeft_mk", e.target.checked)} />
          Museumkaart (MK)
        </label>
        <label className="vinkje">
          <input type="checkbox" checked={velden.heeft_vl} onChange={(e) => zet("heeft_vl", e.target.checked)} />
          VIP-kaart loterij (VL)
        </label>
      </div>

      <h3 className="sectie-titel">Noodcontact</h3>
      <div className="grid-2">
        <Veld label="Naam contactpersoon">
          <Invoer value={velden.noodcontact_naam} onChange={(e) => zet("noodcontact_naam", e.target.value)} />
        </Veld>
        <Veld label="Telefoonnummer contactpersoon">
          <Invoer type="tel" value={velden.noodcontact_telefoon} onChange={(e) => zet("noodcontact_telefoon", e.target.value)} />
        </Veld>
      </div>

      <Veld label="Opmerkingen" hint="Bijvoorbeeld: slecht ter been, houdt van muziek. Alleen zichtbaar voor wie deelnemers mag zien.">
        <Tekstvak value={velden.opmerkingen} onChange={(e) => zet("opmerkingen", e.target.value)} />
      </Veld>

      <Veld label="Status" hint="Stop nooit hard verwijderen: zet de status op gestopt. De bezoekgeschiedenis blijft dan kloppen.">
        <Select value={velden.status} onChange={(e) => zet("status", e.target.value)}>
          <option value="actief">Actief</option>
          <option value="gepauzeerd">Tijdelijk gepauzeerd</option>
          <option value="gestopt">Gestopt</option>
        </Select>
      </Veld>

      <div className="rij" style={{ justifyContent: "flex-end" }}>
        <Knop onClick={annuleer}>Annuleren</Knop>
        <Knop variant="primair" type="submit" disabled={bezig}>
          {bezig ? "Opslaan…" : bewerk ? "Wijzigingen opslaan" : "Deelnemer opslaan"}
        </Knop>
      </div>
    </form>
  )
}
