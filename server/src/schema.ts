/**
 * Volledig databaseschema. Wordt bij het starten van de API uitgevoerd met
 * CREATE TABLE IF NOT EXISTS, zodat een bestaande database intact blijft.
 */
export const SCHEMA_SQL = `
create table if not exists rollen (
  id serial primary key,
  naam text not null unique,
  beschrijving text,
  rechten jsonb not null default '{}'::jsonb,
  standaard boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists gebruikers (
  id serial primary key,
  naam text not null,
  email text not null unique,
  wachtwoord_hash text not null,
  rol_id integer not null references rollen(id),
  actief boolean not null default true,
  twee_staps boolean not null default false,
  reset_code text,
  reset_verloopt timestamptz,
  twee_staps_code text,
  twee_staps_verloopt timestamptz,
  laatste_login timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sessies (
  token text primary key,
  gebruiker_id integer not null references gebruikers(id) on delete cascade,
  created_at timestamptz not null default now(),
  laatst_gebruikt timestamptz not null default now(),
  verloopt timestamptz not null
);

create table if not exists deelnemers (
  id serial primary key,
  voornaam text not null,
  tussenvoegsel text,
  achternaam text not null,
  telefoon text,
  telefoon_alt text,
  email text,
  contactvoorkeur text not null default 'telefoon',
  straat text,
  huisnummer text,
  postcode text,
  plaats text,
  opmerkingen text,
  mobiliteit text[] not null default '{}',
  heeft_mk boolean not null default false,
  heeft_vl boolean not null default false,
  noodcontact_naam text,
  noodcontact_telefoon text,
  status text not null default 'actief',
  gestopt_op date,
  geanonimiseerd boolean not null default false,
  eerste_opgave timestamptz,
  aangemaakt timestamptz not null default now(),
  gewijzigd timestamptz not null default now()
);

create table if not exists groepjes (
  id serial primary key,
  naam text not null,
  created_at timestamptz not null default now()
);

create table if not exists groepje_leden (
  groepje_id integer not null references groepjes(id) on delete cascade,
  deelnemer_id integer not null references deelnemers(id) on delete cascade,
  primary key (groepje_id, deelnemer_id),
  unique (deelnemer_id)
);

create table if not exists periodes (
  id serial primary key,
  naam text not null,
  start_op date not null,
  eind_op date not null,
  aanmelddeadline date not null,
  status text not null default 'concept',
  standaard_capaciteit integer not null default 14,
  aangemaakt timestamptz not null default now()
);

create table if not exists reeksen (
  id serial primary key,
  periode_id integer not null references periodes(id) on delete cascade,
  omschrijving text not null
);

create table if not exists uitjes (
  id serial primary key,
  periode_id integer not null references periodes(id) on delete cascade,
  reeks_id integer references reeksen(id) on delete set null,
  datum date not null,
  begin_tijd time,
  eind_tijd time,
  omschrijving text not null,
  prijs numeric(8,2) not null default 0,
  extra_kosten text,
  labels text[] not null default '{}',
  capaciteit integer not null default 14,
  geschiktheid text,
  status text not null default 'actief',
  bron text not null default 'handmatig',
  afgerond_op timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists opgaven (
  id serial primary key,
  uitje_id integer not null references uitjes(id) on delete cascade,
  deelnemer_id integer not null references deelnemers(id) on delete cascade,
  reeks_keuze boolean not null default false,
  met_groepje boolean not null default true,
  bron text not null default 'telefoon',
  notitie text,
  aangemaakt timestamptz not null default now(),
  aangemaakt_door integer references gebruikers(id),
  unique (uitje_id, deelnemer_id)
);

create table if not exists indeling_runs (
  id serial primary key,
  periode_id integer not null references periodes(id) on delete cascade,
  modus text not null default 'proef',
  seed text not null,
  samenvatting text,
  aangemaakt timestamptz not null default now(),
  door integer references gebruikers(id)
);

create table if not exists indeling_rijen (
  id serial primary key,
  run_id integer not null references indeling_runs(id) on delete cascade,
  uitje_id integer not null references uitjes(id) on delete cascade,
  deelnemer_id integer not null references deelnemers(id) on delete cascade,
  status text not null default 'geplaatst',
  systeem_status text not null default 'geplaatst',
  handmatig boolean not null default false,
  uitleg text,
  systeem_uitleg text,
  positie integer,
  gewijzigd timestamptz not null default now()
);

create index if not exists indeling_rijen_run_idx on indeling_rijen(run_id);

create table if not exists aanwezigheid (
  uitje_id integer not null references uitjes(id) on delete cascade,
  deelnemer_id integer not null references deelnemers(id) on delete cascade,
  aanwezig boolean not null default true,
  geregistreerd timestamptz not null default now(),
  primary key (uitje_id, deelnemer_id)
);

create table if not exists voertuigen (
  id serial primary key,
  naam text not null,
  capaciteit integer not null,
  actief boolean not null default true
);

create table if not exists uitje_voertuigen (
  id serial primary key,
  uitje_id integer not null references uitjes(id) on delete cascade,
  voertuig_id integer not null references voertuigen(id) on delete cascade,
  chauffeur_id integer references gebruikers(id) on delete set null,
  unique (uitje_id, voertuig_id)
);

create table if not exists bellijst (
  id serial primary key,
  periode_id integer not null references periodes(id) on delete cascade,
  uitje_id integer references uitjes(id) on delete cascade,
  deelnemer_id integer not null references deelnemers(id) on delete cascade,
  type text not null,
  boodschap text not null,
  status text not null default 'te_bellen',
  telefoon text,
  aangemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now()
);

create table if not exists declaraties (
  id serial primary key,
  uitje_id integer not null references uitjes(id) on delete cascade,
  chauffeur_id integer not null references gebruikers(id),
  bedrag numeric(10,2) not null,
  soort text not null,
  omschrijving text,
  bon text,
  status text not null default 'ingediend',
  ingediend timestamptz not null default now(),
  goedgekeurd_door integer references gebruikers(id),
  goedgekeurd_op timestamptz,
  uitbetaald_op timestamptz,
  afgekeurd_reden text
);

create table if not exists kas_afsluitingen (
  id serial primary key,
  uitje_id integer not null references uitjes(id) on delete cascade,
  verwacht numeric(10,2) not null default 0,
  geteld numeric(10,2) not null default 0,
  verschil numeric(10,2) not null default 0,
  geteld_door integer references gebruikers(id),
  datum date not null default current_date,
  opmerking text,
  created_at timestamptz not null default now()
);

create table if not exists stortingen (
  id serial primary key,
  datum date not null,
  bedrag numeric(10,2) not null,
  omschrijving text,
  door integer references gebruikers(id),
  created_at timestamptz not null default now()
);

create table if not exists modules (
  sleutel text primary key,
  naam text not null,
  uitleg text not null,
  aan boolean not null default false,
  optioneel boolean not null default true,
  volgorde integer not null default 100
);

create table if not exists gebruiker_functies (
  gebruiker_id integer not null references gebruikers(id) on delete cascade,
  functie text not null references modules(sleutel) on delete cascade,
  aan boolean not null,
  primary key (gebruiker_id, functie)
);

create table if not exists instellingen (
  sleutel text primary key,
  waarde text not null
);

create table if not exists audit_log (
  id bigserial primary key,
  tijd timestamptz not null default now(),
  gebruiker_id integer,
  gebruiker_naam text not null,
  actie text not null,
  entiteit text not null,
  entiteit_id text,
  oude_waarde jsonb,
  nieuwe_waarde jsonb,
  omschrijving text not null
);

create index if not exists audit_log_tijd_idx on audit_log(tijd desc);

-- Volledig actielogboek: elke handeling in de app (openen, zoeken, opslaan,
-- inloggen) komt hier als één regel bij. Alleen invoegbaar, nooit gewijzigd.
create table if not exists event_log (
  id bigserial primary key,
  tijd timestamptz not null default now(),
  gebruiker_id integer,
  gebruiker_naam text not null,
  actie text not null,
  onderdeel text not null,
  omschrijving text not null,
  methode text not null,
  pad text not null,
  status integer not null,
  duur_ms integer not null default 0
);

create index if not exists event_log_tijd_idx on event_log(tijd desc);
create index if not exists event_log_onderdeel_idx on event_log(onderdeel);

create table if not exists feedback (
  id serial primary key,
  scherm text not null,
  tekst text not null,
  gebruiker_id integer,
  gebruiker_naam text,
  status text not null default 'nieuw',
  created_at timestamptz not null default now()
);

create table if not exists email_outbox (
  id serial primary key,
  deelnemer_id integer references deelnemers(id) on delete set null,
  email text not null,
  onderwerp text not null,
  tekst text not null,
  status text not null default 'verzonden',
  verzonden_op timestamptz not null default now()
);

create table if not exists import_batches (
  id serial primary key,
  periode_id integer references periodes(id) on delete cascade,
  soort text not null,
  aantal integer not null default 0,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists import_batch_uitjes (
  batch_id integer not null references import_batches(id) on delete cascade,
  uitje_id integer not null references uitjes(id) on delete cascade,
  primary key (batch_id, uitje_id)
);

-- Uitbreidingen op bestaande databases.
alter table voertuigen add column if not exists kenteken text;
alter table uitje_voertuigen add column if not exists begeleider_id integer references gebruikers(id) on delete set null;
alter table import_batches add column if not exists door integer references gebruikers(id);

-- Eén kasafsluiting per uitje. Bestaande databases met dubbele afsluitingen
-- mogen niet stuklopen op de index; de route weigert nieuwe duplicaten altijd.
do $$
begin
  create unique index if not exists kas_afsluitingen_uitje_uniek on kas_afsluitingen(uitje_id);
exception when others then
  raise notice 'unieke kasafsluiting per uitje niet aangemaakt: %', sqlerrm;
end $$;

-- Elke rit heeft een chauffeur én een begeleider. Begeleiders zijn medewerkers met
-- een eigen account, zodat ze de deelnemerslijst van hun uitje kunnen zien.
insert into rollen (naam, beschrijving, rechten, standaard)
values (
  'Begeleider',
  'Gaat mee als begeleider bij een uitje en ziet de deelnemerslijst van dat uitje.',
  '{"vervoer":{"zien":true}}'::jsonb,
  true
)
on conflict (naam) do nothing;

-- Kleurthema van de organisatie (rood, blauw, groen of paars).
insert into instellingen (sleutel, waarde) values ('thema', 'rood')
on conflict (sleutel) do nothing;

-- Rapportage is later toegevoegd. Rollen die het wijzigingsoverzicht mogen zien,
-- krijgen het rapportagescherm er automatisch bij; de beheerder kan het per rol
-- daarna weer uitzetten.
update rollen
   set rechten = rechten || '{"rapportage":{"zien":true,"aanmaken":true,"wijzigen":true,"verwijderen":true}}'::jsonb
 where rechten ? 'logboek'
   and not (rechten ? 'rapportage');
`;

