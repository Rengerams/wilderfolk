/**
 * Rapportage: de cijfers per periode op één scherm, met een CSV-export.
 * Alleen lezen; er wordt niets vastgelegd.
 */
import { Router } from "express"
import { q } from "../db"
import { functieAan } from "../functies"
import { ah, alsGetal } from "../util"

export const rapportageRouter = Router()

type Periode = { id: number; naam: string; start_op: string; eind_op: string; status: string }

type UitjeRij = {
  id: number
  datum: string
  omschrijving: string
  capaciteit: number
  status: string
  opgaven: number
  aanwezig: number
  afwezig: number
}

/** Eén CSV-veld, beschermd tegen formule-uitvoering in Excel en LibreOffice. */
function csvVeld(veld: string | number): string {
  let tekst = String(veld ?? "")
  if (/^[=+\-@\t\r]/.test(tekst)) tekst = `'${tekst}`
  return `"${tekst.replaceAll('"', '""')}"`
}

function csv(velden: (string | number)[][]): string {
  return "\uFEFF" + velden.map((rij) => rij.map(csvVeld).join(";")).join("\r\n")
}

async function haalUitjes(periodeId: number): Promise<UitjeRij[]> {
  return q<UitjeRij>(
    `select u.id, u.datum::text, u.omschrijving, u.capaciteit, u.status,
            (select count(*) from opgaven o where o.uitje_id = u.id)::int as opgaven,
            coalesce(a.aanwezig, 0)::int as aanwezig,
            coalesce(a.afwezig, 0)::int as afwezig
       from uitjes u
       left join (
         select uitje_id,
                count(*) filter (where aanwezig)::int as aanwezig,
                count(*) filter (where not aanwezig)::int as afwezig
           from aanwezigheid
          group by uitje_id
       ) a on a.uitje_id = u.id
      where u.periode_id = $1
      order by u.datum, u.id`,
    [periodeId],
  )
}

rapportageRouter.get(
  "/",
  ah(async (req, res) => {
    const periodes = await q<Periode>(
      `select id, naam, start_op, eind_op, status from periodes order by start_op desc`,
    )
    const gevraagd = alsGetal(req.query.periode, 0)
    const periode = periodes.find((rij) => rij.id === gevraagd) ?? periodes[0] ?? null

    if (!periode) {
      res.json({ periodes, periode: null, cijfers: null, uitjes: [], statussen: [], topDeelnemers: [], declaraties: null, kas: null })
      return
    }

    const [cijfers] = await q<{
      actieve_deelnemers: number
      gestopte_deelnemers: number
      nieuwe_deelnemers: number
    }>(
      `select
         (select count(*) from deelnemers where status = 'actief')::int as actieve_deelnemers,
         (select count(*) from deelnemers where status = 'gestopt')::int as gestopte_deelnemers,
         (select count(*) from deelnemers
           where aangemaakt::date between $1::date and $2::date)::int as nieuwe_deelnemers`,
      [periode.start_op, periode.eind_op],
    )

    const uitjes = await haalUitjes(periode.id)

    const statussen = await q<{ status: string; aantal: number }>(
      `select status, count(*)::int as aantal from deelnemers group by status order by status`,
    )

    const topDeelnemers = await q<{ naam: string; keer: number }>(
      `select trim(concat_ws(' ', d.voornaam, d.tussenvoegsel, d.achternaam)) as naam,
              count(*)::int as keer
         from aanwezigheid a
         join uitjes u on u.id = a.uitje_id
         join deelnemers d on d.id = a.deelnemer_id
        where u.periode_id = $1 and a.aanwezig
        group by d.id, d.voornaam, d.tussenvoegsel, d.achternaam
        order by keer desc, naam
        limit 10`,
      [periode.id],
    )

    const chauffeurskosten = await functieAan(req.gebruiker!.id, "chauffeurskosten")
    const kasAan = await functieAan(req.gebruiker!.id, "kas")

    const declaraties = chauffeurskosten
      ? await q<{ status: string; aantal: number; bedrag: number }>(
          `select d.status, count(*)::int as aantal, coalesce(sum(d.bedrag), 0)::float as bedrag
             from declaraties d
             join uitjes u on u.id = d.uitje_id
            where u.periode_id = $1
            group by d.status
            order by d.status`,
          [periode.id],
        )
      : null

    const kas = kasAan
      ? (
          await q<{ afsluitingen: number; verwacht: number; geteld: number; verschil: number }>(
            `select count(*)::int as afsluitingen,
                    coalesce(sum(k.verwacht), 0)::float as verwacht,
                    coalesce(sum(k.geteld), 0)::float as geteld,
                    coalesce(sum(k.verschil), 0)::float as verschil
               from kas_afsluitingen k
               join uitjes u on u.id = k.uitje_id
              where u.periode_id = $1`,
            [periode.id],
          )
        )[0]
      : null

    res.json({ periodes, periode, cijfers: cijfers ?? null, uitjes, statussen, topDeelnemers, declaraties, kas })
  }),
)

rapportageRouter.get(
  "/export",
  ah(async (req, res) => {
    const periodeId = alsGetal(req.query.periode, 0)
    const [periode] = await q<Periode>(
      `select id, naam, start_op, eind_op, status from periodes where id = $1`,
      [periodeId],
    )
    if (!periode) {
      res.status(404).json({ fout: "Kies eerst een periode." })
      return
    }

    const uitjes = await haalUitjes(periode.id)
    const inhoud = csv([
      ["Periode", periode.naam],
      ["Van", periode.start_op],
      ["Tot", periode.eind_op],
      [],
      ["Datum", "Uitje", "Capaciteit", "Opgaven", "Aanwezig", "Afwezig", "Bezetting %", "Status"],
      ...uitjes.map((uitje) => [
        uitje.datum,
        uitje.omschrijving,
        uitje.capaciteit,
        uitje.opgaven,
        uitje.aanwezig,
        uitje.afwezig,
        uitje.capaciteit > 0 ? Math.round((uitje.opgaven / uitje.capaciteit) * 100) : 0,
        uitje.status,
      ]),
    ])

    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="rapportage.csv"')
    res.send(inhoud)
  }),
)
