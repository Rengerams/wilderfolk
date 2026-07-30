import { Fragment } from 'react';
import { ResourceIcon } from './ResourceIcons';
import type { ResourceKey } from './resourceLabels';
import { resourceCostEntries, type ResourceCostAmount } from '../game/resourceCost';

const RESOURCE_TONE: Record<ResourceKey, string> = {
  wood: 'text-amber-400',
  stone: 'text-stone-300',
  food: 'text-green-400',
  gold: 'text-yellow-300',
};

interface Props {
  cost: ResourceCostAmount;
  className?: string;
  iconClassName?: string;
  amountClassName?: string;
  emptyLabel?: string;
}

export function LabelWithResourceCost({
  label,
  cost,
  className = 'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5',
}: {
  label: string;
  cost?: ResourceCostAmount;
  className?: string;
}) {
  const entries = cost ? resourceCostEntries(cost) : [];
  return (
    <span className={className}>
      <span>{label}</span>
      {entries.length > 0 && (
        <>
          <span className="text-stone-600" aria-hidden>·</span>
          <ResourceCost cost={cost!} />
        </>
      )}
    </span>
  );
}

export default function ResourceCost({
  cost,
  className = '',
  iconClassName = 'h-3 w-3',
  amountClassName = 'font-mono text-[10px] font-semibold leading-none',
  emptyLabel = 'Free',
}: Props) {
  const entries = resourceCostEntries(cost);
  if (entries.length === 0) {
    return <span className={className}>{emptyLabel}</span>;
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 ${className}`}>
      {entries.map(({ key, amount }, index) => (
        <Fragment key={key}>
          {index > 0 && <span className="text-[9px] text-stone-600" aria-hidden>·</span>}
          <span className={`inline-flex items-center gap-0.5 ${RESOURCE_TONE[key]}`}>
            <ResourceIcon resource={key} className={iconClassName} />
            <span className={amountClassName}>{amount}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}