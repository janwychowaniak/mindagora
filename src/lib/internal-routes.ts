// Routes Astro registers in every SSR build whether the app uses them or not: the image endpoint of `astro:assets`
// and the server-islands endpoint of `server:defer`. MindAgora uses neither, and both carry open advisories in the
// Astro 5 line (image optimisation through sharp, unbounded server-islands request body), so the middleware answers
// 404 before they run. Remove the matching prefix the day the app adopts the feature.
const UNUSED_ASTRO_ROUTE_PREFIXES = ["/_image", "/_server-islands"];

export const isUnusedAstroRoute = (pathname: string): boolean =>
  UNUSED_ASTRO_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
