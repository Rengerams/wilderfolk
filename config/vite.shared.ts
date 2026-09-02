import path from 'node:path';

/** Shared source paths used by Vite and Vitest entry configurations. */
export const srcAlias = {
  '@': path.resolve(import.meta.dirname, '../src'),
};
