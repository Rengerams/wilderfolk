import type { EntityCatalog } from '../entityCatalog';
import type { EntityRenderMeta } from './entityRenderMeta';
import type { RenderSoAReaderV1 } from './renderSoAReader';
import { RESIDENCE_BUILDING_NONE } from './schema';

/**
 * Phase C — sync catalog positions from render SoA.
 * When metaBySlot is provided, also sync speech bubble text (chatPhrase).
 */
export function patchCatalogKinematicsFromRenderSoA(
  catalog: EntityCatalog,
  reader: RenderSoAReaderV1,
  metaBySlot?: EntityRenderMeta[] | null,
): void {
  reader.forEachSlot((slot) => {
    const entity = catalog.getAny(reader.id(slot));
    if (!entity?.alive) return;

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

    // Phrase lives in meta sidecar — without this, bubbles show dots only on worker path.
    if (metaBySlot) {
      const meta = metaBySlot[slot];
      if (chatTicks > 0) {
        if (meta?.chatPhrase) entity.chatPhrase = meta.chatPhrase;
      } else {
        entity.chatPhrase = undefined;
      }
    } else if (chatTicks <= 0) {
      entity.chatPhrase = undefined;
    }

    const huntTargetId = reader.huntTargetId(slot);
    entity.huntTargetId = huntTargetId ?? undefined;

    const residenceId = reader.residenceBuildingId(slot);
    entity.residenceBuildingId = residenceId !== RESIDENCE_BUILDING_NONE
      ? residenceId
      : undefined;
  });
}
