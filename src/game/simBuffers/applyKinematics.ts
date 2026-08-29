import type { EntityCatalog } from '../entityCatalog';
import type { EntityRenderMeta } from './entityRenderMeta';
import type { RenderSoAReaderV1 } from './renderSoAReader';
import { RESIDENCE_BUILDING_NONE } from './schema';

/**
 * Syncs catalog positions, velocities, animation frames, and speech bubbles
 * from the binary render SoA buffer sent by the simulation worker.
 */
export function patchCatalogKinematicsFromRenderSoA(
  catalog: EntityCatalog,
  reader: RenderSoAReaderV1,
  metaBySlot?: readonly EntityRenderMeta[] | null,
): void {
  reader.forEachSlot((slot) => {
    const id = reader.id(slot);
    const entity = catalog.getAny(id);
    if (!entity || !entity.alive) return;

    entity.x = reader.x(slot);
    entity.y = reader.y(slot);
    entity.vx = reader.vx(slot);
    entity.vy = reader.vy(slot);
    entity.spriteAngle = reader.spriteAngle(slot);
    entity.animFrame = reader.animFrame(slot);
    entity.size = reader.size(slot);
    entity.flash = reader.flash(slot);

    const chatTicks = reader.chatTicks(slot);
    entity.chatTicks = chatTicks > 0 ? chatTicks : undefined;

    // Chat phrases are stored in the sidecar metadata array
    if (metaBySlot) {
      const meta = metaBySlot[slot];
      if (chatTicks > 0 && meta?.chatPhrase) {
        entity.chatPhrase = meta.chatPhrase;
      } else {
        entity.chatPhrase = undefined;
      }
    } else if (chatTicks <= 0) {
      entity.chatPhrase = undefined;
    }

    const huntTargetId = reader.huntTargetId(slot);
    entity.huntTargetId = huntTargetId ?? undefined;

    const residenceId = reader.residenceBuildingId(slot);
    entity.residenceBuildingId =
      residenceId !== RESIDENCE_BUILDING_NONE ? residenceId : undefined;
  });
}