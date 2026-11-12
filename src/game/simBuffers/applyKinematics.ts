
import type { EntityCatalog } from '../entityCatalog';
import type { EntityRenderMeta } from './entityRenderMeta';
import type { RenderSoAReaderV1 } from './renderSoAReader';

/**
 * Mirrors the presentation-only kinematics (sprite attitude, walk phase, hit flash) from the render
 * SoA buffer onto the display catalogue. Simulation fields — `size`, `huntTargetId`, `chatTicks`,
 * `chatPhrase` — are owned by their tick writers and already arrive with the tick delta, so they are
 * never rewritten here. Position and velocity also stay unwritten, since the catalogue holds live
 * references to a past-tick snapshot.
 *
 * `_metaBySlot` remains part of the caller boundary; this pass no longer reads the sidecar.
 */
export function patchCatalogKinematicsFromRenderSoA(
  catalog: EntityCatalog,
  reader: RenderSoAReaderV1,
  _metaBySlot?: readonly EntityRenderMeta[] | null,
): void {
  reader.forEachSlot((slot) => {
    const id = reader.id(slot);
    const entity = catalog.getAny(id);
    if (!entity || !entity.alive) return;

    entity.spriteAngle = reader.spriteAngle(slot);
    entity.animFrame = reader.animFrame(slot);
    entity.flash = reader.flash(slot);
  });
}
