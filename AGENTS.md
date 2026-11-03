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
- Logboek: `audit_log` bewaart wijzigingen met oude en nieuwe waarde (`audit.ts`,
  `logWijziging`). Daarnaast legt `server/src/eventlog.ts` elke API-handeling vast in
  `event_log` (wie, wanneer, wat, methode, pad, status). De middleware wordt in
  `server/src/index.ts` vóór de routes op `/api` gezet; `/api/gezondheid` en
  `/api/auth/ik` worden overgeslagen. Het scherm `/logboek` (`src/pages/Logboek.tsx`)
  toont beide: tab **Alle acties** (`GET /api/eventlog`) en tab **Wijzigingen**
  (`GET /api/logboek`), beide met recht `logboek: zien`. Beide tabellen zijn alleen
  invoegbaar; verwijder dus geen regels om een test op te ruimen.
- Demo-inlog: `admin@diligence.nl` / `welkom123` (zie ook de link op het inlogscherm).
- `xlsx` komt bewust niet uit de npm-registry: versie 0.18.5 daar heeft twee
  high-severity adviezen (prototype pollution + ReDoS) zonder fix. `package.json`
  verwijst naar de SheetJS-release `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
  (zelfde API). `npm ci` heeft daarvoor dus toegang tot cdn.sheetjs.com nodig.
- Deelnemers importeren: `/api/deelnemers/import` + `/import/bevestig` (Excel/CSV).
  Bezoekgeschiedenis importeren: `/api/deelnemers/import/geschiedenis` +
  `/import/geschiedenis/bevestig` (`server/src/routes/geschiedenis-import.ts`). Die maakt
  een periode **"Archief oude systeem"** (status gesloten) met historische uitjes
  (`bron = 'import'`) en `aanwezigheid`-rijen; opnieuw importeren van dezelfde
  datum + omschrijving maakt geen dubbel uitje.
- Er is in de sandbox geen mailserver: e-mails belanden in `email_outbox`. Staat
  `BASE44_PREVIEW_MODE=1`, dan toont de app de herstelcode op het scherm; anders gaat
  de code als `in_wachtrij` naar `email_outbox` (2FA en herstel). Codes staan gehasht
  (`scrypt$…`) in `reset_code` / `twee_staps_code`; oude cijfers-codes blijven werken
  tot ze verlopen.
- Integriteitsregels (zie `server/tests/integriteit.test.ts`):
  - Een import ongedaan maken mag alleen de maker (`import_batches.door`) of iemand met
    `programma: verwijderen`; het kan niet als er opgaven, aanwezigheid, indelingen,
    declaraties of kasafsluitingen aan de uitjes hangen (409). Verwijderen gebeurt in
    één transactie (`metTransactie` uit `db.ts`).
  - Aanwezigheid wordt server-side beperkt tot deelnemers uit de definitieve indeling,
    anders de opgaven; een lege lijst met deelnemers erin wordt geweigerd.
  - Importbevestigingen worden opnieuw gevalideerd (datum binnen periode, tijden,
    prijs 0–5000, capaciteit 1–200, labels); de foutmarkeringen van de browser gelden
    niet meer.
  - Handmatige periode- en uitje-invoer gebruikt dezelfde domeinvalidatie als de
    import (`valideerPeriode` / `valideerUitjeInvoer` in `server/src/routes/programma.ts`):
    echte kalenderdatum, datum binnen de periode, begin- en eindtijd samen en
    begin niet na eind. Prijs (0–5000) en capaciteit (heel getal 1–200) hebben
    dezelfde grenzen als de import. De aanmelddeadline mag vóór de periode liggen,
    maar niet na de einddatum.
  - Dezelfde datum twee keer in één handmatige reeks geeft 400. Reeks, uitjes en
    voertuigkoppelingen worden in één transactie aangemaakt; een fout halverwege
    laat geen lege reeks of losse uitjes achter.
  - Een programma-import (batch, reeksen, uitjes, voertuigkoppelingen) loopt in één
    transactie; een fout halverwege laat niets achter.
  - Een telefonische opgave hoort bij precies één periode: een mix van uitjes uit
    twee periodes en onbekende uitje-/reeks-ID's geven 400. `deelnemers.eerste_opgave`
    wordt bij elke opgave gezet, ook zonder groepje.
  - Declaraties: `ingediend → goedgekeurd/afgekeurd → uitbetaald`, conditionele
    updates; alleen Penningmeester/Admin/Beheerder beoordelen of betalen en nooit de
    eigen declaratie.
  - Voertuigtoewijzing eist een actieve chauffeur met de juiste rol en weigert iemand
    die op dezelfde dag al op een ander uitje staat.
  - Eén kasafsluiting per uitje (route geeft 409, plus unieke index) en bedragen
    mogen niet negatief zijn.
  - CSV-exports zetten een apostrof voor waarden die met `= + - @` beginnen.
- Beveiliging (`server/src/auth.ts`, `server/src/limiet.ts`, `server/src/index.ts`):
  wachtwoorden via scrypt (N=32768; het oude `zout:hash`-formaat blijft werken),
  minstens 10 tekens. Inloggen, twee-staps en herstelcodes zijn begrensd op
  herhaalpogingen (in het geheugen, dus per API-proces) en codes worden
  timing-veilig vergeleken. De sessiecookie is HttpOnly, SameSite=Lax en Secure
  zodra het verzoek via https binnenkomt. Interne serverfouten geven nooit
  technische details terug. Een POST/PATCH/DELETE met `Sec-Fetch-Site: cross-site`
  wordt geweigerd (403).

## Verifiëren

- `curl -s http://localhost:3000/api/gezondheid` moet `{"status":"ok"}` geven.
- `docker compose -f docker-compose.base44.yml ps` moet `healthy` tonen voor `db`, `api`
  en `web`. De web-healthcheck controleert zowel `/` als `/src/main.tsx`.
- Schermen die inloggen vereisen zijn anoniem alleen tot het inlogscherm te controleren.
- Tests: `docker compose -f docker-compose.base44.yml exec api npm test` draait
  `server/tests/*.test.ts` met de ingebouwde Node-testrunner (via tsx). De tests maken
  een tijdelijke database `diligence_test` aan, gebruiken de echte routes en SQL, en
  gooien die database na afloop weg; de ontwikkeldatabase blijft ongemoeid. Er is geen
  Node op de sandbox-host, dus draai ze altijd in de `api`-container.
