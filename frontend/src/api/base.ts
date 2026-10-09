/** Where the API lives: empty in development (the Vite proxy handles /api), the API's origin in production. */
const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

export const apiUrl = (path: string): string => `${BASE}${path}`
