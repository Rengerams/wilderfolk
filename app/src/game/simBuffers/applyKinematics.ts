import type { EntityCatalog } from '../entityCatalog';
import type { RenderSoAReaderV1 } from './renderSoAReader';

/** Phase C — sync catalog positions from render SoA (no full entity array scan). */
export function patchCatalogKinematicsFromRenderSoA(
  catalog: EntityCatalog,
  reader: RenderSoAReaderV1,
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

    const huntTargetId = reader.huntTargetId(slot);
    entity.huntTargetId = huntTargetId;

    const residenceId = reader.residenceBuildingId(slot);
    entity.residenceBuildingId = residenceId > 0 ? residenceId : undefined;
  });
}