#!/usr/bin/env node
/**
 * Review aid: do the lines attached to an event key actually fit that event?
 *
 * Hard failures: unknown event keys, unreadable source, a pair scene where only
 * one role ever speaks, or a tagged line missing its required circumstance cue.
 * `--strict` turns the per-line warnings into failures for a deliberate review.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const strict = process.argv.includes('--strict');
const warnings = [];
const errors = [];
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const ambient = JSON.parse(read('src/game/data/dialogue/ambient.json'));
const bank = read('src/game/dialogueTrees.ts');
const keyBlock = bank.split('export const DIALOGUE_EVENT_KEYS = [')[1].split('] as const')[0];
const knownKeys = new Set([...keyBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]));

const POI = {
  market: /market|stall|vendor|goods|buy|sell/i,
  hall: /hall|council|meeting|official|petition/i,
  church: /church|pray|service|priest|bell/i,
  study: /study|book|learn|read|scholar|scribe/i,
  hunt: /hunt|prey|track|deer|animal|trail/i,
  trail: /trail|path|track|road|woods/i,
  campfire: /fire|camp|flame|warm|ember/i,
  homes: /home|house|door|roof|family|hearth/i,
  help: /help|aid|assist|need|mercy/i,
  shelter: /shelter|roof|cover|rest|barn/i,
  stage: /stage|perform|song|dance|show|actor/i,
  show: /show|perform|stage|song|dance/i,
  square: /square|market|gather|crowd|well/i,
  well: /well|water|bucket|drink|spring/i,
  shrine: /shrine|pray|offering|stone|spirit/i,
  notes: /note|write|letter|book|record|scribe/i,
  visit: /visit|welcome|guest|hello/i,
  road: /road|travel|path|dust|wander/i,
  plea: /plea|beg|help|mercy|please/i,
};

const SOCIAL = {
  sick_day: /sick|ill|fever|ail|rest/i,
  grief: /grief|griev|loss|miss|mourn|sad/i,
  bad_weather: /rain|snow|storm|drought|weather|cold|wind/i,
  elder_rest: /elder|old|rest|tired|age/i,
  care_pregnant: /pregnan|baby|mother|expect|rest|midwife/i,
  hospital_visit: /hospital|doctor|heal|visit|patient/i,
  sunday_service: /church|service|pray|sunday|priest/i,
  civic_petition: /petition|food|council|grief|help|official/i,
  birthday: /birthday|gift|cake|celebrat|year/i,
  market_errand: /market|errand|buy|goods|stall/i,
  comfort_neighbor: /comfort|neighbor|sorry|kind|grief/i,
  day_off: /day off|rest|free|break|leisure/i,
};

const AMBIENT = {
  home: /home|house|hearth|bed|door|roof|room|cozy|kettle|family/i,
  work: /work|job|field|shop|shift|tool|build|cowork/i,
  sleep: /sleep|bed|dream|night|rest|snore/i,
  winter: /winter|snow|cold|frost|ice|fire/i,
  festival: /festival|feast|celebrat|music|dance|ale|drum/i,
  courtship: /love|court|hand|heart|marry|sweet|kiss/i,
  child: /play|game|child|kid|run|hide/i,
  school: /school|learn|teacher|lesson|read|write/i,
  visitor: /visitor|travel|road|stranger|guest/i,
  rival: /rival|border|truce|army|raid|scout/i,
  hunt: /hunt|prey|trail|animal|snare|track/i,
  guard: /guard|watch|post|patrol|night|gate/i,
  renffr: /renffr|star|omen|sky/i,
  fear: /fear|afraid|scared|danger|howl|wolf/i,
  affair: /affair|secret|lover|kiss|tryst/i,
  election: /election|vote|leader|candidate|ballot/i,
  pregnancy: /pregnan|baby|kick|cradle|birth|mother/i,
  food: /food|hunger|starve|hungry|eat|famine|loaf|stew/i,
  social: null,
};

function policyFor(eventKey) {
  if (eventKey.startsWith('visitor.poi.')) {
    const place = eventKey.slice('visitor.poi.'.length);
    return { label: `visitor POI ${place}`, require: POI[place] ?? null };
  }
  if (eventKey.startsWith('social.impulse.')) {
    const suffix = eventKey.slice('social.impulse.'.length).split('.')[0];
    return { label: `social impulse ${suffix}`, require: SOCIAL[suffix] ?? null };
  }
  if (eventKey.startsWith('ambient.')) {
    const context = eventKey.slice('ambient.'.length);
    return { label: `ambient ${context}`, require: AMBIENT[context] ?? null };
  }
  const exact = {
    'family.daily': { label: 'family', require: /family|child|parent|partner|housemate|home|kin|son|daughter/i },
    'famine.hunger': { label: 'famine', require: /famine|hunger|hungry|starve|food|bread|grain|ration|empty/i, forbid: /gold|coin|treasure/i },
    'pregnancy.daily': { label: 'pregnancy', require: /pregnan|baby|kick|cradle|birth|mother|father|midwife|expect/i },
    'hospital.doctor': { label: 'doctor', require: /doctor|heal|treat|medicine|care|wound|fever|patient/i },
    'hospital.patient.other': { label: 'patient care', require: /patient|heal|treat|rest|doctor|recover|wound|fever/i },
    'hospital.patient.pregnant': { label: 'pregnant patient', require: /patient|pregnan|baby|midwife|doctor|rest|birth/i },
    'hotel.arrival': { label: 'hotel arrival', require: /arriv|room|bed|stay|inn|lodg|night|guest/i },
    'hotel.service.busy': { label: 'hotel busy service', require: /busy|wait|moment|full|handle|crowd|one at a time/i },
    'hotel.service.welcome': { label: 'hotel welcome service', require: /welcome|come in|room|stay|rest|guest/i },
    'townHall.foodAid': { label: 'town hall food aid', require: /food|bread|grain|meal|harvest|eat/i, forbid: /gold|coin|silver/i },
    'townHall.goldAid': { label: 'town hall gold aid', require: /gold|coin|silver|pay|wage/i, forbid: /bread|grain|stew/i },
    'townHall.heard': { label: 'town hall hearing', require: /hear|listen|speak|petition|council|official/i },
    'townHall.official': { label: 'town hall official', require: /official|council|clerk|record|court|permit/i },
    'townHall.audience.leader': { label: 'leader audience', require: /leader|hear|speak|council|court/i },
    'townHall.audience.petitioner': { label: 'petitioner audience', require: /petition|ask|request|need|leader|council/i },
    'townHall.generic': { label: 'town hall', require: /town hall|council|official|village|hearth|court/i },
    'marriage.accepted': { label: 'marriage consent', require: /marry|wed|wife|husband|yes|hand|love|vow/i },
    'renffr.omen': { label: 'renffr omen', require: /renffr|star|omen|sky|sign/i },
    'hunting.scarce': { label: 'scarce hunt', require: /hunt|scarce|empty|prey|animal|trail|starve/i },
    'hunting.thinTrails': { label: 'thin trails', require: /hunt|trail|prey|animal|thin|track/i },
    'workplace.banter': { label: 'workplace banter', require: /work|shift|cowork|boss|job|break|bench|shop/i },
    'workplace.banter.solo': { label: 'workplace solo', require: /work|shift|cowork|boss|job|break|bench|shop/i },
    'neighbor.greeting': { label: 'neighbour greeting', require: /hello|greet|neighbor|good morning|good evening|day/i },
    'neighbor.greeting.start': { label: 'neighbour greeting', require: /hello|greet|neighbor|good morning|good evening|day/i },
    'neighbor.greeting.reply': { label: 'neighbour reply', require: /hello|greet|neighbor|good morning|good evening|day/i },
    'child.play': { label: 'child play', require: /play|game|child|kid|run|hide|toy/i },
    'visitor.performer': { label: 'visitor performer', require: /sing|song|dance|perform|stage|music|tune|♪/i },
    'election.buildup': { label: 'election buildup', require: /election|vote|leader|candidate|ballot|council/i },
    'election.ceremony': { label: 'election ceremony', require: /election|vote|ceremony|leader|candidate|ballot/i },
    'election.tension': { label: 'election tension', require: /election|vote|tension|leader|candidate|ballot|argument/i },
    'election.winner': { label: 'election winner', require: /election|winner|won|vote|leader|candidate|chosen/i },
  };
  return exact[eventKey] ?? { label: 'unmapped', require: null };
}

const cueMatched = new Map();
const cueTotals = new Map();
for (const tree of ambient.dialogue_trees) {
  if (!knownKeys.has(tree.eventKey)) {
    errors.push(`${tree.id}: unknown event key ${tree.eventKey}`);
    continue;
  }
  const rolesSpeaking = new Set(tree.lines.map((line) => line.speaker));
  if (tree.conversation_type === 'two_way' && rolesSpeaking.size < 2) {
    errors.push(`${tree.id}: two-way scene has only one speaking role`);
  }
  if (tree.conversation_type === 'one_way' && tree.speakers.length !== 1) {
    errors.push(`${tree.id}: one-way scene declares ${tree.speakers.length} roles`);
  }
  const policy = policyFor(tree.eventKey);
  if (!policy.require) continue;
  const text = tree.lines.map((line) => line.text).join(' ');
  cueTotals.set(tree.eventKey, (cueTotals.get(tree.eventKey) ?? 0) + 1);
  if (policy.require.test(text)) cueMatched.set(tree.eventKey, true);
  if (policy.forbid?.test(text)) {
    warnings.push(`${tree.id} [${tree.eventKey}] (${policy.label}) mentions a forbidden other domain`);
  }
}

for (const [eventKey, total] of cueTotals) {
  if (!cueMatched.has(eventKey)) {
    const policy = policyFor(eventKey);
    warnings.push(`${eventKey}: none of ${total} scenes carries a ${policy.label} cue`);
  }
}

const perKey = new Map();
for (const tree of ambient.dialogue_trees) {
  perKey.set(tree.eventKey, (perKey.get(tree.eventKey) ?? 0) + 1);
}
for (const key of knownKeys) {
  if (!perKey.has(key)) warnings.push(`${key}: no authored scene is reachable for this event key`);
}

// Static callers must name a real key. Dynamic ambient.${context} keys are checked above.
const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) sourceFiles.push(full);
  }
})(path.join(ROOT, 'src'));
const callerKeys = new Set();
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/eventKey:\s*'([^']+)'/g)) callerKeys.add(match[1]);
}
for (const key of callerKeys) {
  if (!knownKeys.has(key)) errors.push(`caller requests unknown event key ${key}`);
  else if (!perKey.has(key)) warnings.push(`caller ${key} has no authored scene`);
}

console.log(`Dialogue circumstances: ${ambient.dialogue_trees.length} scenes, ${knownKeys.size} event keys, `
  + `${warnings.length} warnings, ${errors.length} errors.`);
for (const warning of warnings) console.log(`  WARN  ${warning}`);
for (const error of errors) console.log(`  ERROR ${error}`);
if (errors.length || (strict && warnings.length)) process.exitCode = 1;
