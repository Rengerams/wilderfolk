import type { Entity } from '../gameTypes';
import { EntityType } from '../gameTypes';
import type { RenderSoAReaderV1 } from './renderSoAReader';
import {
  RESIDENCE_BUILDING_NONE,
  RENDER_FLAG_ALIVE,
  RENDER_FLAG_COMBAT,
  RENDER_FLAG_EDUCATED,
  RENDER_FLAG_FEMALE,
  RENDER_FLAG_JUVENILE,
  RENDER_FLAG_MALE,
  RENDER_FLAG_MOON_HOWLER,
  RENDER_FLAG_PREGNANT,
  RENDER_FLAG_RIVAL,
  RENDER_FLAG_TAMED,
  RENDER_FLAG_VISITOR,
} from './schema';

/** String + status fields kept off the Float32 render buffer (sidecar, keyed by slot). */
export interface EntityRenderMeta {
  id: number;
  name?: string;
  surname?: string;
  maidenSurname?: string;
  title?: string;
  chatPhrase?: string;
  gender?: 'male' | 'female';
  spriteVariant?: number;
  faction?: Entity['faction'];
  hiddenFromPlayer?: boolean;
  detectedByPatrol?: boolean;

  job?: Entity['job'];
  occupation?: string;
  generation?: number;

  moonHowlerCursed?: boolean;
  pregnant?: boolean;
  courtshipProgress?: number;
  relationshipStatus?: Entity['relationshipStatus'];
  partnerId?: number;
  affairPartnerId?: number;
  courtshipPartnerId?: number;
  homeBuildingId?: number;
  prisonBuildingId?: number;
  tamedBy?: number;
  skills?: Entity['skills'];
  combatTicks?: number;
  forageKind?: Entity['forageKind'];
  blueberryYield?: number;
}

export function packEntityRenderMeta(entity: Entity): EntityRenderMeta {
  return {
    id: entity.id,
    name: entity.name,
    surname: entity.surname,
    maidenSurname: entity.maidenSurname,
    title: entity.title,
    chatPhrase: entity.chatPhrase,
    gender: entity.gender,
    spriteVariant: entity.spriteVariant,
    faction: entity.faction,
    hiddenFromPlayer: entity.hiddenFromPlayer,
    detectedByPatrol: entity.detectedByPatrol,

    job: entity.job,
    occupation: entity.occupation,
    generation: entity.generation,

    moonHowlerCursed: entity.moonHowlerCursed,
    pregnant: entity.pregnant,
    courtshipProgress: entity.courtshipProgress,
    relationshipStatus: entity.relationshipStatus,
    partnerId: entity.partnerId,
    affairPartnerId: entity.affairPartnerId,
    courtshipPartnerId: entity.courtshipPartnerId,
    homeBuildingId: entity.homeBuildingId,
    prisonBuildingId: entity.prisonBuildingId,
    tamedBy: entity.tamedBy,
    skills: entity.skills ? { ...entity.skills } : {},
    combatTicks: entity.combatTicks,
    forageKind: entity.forageKind,
    blueberryYield: entity.blueberryYield,
  };
}

export function packRenderMetaForPacked(packed: Entity[]): EntityRenderMeta[] {
  return packed.map(packEntityRenderMeta);
}

export function packRenderMetaForAlive(world: { entities: Entity[] }): EntityRenderMeta[] {
  const entities = world.entities ?? [];
  const alive = entities.filter((e) => e.alive);
  return alive.map(packEntityRenderMeta);
}

function factionFromFlags(flags: number): Entity['faction'] {
  if (flags & RENDER_FLAG_RIVAL) return 'rival';
  if (flags & RENDER_FLAG_VISITOR) return 'visitor';
  return undefined;
}

/** Minimal Entity-shaped view for canvas draw helpers (Phase B — no full world clone). */
export function buildRenderEntityShim(
  reader: RenderSoAReaderV1,
  slot: number,
  meta?: EntityRenderMeta,
): Entity | null {
  const type = reader.type(slot);
  if (!type) return null;

  const flags = reader.flags(slot);
  const huntTargetId = reader.huntTargetId(slot);
  const residenceId = reader.residenceBuildingId(slot);
  const chatTicksRaw = reader.chatTicks(slot);

  return {
    id: reader.id(slot),
    type,
    x: reader.x(slot),
    y: reader.y(slot),
    vx: reader.vx(slot),
    vy: reader.vy(slot),
    spriteAngle: reader.spriteAngle(slot),
    animFrame: reader.animFrame(slot),
    size: reader.size(slot),
    flash: reader.flash(slot),
    huntTargetId,
    chatTicks: chatTicksRaw > 0 ? chatTicksRaw : undefined,
    residenceBuildingId: residenceId !== RESIDENCE_BUILDING_NONE ? residenceId : undefined,
    homeBuildingId: meta?.homeBuildingId,
    prisonBuildingId: meta?.prisonBuildingId,
    name: meta?.name,
    surname: meta?.surname,
    maidenSurname: meta?.maidenSurname,
    title: meta?.title,
    chatPhrase: meta?.chatPhrase,
    gender: meta?.gender ?? (flags & RENDER_FLAG_FEMALE ? 'female' : flags & RENDER_FLAG_MALE ? 'male' : undefined),
    spriteVariant: meta?.spriteVariant,
    faction: meta?.faction ?? factionFromFlags(flags),
    hiddenFromPlayer: meta?.hiddenFromPlayer,
    detectedByPatrol: meta?.detectedByPatrol,

    job: meta?.job,
    occupation: meta?.occupation,
    generation: meta?.generation ?? 0,

    moonHowlerCursed: meta?.moonHowlerCursed ?? !!(flags & RENDER_FLAG_MOON_HOWLER),
    pregnant: meta?.pregnant ?? !!(flags & RENDER_FLAG_PREGNANT),
    educated: !!(flags & RENDER_FLAG_EDUCATED),
    isJuvenile: !!(flags & RENDER_FLAG_JUVENILE),
    tamedBy: meta?.tamedBy ?? ((flags & RENDER_FLAG_TAMED) ? -1 : undefined),
    courtshipProgress: meta?.courtshipProgress,
    relationshipStatus: meta?.relationshipStatus,
    partnerId: meta?.partnerId,
    affairPartnerId: meta?.affairPartnerId,
    courtshipPartnerId: meta?.courtshipPartnerId,
    skills: meta?.skills ? { ...meta.skills } : {},
    combatTicks: meta?.combatTicks ?? ((flags & RENDER_FLAG_COMBAT) ? 1 : 0),
    forageKind: meta?.forageKind,
    blueberryYield: meta?.blueberryYield,
    alive: !!(flags & RENDER_FLAG_ALIVE),
    energy: 0,
    maxEnergy: 1,
    age: 0,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 1,
    speed: 1,
    reproductionCooldown: 0,
    childrenIds: [],
  };
}

export function isHumanSlot(reader: RenderSoAReaderV1, slot: number): boolean {
  return reader.type(slot) === EntityType.Human;
}
