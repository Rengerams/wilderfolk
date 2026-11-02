# Werkafspraken voor dit project

## Draaien in de sandbox

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

- `web` (Vite) op hostpoort **3000**, proxyt `/api` naar de `api`-service.
- `api` (Express + tsx watch) op poort 4000, alleen intern bereikbaar.
- `db` = PostgreSQL 16; de database heet `diligence`, gebruiker `diligence`.

## Bijzonderheden

- De API initialiseert het schema en de demodata bij het opstarten (`server/src/seed.ts`,
  aangeroepen vanuit `server/src/db.ts`).
- `seedDatabase()` slaat alles over zodra er al gebruikers bestaan. Een gedeeltelijk
  gevulde database blijft dus gedeeltelijk gevuld; controleer bij twijfel de aantallen
  (`uitje_voertuigen`, `declaraties`, `feedback`, `email_outbox`).
- SQL met `$n`-placeholders: tel de parameters en hergebruik geen nummers in een
  meerregelige `values`-lijst — Postgres weigert dan met
  "bind message supplies X parameters, but prepared statement requires Y".
- Functies (modules) staan organisatiebreed in `modules` en per gebruiker in
  `gebruiker_functies`. `server/src/functies.ts` voegt beide samen; de client krijgt
  het resultaat als `modules` via `/api/auth/ik`. Een functie die organisatiebreed uit
  staat, kan per gebruiker niet aangezet worden.
- `/api/dashboard` geeft naast de cijfers ook `aankomendeUitjes` en (met recht op het
  logboek) `recenteWijzigingen` voor de dashboardkaarten.
- Demo-inlog: `admin@diligence.nl` / `welkom123` (zie ook de link op het inlogscherm).
- Er is in de sandbox geen mailserver: e-mails belanden in `email_outbox`. Staat
  `BASE44_PREVIEW_MODE=1`, dan toont de app de herstelcode op het scherm.

## Verifiëren

- `curl -s http://localhost:3000/api/gezondheid` moet `{"status":"ok"}` geven.
- `docker compose -f docker-compose.base44.yml ps` moet `healthy` tonen voor `db`, `api`
  en `web`. De web-healthcheck controleert zowel `/` als `/src/main.tsx`.
- Schermen die inloggen vereisen zijn anoniem alleen tot het inlogscherm te controleren.
