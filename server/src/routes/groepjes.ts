import { Router } from "express"
import { een, q } from "../db"
import { logWijziging } from "../audit"
import { ah, naam, stuurFout, veiligeTekst } from "../util"

export const groepjesRouter = Router()

type GroepRij = {
  id: number
  naam: string
  leden: { id: number; voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null; status: string }[]
}

async function haalGroepen(): Promise<GroepRij[]> {
  return q<GroepRij>(
    `select g.id, g.naam,
            coalesce(json_agg(json_build_object(
              'id', d.id, 'voornaam', d.voornaam, 'tussenvoegsel', d.tussenvoegsel,
              'achternaam', d.achternaam, 'telefoon', d.telefoon, 'status', d.status
            ) order by d.achternaam) filter (where d.id is not null), '[]') as leden
       from groepjes g
       left join groepje_leden gl on gl.groepje_id = g.id
       left join deelnemers d on d.id = gl.deelnemer_id
      group by g.id
      order by g.naam`,
  )
}

async function controleerLeden(leden: number[], groepId: number | null): Promise<string | null> {
  if (leden.length === 0) return null
  const bezet = await q<{ deelnemer_id: number; groep_id: number; groep_naam: string; voornaam: string; achternaam: string }>(
    `select gl.deelnemer_id, g.id as groep_id, g.naam as groep_naam, d.voornaam, d.achternaam
       from groepje_leden gl join groepjes g on g.id = gl.groepje_id
       join deelnemers d on d.id = gl.deelnemer_id
      where gl.deelnemer_id = any($1::int[]) and ($2::int is null or g.id <> $2)`,
    [leden, groepId],
  )
  if (bezet.length === 0) return null
  const eerste = bezet[0]
  return `${eerste.voornaam} ${eerste.achternaam} zit al in groepje "${eerste.groep_naam}". Een deelnemer kan maar in één groepje zitten.`
}

groepjesRouter.get(
  "/",
  ah(async (_req, res) => {
    res.json({ groepjes: await haalGroepen() })
  }),
)

groepjesRouter.post(
  "/",
  ah(async (req, res) => {
    const groepNaam = veiligeTekst(req.body?.naam)
    const leden = Array.isArray(req.body?.leden) ? req.body.leden.map(Number).filter(Boolean) : []
    if (!groepNaam) {
      stuurFout(res, 400, "Geef het groepje een naam.")
      return
    }
    const conflict = await controleerLeden(leden, null)
    if (conflict) {
      stuurFout(res, 409, conflict)
      return
    }
    const rij = await een<{ id: number }>(
      "insert into groepjes (naam) values ($1) returning id",
      [groepNaam],
    )
    for (const lid of leden) {
      await q("insert into groepje_leden (groepje_id, deelnemer_id) values ($1,$2) on conflict do nothing", [
        rij!.id,
        lid,
      ])
    }
    await logWijziging(req, {
      actie: "aanmaken",
      entiteit: "groepje",
      entiteitId: rij!.id,
      nieuweWaarde: { naam: groepNaam, leden },
      omschrijving: `${req.gebruiker!.naam} heeft groepje "${groepNaam}" aangemaakt met ${leden.length} deelnemer(s).`,
    })
    res.status(201).json({ groepjes: await haalGroepen() })
  }),
)

groepjesRouter.patch(
  "/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const bestaand = (await haalGroepen()).find((g) => g.id === id)
    if (!bestaand) {
      stuurFout(res, 404, "Dit groepje bestaat niet.")
      return
    }
    const groepNaam = veiligeTekst(req.body?.naam) || bestaand.naam
    const leden = Array.isArray(req.body?.leden)
      ? req.body.leden.map(Number).filter(Boolean)
      : bestaand.leden.map((lid) => lid.id)
    const conflict = await controleerLeden(leden, id)
    if (conflict) {
      stuurFout(res, 409, conflict)
      return
    }
    await q("update groepjes set naam = $1 where id = $2", [groepNaam, id])
    await q("delete from groepje_leden where groepje_id = $1", [id])
    for (const lid of leden) {
      await q("insert into groepje_leden (groepje_id, deelnemer_id) values ($1,$2)", [id, lid])
    }
    await logWijziging(req, {
      actie: "wijzigen",
      entiteit: "groepje",
      entiteitId: id,
      oudeWaarde: bestaand,
      nieuweWaarde: { naam: groepNaam, leden },
      omschrijving: `${req.gebruiker!.naam} heeft groepje "${groepNaam}" gewijzigd.`,
    })
    res.json({ groepjes: await haalGroepen() })
  }),
)

groepjesRouter.delete(
  "/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const bestaand = (await haalGroepen()).find((g) => g.id === id)
    if (!bestaand) {
      stuurFout(res, 404, "Dit groepje bestaat niet.")
      return
    }
    if (req.body?.bevestig !== true) {
      stuurFout(res, 400, "Bevestig eerst dat het groepje ontbonden mag worden.")
      return
    }
    await q("delete from groepjes where id = $1", [id])
    await logWijziging(req, {
      actie: "ontbinden",
      entiteit: "groepje",
      entiteitId: id,
      oudeWaarde: bestaand,
      omschrijving: `${req.gebruiker!.naam} heeft groepje "${bestaand.naam}" ontbonden.`,
    })
    res.json({ groepjes: await haalGroepen() })
  }),
)

export async function naamVanDeelnemer(id: number): Promise<string> {
  const rij = await een<{ voornaam: string; tussenvoegsel: string | null; achternaam: string }>(
    "select voornaam, tussenvoegsel, achternaam from deelnemers where id = $1",
    [id],
  )
  return rij ? naam(rij) : "Onbekende deelnemer"
}
