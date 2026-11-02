/**
 * Vrijgekomen plekken: de eerstvolgende reservist(en) moeten gebeld kunnen worden.
 *
 * Zodra er in een bevestigde indeling plek vrijkomt (afmelding of extra
 * capaciteit) zet deze functie bel-taken klaar voor de reservisten die daarvoor
 * in aanmerking komen. Bestaat de beltaak al, dan wordt hij hergebruikt, zodat de
 * bellijst niet volloopt met dubbele taken.
 */
import { een, q } from "./db"
import { datumLang, naam } from "./util"

export type ReservistMelding = { namen: string[]; vrije_plekken: number }

export async function vraagReservisten(uitjeId: number): Promise<ReservistMelding | null> {
  const uitje = await een<{
    id: number
    periode_id: number
    omschrijving: string
    datum: string
    capaciteit: number
    status: string
  }>("select id, periode_id, omschrijving, datum, capaciteit, status from uitjes where id = $1", [uitjeId])
  if (!uitje || uitje.status === "geannuleerd") return null

  const run = await een<{ id: number }>(
    `select id from indeling_runs where periode_id = $1 and modus = 'definitief'
      order by id desc limit 1`,
    [uitje.periode_id],
  )
  if (!run) return null

  const bezet = await een<{ aantal: string }>(
    `select count(*)::text as aantal from indeling_rijen
      where run_id = $1 and uitje_id = $2 and status = 'geplaatst'`,
    [run.id, uitje.id],
  )
  const vrij = uitje.capaciteit - Number(bezet?.aantal ?? 0)
  if (vrij <= 0) return null

  // Reservisten die al een openstaande beltaak hebben, hoeven we niet opnieuw te vragen.
  const alGevraagd = await q<{ deelnemer_id: number }>(
    `select deelnemer_id from bellijst
      where periode_id = $1 and uitje_id = $2 and type = 'vrijgekomen' and status = 'te_bellen'`,
    [uitje.periode_id, uitje.id],
  )
  const gevraagd = new Set(alGevraagd.map((rij) => rij.deelnemer_id))
  const nogNodig = vrij - gevraagd.size
  if (nogNodig <= 0) return null

  const reservisten = await q<{
    deelnemer_id: number
    voornaam: string
    tussenvoegsel: string | null
    achternaam: string
    telefoon: string | null
    positie: number | null
  }>(
    // Wie al op een andere datum van dezelfde reeks is geplaatst, bellen we hier niet
    // voor: één plek per reeks.
    `select r.deelnemer_id, d.voornaam, d.tussenvoegsel, d.achternaam, d.telefoon, r.positie
       from indeling_rijen r join deelnemers d on d.id = r.deelnemer_id
      where r.run_id = $1 and r.uitje_id = $2 and r.status = 'reserve' and d.status <> 'gestopt'
        and not exists (
          select 1 from indeling_rijen p
            join uitjes up on up.id = p.uitje_id
            join uitjes ur on ur.id = $2
           where p.run_id = r.run_id and p.deelnemer_id = r.deelnemer_id
             and p.status = 'geplaatst' and up.reeks_id is not null and up.reeks_id = ur.reeks_id
        )
      order by r.positie nulls last, d.achternaam`,
    [run.id, uitje.id],
  )
  const kandidaten = reservisten.filter((rij) => !gevraagd.has(rij.deelnemer_id)).slice(0, nogNodig)
  if (kandidaten.length === 0) return null

  const namen: string[] = []
  for (const reservist of kandidaten) {
    const boodschap =
      `Er is een plek vrijgekomen voor ${uitje.omschrijving} op ${datumLang(uitje.datum)}` +
      `${vrij > 1 ? ` (${vrij} plekken vrij)` : ""}. Wilt u mee? Zo ja, dan zetten we u erbij.`
    const bestaand = await een<{ id: number }>(
      `select id from bellijst
        where periode_id = $1 and uitje_id = $2 and deelnemer_id = $3
          and type in ('reserve','vrijgekomen')
        order by id desc limit 1`,
      [uitje.periode_id, uitje.id, reservist.deelnemer_id],
    )
    if (bestaand) {
      await q(
        `update bellijst set type = 'vrijgekomen', boodschap = $1, status = 'te_bellen', bijgewerkt = now()
          where id = $2`,
        [boodschap, bestaand.id],
      )
    } else {
      await q(
        `insert into bellijst (periode_id, uitje_id, deelnemer_id, type, boodschap, telefoon)
         values ($1,$2,$3,'vrijgekomen',$4,$5)`,
        [uitje.periode_id, uitje.id, reservist.deelnemer_id, boodschap, reservist.telefoon],
      )
    }
    namen.push(naam(reservist))
  }

  return { namen, vrije_plekken: vrij }
}

/** Zin voor in een bevestiging of melding, of leeg als er niemand gebeld hoeft te worden. */
export function reserveZin(melding: ReservistMelding | null): string {
  if (!melding || melding.namen.length === 0) return ""
  const wie =
    melding.namen.length === 1
      ? melding.namen[0]
      : `${melding.namen.slice(0, -1).join(", ")} en ${melding.namen[melding.namen.length - 1]}`
  return ` Bel meteen ${wie}: er is een plek vrijgekomen.`
}
