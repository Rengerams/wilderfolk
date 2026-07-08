import { BuildingType } from '../src/game/gameTypes';
import type { BuildingType as BuildingTypeName } from '../src/game/gameTypes';

/** Preset groups for SIM_BUILD_ALLOW / SIM_BUILD_DENY. */
export const SIM_BUILD_PRESETS: Record<string, BuildingTypeName[]> = {
  defense: [
    BuildingType.Wall,
    BuildingType.WallCorner,
    BuildingType.WallGate,
    BuildingType.Watchtower,
    BuildingType.Barracks,
  ],
  security: [
    BuildingType.Wall,
    BuildingType.WallCorner,
    BuildingType.WallGate,
    BuildingType.Watchtower,
    BuildingType.Barracks,
    BuildingType.Prison,
  ],
  economy: [
    BuildingType.Farm,
    BuildingType.Greenhouse,
    BuildingType.LumberMill,
    BuildingType.Quarry,
    BuildingType.Mine,
    BuildingType.Mill,
    BuildingType.Blacksmith,
    BuildingType.Workshop,
    BuildingType.Store,
    BuildingType.Market,
    BuildingType.Barn,
    BuildingType.Silo,
  ],
  housing: [BuildingType.House, BuildingType.Mansion],
  civic: [
    BuildingType.Church,
    BuildingType.School,
    BuildingType.Hospital,
    BuildingType.TownHall,
    BuildingType.TamingPost,
  ],
  infra: [BuildingType.Road, BuildingType.Well],
};

const ALL_TYPES = Object.values(BuildingType).filter(
  (v): v is BuildingTypeName => typeof v === 'string',
);

export interface SimBuildPolicy {
  allowList: ReadonlySet<BuildingTypeName> | null;
  denyList: ReadonlySet<BuildingTypeName>;
}

function normalizeBuildToken(raw: string): BuildingTypeName | null {
  const token = raw.trim().toLowerCase();
  if (!token) return null;
  if (SIM_BUILD_PRESETS[token]) return null;
  for (const value of ALL_TYPES) {
    if (value.toLowerCase() === token) return value;
  }
  for (const [key, value] of Object.entries(BuildingType)) {
    if (key.toLowerCase() === token) return value as BuildingTypeName;
  }
  return null;
}

function expandTokens(tokens: string[]): BuildingTypeName[] {
  const out = new Set<BuildingTypeName>();
  for (const raw of tokens) {
    const preset = SIM_BUILD_PRESETS[raw.trim().toLowerCase()];
    if (preset) {
      for (const type of preset) out.add(type);
      continue;
    }
    const type = normalizeBuildToken(raw);
    if (type) out.add(type);
  }
  return [...out];
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw?.trim()) return [];
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

export function parseSimBuildPolicy(): SimBuildPolicy {
  const deny = new Set<BuildingTypeName>(expandTokens(parseCsvEnv('SIM_BUILD_DENY')));
  const allowTokens = parseCsvEnv('SIM_BUILD_ALLOW');
  const allowList = allowTokens.length > 0
    ? new Set<BuildingTypeName>(expandTokens(allowTokens))
    : null;

  if (process.env.SIM_BUILD_DEFENSE === '0') {
    for (const type of SIM_BUILD_PRESETS.defense) deny.add(type);
  }

  return { allowList, denyList: deny };
}

export function isSimBuildAllowed(type: BuildingTypeName, policy: SimBuildPolicy): boolean {
  if (policy.allowList) return policy.allowList.has(type);
  return !policy.denyList.has(type);
}

export function filterSimBuildTypes(
  types: BuildingTypeName[],
  policy: SimBuildPolicy,
): BuildingTypeName[] {
  return types.filter((type) => isSimBuildAllowed(type, policy));
}

export function describeSimBuildPolicy(policy: SimBuildPolicy): string {
  if (policy.allowList) {
    return `allow-only [${[...policy.allowList].sort().join(', ')}]`;
  }
  if (policy.denyList.size === 0) return 'all building types allowed';
  return `deny [${[...policy.denyList].sort().join(', ')}]`;
}