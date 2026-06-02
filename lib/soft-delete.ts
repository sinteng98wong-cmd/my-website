/**
 * Soft-delete filter helpers.
 * The `deletedAt` field is added by migration but Prisma client types won't
 * reflect it until `prisma generate` is run after the dev server restarts.
 * These helpers use `as any` so the build passes in the meantime.
 * After regeneration the casts can be removed if desired.
 */

/** Adds `deletedAt: null` to any Prisma where clause. */
export function notDeleted<T extends Record<string, any>>(where?: T): any {
  return { deletedAt: null, ...(where ?? {}) };
}

/** Plain `{ deletedAt: null }` for use as a standalone where. */
export const ACTIVE = { deletedAt: null } as any;
