/** Where our own cached images live: the R2 bucket in production (VITE_IMAGE_BASE), the local /img folder in development. */
export const IMAGE_BASE: string = (import.meta.env.VITE_IMAGE_BASE as string | undefined) ?? '/img'
