import { expect, type Page } from "@playwright/test";

// Astro renders the React islands on the server and hydrates them after the page loads; until then a form
// submits natively and controlled inputs are reset by React's first render. Every island carries an `ssr`
// attribute that Astro removes once it is hydrated, so "no island still marked ssr" means "safe to interact".
export const waitForHydration = async (page: Page) => {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
};
