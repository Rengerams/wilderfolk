# Review van duplicate exports

**Datum:** 2026-08-21  
**Scope:** `src/`, `tests/` en repository-scripts. Er is geen code gewijzigd.

## Conclusie

De vijf Knip-meldingen zijn geen vijf gevallen van dubbele implementatielogica. Het zijn voornamelijk **deprecated compatibiliteitsaliases** die dezelfde functie of constante onder een oudere naam exporteren. Vier aliassen hebben geen actuele codegebruiker buiten hun definitie; één groep bevat een nog actief compatibiliteitsalias (`HUMAN_ADULT_MAX_AGE`) naast een niet-gebruikte oudere naam (`HUMAN_MAX_LIFESPAN_DAYS`).

| Groep | Canonical symbool | Aliasstatus | Actuele gebruikers | Advies |
|---|---|---|---|---|
| Levensduur | `HUMAN_MAX_LIFESPAN_YEARS` | `HUMAN_ADULT_MAX_AGE` is actief als semantische alias; `HUMAN_MAX_LIFESPAN_DAYS` is ongebruikt en deprecated. | `HUMAN_MAX_LIFESPAN_YEARS` wordt gebruikt in `humanRelationships.ts`, `groupEvents.ts` en intern in `dayCycle.ts`; `HUMAN_ADULT_MAX_AGE` wordt gebruikt in `humanTick.ts` en `humanRelationships.ts`. | Behoud `HUMAN_ADULT_MAX_AGE` tot callers naar de canonical naam zijn gemigreerd. `HUMAN_MAX_LIFESPAN_DAYS` kan waarschijnlijk worden verwijderd, maar controleer eerst externe/manual imports. |
| Bouwduur | `buildWorkHours` | `buildWorkTicks` is een deprecated alias die exact naar `buildWorkHours` wijst. | Geen actuele productie- of testcaller voor `buildWorkTicks`; `buildWorkHours` wordt alleen lokaal gedeclareerd/exported volgens de repository-trace. | `buildWorkTicks` verwijderen is laag risico in de huidige repository, maar behoud eventueel tijdelijk als publieke compatibiliteitsnaam. |
| Moon Howler-kans | `MOON_HOWLER_OUTCOME_CURE` | `MOON_HOWLER_CHURCH_CURE_CHANCE` is een deprecated constante alias met exact dezelfde waarde. | Alleen `MOON_HOWLER_OUTCOME_CURE` wordt intern gebruikt; de alias heeft geen actuele caller. | Alias verwijderen is laag risico binnen deze repository; controleer eerst eventuele externe UI/tooling-imports. |
| Spatial query | `forEachInEntityGrid` | `forEachEntityInRadius` is een deprecated function alias. | Alleen `forEachInEntityGrid` wordt gebruikt door `tickLayerSystems.ts`; de oude naam heeft geen caller behalve de definitie. | Oude alias verwijderen na een compatibiliteitscheck. `forEachInEntityGrid` blijft de enige owner/API-naam. |
| Human sprites | `loadHumanWalkSheets` | `generateHumanSprites` is een deprecated alias voor dezelfde async loader. | Alleen `loadHumanWalkSheets` wordt gebruikt door `spriteLoader.ts`; `generateHumanSprites` heeft geen caller. | Oude alias verwijderen na controle van handmatige asset-tools; geen runtimegedrag verandert. |

## Detailbevindingen

### 1. Levensduurconstanten

`HUMAN_MAX_LIFESPAN_YEARS` is de semantisch juiste canonical naam en staat voor levensjaren. `HUMAN_ADULT_MAX_AGE` verwijst exact naar dezelfde waarde en wordt nog gebruikt als bovengrens in volwassenheids- en reproductiegates. Dit is daarom geen veilig “verwijder direct”-symbool: eerst callers migreren of de alias bewust behouden.

`HUMAN_MAX_LIFESPAN_DAYS` verwijst eveneens exact naar `HUMAN_MAX_LIFESPAN_YEARS`, maar heeft volgens de repository-trace geen gebruikers buiten de declaratie. Omdat de naam bovendien een verouderde eenheid suggereert, is dit de beste eerste cleanup-kandidaat, mits geen externe of handmatige import bestaat.

### 2. Bouwduur

`buildWorkTicks` is geen afzonderlijke berekening. Het is een directe alias naar `buildWorkHours` met een expliciete deprecated-JSDoc omdat de waarde werkuren retourneert en geen simulatieticks. Er zijn geen actuele callers gevonden. De cleanup is semantisch veilig binnen de repository, maar een externe import zou een API-breuk veroorzaken.

