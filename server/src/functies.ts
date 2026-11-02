/**
 * Functies (modules) per gebruiker.
 *
 * De beheerder zet een functie aan of uit voor de hele organisatie. Daarnaast
 * kan hij per gebruiker afwijken. Een gebruiker zonder eigen instelling volgt
 * de organisatie; een functie die organisatiebreed uit staat, blijft altijd uit.
 */
import { q } from "./db"

export async function functiesVoorGebruiker(gebruikerId: number): Promise<Record<string, boolean>> {
  const rijen = await q<{ sleutel: string; aan: boolean }>(
    `select m.sleutel, coalesce(g.aan, m.aan) as aan
       from modules m
       left join gebruiker_functies g on g.functie = m.sleutel and g.gebruiker_id = $1
      order by m.volgorde`,
    [gebruikerId],
  )
  return Object.fromEntries(rijen.map((rij) => [rij.sleutel, rij.aan]))
}

export async function functieAan(gebruikerId: number, sleutel: string): Promise<boolean> {
  const rijen = await q<{ aan: boolean }>(
    `select coalesce(g.aan, m.aan) as aan
       from modules m
       left join gebruiker_functies g on g.functie = m.sleutel and g.gebruiker_id = $1
      where m.sleutel = $2`,
    [gebruikerId, sleutel],
  )
  return rijen[0]?.aan === true
}
