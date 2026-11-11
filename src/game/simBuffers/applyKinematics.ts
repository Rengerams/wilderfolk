
import type { EntityCatalog } from '../entityCatalog';
import type { EntityRenderMeta } from './entityRenderMeta';
import type { RenderSoAReaderV1 } from './renderSoAReader';

/**
 * Syncs catalog animation frames, sprite attitude and speech bubbles from the render SoA buffer;
 * position and velocity stay unwritten, since the catalog holds live references to a past-tick snapshot.
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

  });
}
