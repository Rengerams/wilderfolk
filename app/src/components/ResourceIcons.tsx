import type { ReactElement } from 'react';
import type { ResourceKey } from './resourceLabels';

export type { ResourceKey } from './resourceLabels';

interface IconProps {
  className?: string;
}

export function WoodIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden>
      <rect x="2.5" y="4.25" width="7" height="3.5" rx="0.75" fill="#92400e" />
      <ellipse cx="2.75" cy="6" rx="1.1" ry="2" fill="#b45309" />
      <ellipse cx="9.25" cy="6" rx="0.9" ry="1.6" fill="#78350f" />
      <path d="M4 5.25h5M4 6.75h5" stroke="#78350f" strokeWidth="0.45" strokeLinecap="round" />
    </svg>
  );
}

export function StoneIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M2.5 8.5 4.5 3.5 7.5 4 10 7 7.5 9.5 4 9.5Z" fill="#57534e" />
      <path d="M5 4.5 7 5.25 6.25 7Z" fill="#a8a29e" opacity="0.55" />
      <path d="M8 6.5 9.25 7.75 7.75 8.75Z" fill="#78716c" opacity="0.7" />
    </svg>
  );
}

export function FoodIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M6 10V5.5" stroke="#15803d" strokeWidth="0.9" strokeLinecap="round" />
      <ellipse cx="4.6" cy="5" rx="1.35" ry="2.1" fill="#facc15" transform="rotate(-22 4.6 5)" />
      <ellipse cx="7.4" cy="5" rx="1.35" ry="2.1" fill="#fde047" transform="rotate(22 7.4 5)" />
      <ellipse cx="6" cy="4.1" rx="1.1" ry="1.8" fill="#eab308" />
      <path d="M6 2.8c.4-.8 1.2-1 1.6-.4" stroke="#16a34a" strokeWidth="0.7" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function GoldIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden>
      <circle cx="6" cy="6" r="5.5" fill="#a16207" />
      <circle cx="6" cy="6" r="4.25" fill="#ca8a04" />
      <circle cx="6" cy="6" r="3" fill="#eab308" />
      <ellipse cx="4.75" cy="4.25" rx="1.75" ry="1" fill="#fef08a" opacity="0.55" />
    </svg>
  );
}

const RESOURCE_ICONS = {
  wood: WoodIcon,
  stone: StoneIcon,
  food: FoodIcon,
  gold: GoldIcon,
} satisfies Record<ResourceKey, (props: IconProps) => ReactElement>;

export function ResourceIcon({ resource, className }: { resource: ResourceKey; className?: string }) {
  const Icon = RESOURCE_ICONS[resource];
  return <Icon className={className} />;
}