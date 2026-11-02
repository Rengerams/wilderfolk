import pg from "pg"
import { SCHEMA_SQL } from "./schema"
import { seedDatabase } from "./seed"

const { Pool, types } = pg

// NUMERIC als getal teruggeven (bedragen), DATE als kale string (geen tijdzone-verschuiving).
types.setTypeParser(1700, (waarde) => Number.parseFloat(waarde))
types.setTypeParser(1082, (waarde) => waarde)

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://diligence:diligence_dev@db:5432/diligence",
  max: 10,
})

export async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const resultaat = await pool.query(sql, params as never[])
  return resultaat.rows as T[]
}

export async function een<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rijen = await q<T>(sql, params)
  return rijen[0]
}

export async function initDb(): Promise<void> {
  let laatsteFout: unknown
  for (let poging = 1; poging <= 30; poging++) {
    try {
      await pool.query("select 1")
      laatsteFout = undefined
      break
    } catch (fout) {
      laatsteFout = fout
      await new Promise((klaar) => setTimeout(klaar, 1000))
    }
  }
  if (laatsteFout) throw laatsteFout
  await pool.query(SCHEMA_SQL)
  await seedDatabase()
}

export async function sluitDb(): Promise<void> {
  await pool.end()
}