/** Alle onderdelen waarop rechten per rol ingesteld kunnen worden. */
export const RECHTEN_ONDERDELEN: { sleutel: string; naam: string; module?: string }[] = [
  { sleutel: "deelnemers", naam: "Deelnemers" },
  { sleutel: "groepjes", naam: "Groepjes" },
  { sleutel: "programma", naam: "Periodes en uitjes" },
  { sleutel: "opgave", naam: "Telefonische opgave" },
  { sleutel: "indeling", naam: "Eerlijke indeling" },
  { sleutel: "reservelijst", naam: "Reservelijst en bellijst" },
  { sleutel: "vervoer", naam: "Vervoer" },
  { sleutel: "declaraties", naam: "Chauffeurskosten", module: "chauffeurskosten" },
  { sleutel: "kas", naam: "Kas", module: "kas" },
  { sleutel: "gebruikers", naam: "Gebruikers" },
  { sleutel: "rollen", naam: "Rollen en rechten" },
  { sleutel: "logboek", naam: "Wijzigingsoverzicht" },
  { sleutel: "rapportage", naam: "Rapportage" },
  { sleutel: "modules", naam: "Functies" },
  { sleutel: "feedback", naam: "Feedback" },
]

export const RECHTEN_ACTIES = ["zien", "aanmaken", "wijzigen", "verwijderen"] as const
export type RechtActie = (typeof RECHTEN_ACTIES)[number]
