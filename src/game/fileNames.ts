/** Filename-safe village slug: word characters, spaces and dashes only, capped at 40. */
export function villageFileSlug(villageName: string): string {
  return villageName
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'village';
}
