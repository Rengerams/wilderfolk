import path from 'node:path';

// Veilige fallback voor import.meta.dirname in modernere Node.js omgevingen
const currentDir = import.meta.dirname ?? path.resolve();

/** Shared source paths used by Vite and Vitest entry configurations. */
export const srcAlias = {
  '@': path.resolve(currentDir, '../src'),
};