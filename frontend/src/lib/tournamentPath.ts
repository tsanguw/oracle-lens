/**
 * The address of a tournament page: its readable slug (`/tournaments/worlds-2025`). The numeric id is only a fallback for
 * the minute or two after a release when the new front end is talking to an API that does not send slugs yet; either
 * address opens the page, and the page moves itself to the slug.
 */
export const tournamentPath = (t: { slug?: string; id: number }): string => `/tournaments/${t.slug ?? t.id}`
