import type { Page } from '@playwright/test';
export async function openLanguage(page: Page) {
  await page
    .locator('header')
    .getByRole('button', { name: /^(Settings|Ajustes|Impostazioni)$/ })
    .click();
  await page.locator('button[aria-controls="language-options"]').click();
}
export async function closeSettings(page: Page) {
  await page.locator('#language-options').press('Escape');
  await page
    .getByRole('button', {
      name: /^(Back to previous page|Volver a la página anterior|Torna alla pagina precedente)$/,
    })
    .click();
}
