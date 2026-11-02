export type Deelnemer = {
  id: number
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  telefoon: string | null
  telefoon_alt: string | null
  email: string | null
  contactvoorkeur: string
  straat: string | null
  huisnummer: string | null
  postcode: string | null
  plaats: string | null
  opmerkingen: string | null
  mobiliteit: string[]
  heeft_mk: boolean
  heeft_vl: boolean
  noodcontact_naam: string | null
  noodcontact_telefoon: string | null
  status: string
  gestopt_op: string | null
  geanonimiseerd: boolean
  totaal_deelnames: number
  aantal_12m: number
  laatste_deelname: string | null
  groepje_id: number | null
  groepje_naam: string | null
}

export type Groepje = {
  id: number
  naam: string
  leden: {
    id: number
    voornaam: string
    tussenvoegsel: string | null
    achternaam: string
    telefoon: string | null
    status: string
  }[]
}

export type Periode = {
  id: number
  naam: string
  start_op: string
  eind_op: string
  aanmelddeadline: string
  status: "concept" | "gepubliceerd" | "gesloten"
  standaard_capaciteit: number
  aantal_uitjes?: number
  aantal_opgaven?: number
}

export type Uitje = {
  id: number
  periode_id: number
  reeks_id: number | null
  datum: string
  begin_tijd: string | null
  eind_tijd: string | null
  omschrijving: string
  prijs: number
  extra_kosten: string | null
  labels: string[]
  capaciteit: number
  geschiktheid: string | null
  status: string
  bron: string
  afgerond_op: string | null
  opgaven?: number
  geplaatst?: number
}

export type IndelingRij = {
  id: number
  run_id: number
  uitje_id: number
  deelnemer_id: number
  status: string
  systeem_status: string
  handmatig: boolean
  uitleg: string | null
  systeem_uitleg: string | null
  positie: number | null
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  telefoon: string | null
  mobiel: string[]
  groepje_naam: string | null
  datum: string
  begin_tijd: string | null
  eind_tijd: string | null
  omschrijving: string
  capaciteit: number
  reeks_id: number | null
}
