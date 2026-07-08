import { ResourceIcon, type ResourceKey } from './ResourceIcons';
import { RESOURCE_LABELS } from './resourceLabels';

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toString();
}

const RESOURCE_STYLES: Record<ResourceKey, string> = {
  food: 'bg-green-900/40 text-green-400',
  wood: 'bg-amber-900/40 text-amber-400',
  stone: 'bg-stone-700/60 text-stone-300',
  gold: 'bg-yellow-900/40 text-yellow-300',
};

const ALERT_STYLES: Partial<Record<ResourceKey, string>> = {
  food: 'bg-rose-900/50 text-rose-300',
};

interface Props {
  resource: ResourceKey;
  value: number;
  max?: number;
  className?: string;
  alert?: boolean;
}

export default function ResourceBadge({ resource, value, max, className = '', alert = false }: Props) {
  const title = max !== undefined
    ? `${RESOURCE_LABELS[resource]} ${value} / ${max}`
    : `${RESOURCE_LABELS[resource]} ${value}`;

  const tone = alert && ALERT_STYLES[resource] ? ALERT_STYLES[resource] : RESOURCE_STYLES[resource];

  return (
    <span
      className={`flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium ${tone} ${
        alert ? 'ring-1 ring-rose-500/50' : ''
      } ${className}`}
      title={title}
    >
      <ResourceIcon resource={resource} />
      <span className="font-mono font-bold">{formatNumber(value)}</span>
    </span>
  );
}