### 3. Moon Howler

`MOON_HOWLER_CHURCH_CURE_CHANCE` is een deprecated UI-compatibiliteitsnaam die exact `MOON_HOWLER_OUTCOME_CURE` teruggeeft. De actuele cure-berekening gebruikt de canonical outcome-constante plus de priest-bonus en cap. De alias verandert niets aan runtimegedrag en heeft geen actuele caller.

### 4. Spatial queries

`forEachEntityInRadius` wijst exact naar `forEachInEntityGrid`. De actuele systemenlaag importeert en gebruikt uitsluitend `forEachInEntityGrid`. Het oude symbool is dus API-compatibiliteit, geen tweede querypad.

### 5. Sprite loader

`generateHumanSprites` wijst exact naar `loadHumanWalkSheets`. De loader zet dezelfde `humanSpritesReady`-status en wordt in `preloadAllSprites()` uitsluitend via de canonical naam aangeroepen. De alias creëert geen tweede asset- of preloadpad.

## Aanbevolen volgorde

De laagste-risico-opruiming is: eerst controleren of er geen externe imports zijn, daarna `HUMAN_MAX_LIFESPAN_DAYS`, `buildWorkTicks`, `MOON_HOWLER_CHURCH_CURE_CHANCE`, `forEachEntityInRadius` en `generateHumanSprites` verwijderen in afzonderlijke kleine wijzigingen. `HUMAN_ADULT_MAX_AGE` moet pas later worden gemigreerd, omdat het nog door reproductie- en volwassenheidsgates wordt gebruikt.

Elke verwijdering moet worden gevolgd door `npm run build`, `npm run lint`, de relevante focused tests en `npm run test:all`. Omdat de aliases compatibiliteitsnamen zijn, moet daarnaast vóór verwijdering worden gecontroleerd of README’s, scripts buiten de standaard entrypoints of externe ontwikkeltools deze namen importeren.

## Uitgevoerde harmonisatie

Op 2026-08-21 zijn `buildWorkTicks` en `MOON_HOWLER_CHURCH_CURE_CHANCE` verwijderd. Er waren geen actuele callers in `src/`, `tests/` of scripts; alleen historische documentatie verwees naar de oude namen. De canonical exports `buildWorkHours` en `MOON_HOWLER_OUTCOME_CURE` blijven ongewijzigd.

De gerichte Moon Howler- en day-cycle-tests slaagden met **2 bestanden / 17 tests**. Build en lint slaagden eveneens. Knip rapporteert nu **3 duplicate-exportgroepen** in plaats van 5; de resterende groepen zijn de levensduuraliassen, spatial-queryalias en sprite-loaderalias.

## Tweede harmonisatieronde

Op 2026-08-21 zijn ook `forEachEntityInRadius` en `generateHumanSprites` verwijderd. Beide waren directe deprecated aliases zonder actuele callers in `src/`, `tests/` of scripts. De canonical exports `forEachInEntityGrid` en `loadHumanWalkSheets` blijven de enige runtime-ingangen.

De gerichte day-cycle-, Moon Howler- en renderer-tests slaagden met **3 bestanden / 24 tests**. De volledige regressie- en typecheck slaagde met **70 bestanden / 404 tests**. Build, lint en diff-check slaagden. Knip rapporteert nu nog **1 duplicate-exportgroep**: de levensduuraliassen in `dayCycle.ts`.

## Definitieve levensduurharmonisatie

Op 2026-08-21 zijn alle actieve callers van `HUMAN_ADULT_MAX_AGE` gemigreerd naar `HUMAN_MAX_LIFESPAN_YEARS`. Daarna zijn zowel `HUMAN_ADULT_MAX_AGE` als het ongebruikte `HUMAN_MAX_LIFESPAN_DAYS` verwijderd. De waarde en alle leeftijdsgates zijn ongewijzigd; alleen de naamgeving is geharmoniseerd.

De gerichte lifecycle-, jeugd-fertiliteits-, jeugdrelatie- en diagnostiektests slaagden met **4 bestanden / 22 tests**. Build en lint slaagden. De definitieve Knip-audit rapporteert geen duplicate-exportsectie meer. De resterende Knip-meldingen betreffen ongebruikte exports/types en bestanden, niet duplicate exports of unused imports.
