/**
 * S128 — CMS Entity Pages walkthrough (dataset adopter).
 *
 * Drives the REAL running stack (fe-admin :8081, fe-user :8080, api :5000) and
 * captures a screenshot at every step. The screenshots are the source material
 * for docs/dev_log/20260711/walkthrough/S128_entity_pages.html.
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:8081 \
 *   PUBLIC_BASE_URL=http://localhost:8080 \
 *   npx playwright test plugins/dataset/tests/e2e/s128-entity-page-walkthrough.spec.ts --project=chromium
 */
import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const DATASET_ID = '605f4565-dd96-48ff-a34d-ee2281ba5c95';
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:8080';
const PUBLIC_DATASET_URL = `${PUBLIC_BASE}/data-store/environment/air-quality`;

const ASSETS = path.resolve(process.cwd(), '../docs/dev_log/20260711/walkthrough/assets');
fs.mkdirSync(ASSETS, { recursive: true });

const admin = { email: 'admin@example.com', password: 'AdminPass123@' };

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(ASSETS, name), fullPage: true });
}

async function loginAsAdmin(page: Page) {
  await page.goto(`/admin/datasets/${DATASET_ID}`);
  await page.waitForLoadState('networkidle');
  const emailBox = page
    .locator('input[type="email"], input#email, input[name="email"]')
    .first();
  if (await emailBox.isVisible().catch(() => false)) {
    await emailBox.fill(admin.email);
    await page.locator('input[type="password"]').first().fill(admin.password);
    await page
      .locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")')
      .first()
      .click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  }
}

test.describe('S128 CMS Entity Pages — dataset "Dataset page" tab', () => {
  test.setTimeout(120000);

  test('author a rich SEO page on a dataset and render it publicly', async ({ page }) => {
    // ---- 1. Admin dataset detail -------------------------------------------
    await loginAsAdmin(page);
    await page.goto(`/admin/datasets/${DATASET_ID}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="dataset-tab-details"]')).toBeVisible({ timeout: 20000 });
    await shot(page, '01-dataset-admin-details.png');

    // ---- 2. Open the "Dataset page" tab ------------------------------------
    const pageTab = page.locator('[data-testid="dataset-tab-page"]');
    await expect(pageTab).toBeVisible();
    await pageTab.click();
    await expect(page.locator('[data-testid="entity-page-tab"]')).toBeVisible({ timeout: 20000 });
    // the tab self-loads the entity page via GET; give it a moment to seed.
    await page.waitForTimeout(1000);
    await shot(page, '02-dataset-page-tab.png');

    // ---- 3. WYSIWYG content ------------------------------------------------
    await page.locator('[data-testid="entity-page-visual"]').first().click();
    const prose = page.locator('[data-testid="entity-page-tab"] .ProseMirror').first();
    await expect(prose).toBeVisible({ timeout: 20000 });
    await prose.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await prose.pressSequentially('Air Quality — hourly PM2.5 open dataset. ', { delay: 8 });
    await shot(page, '03-wysiwyg-content.png');

    // ---- 4. Insert an image into the text (HTML sub-tab has the insert btn) --
    await page.locator('[data-testid="entity-page-html"]').first().click();
    await page.locator('[data-testid="entity-page-insert-image"]').first().click();
    const firstImage = page.locator('.picker-overlay .picker__item').first();
    await expect(firstImage).toBeVisible({ timeout: 20000 });
    await firstImage.click();
    await page.locator('.picker__footer .btn--primary').click();
    await expect(page.locator('.picker-overlay')).toHaveCount(0, { timeout: 10000 });
    await expect(
      page.locator('[data-testid="entity-page-tab"] .cm-content').filter({ hasText: 'img' }),
    ).toHaveCount(1, { timeout: 10000 });
    await shot(page, '04-insert-image.png');

    // ---- 5. Add a stackable block (distinct area_name from the seeded one) ---
    await page.locator('[data-testid="entity-page-add-block"]').first().click();
    await page.locator('[data-testid="entity-page-block-area"]').last().fill('coverage');
    const blockBody = page.locator('[data-testid="entity-page-block-content"]').last();
    // the block body may be a ProseMirror or a textarea — handle both
    const blockProse = blockBody.locator('.ProseMirror').first();
    if (await blockProse.count()) {
      await blockProse.click();
      await blockProse.pressSequentially('Sensor calibration and QA methodology.', { delay: 5 });
    } else {
      await blockBody.click();
      await blockBody.fill('Sensor calibration and QA methodology.');
    }
    await shot(page, '05-add-block.png');

    // ---- 6. Custom CSS -----------------------------------------------------
    await page.locator('[data-testid="entity-page-css"]').first().click();
    const cssEditor = page.locator('[data-testid="entity-page-tab"] .cm-content:visible').first();
    await expect(cssEditor).toBeVisible({ timeout: 20000 });
    await cssEditor.click();
    await cssEditor.pressSequentially('h2{color:#0f766e} p{line-height:1.7}', { delay: 5 });
    await shot(page, '06-custom-css.png');

    // ---- 7. SEO fields -----------------------------------------------------
    await page.locator('[data-testid="entity-page-seo"]').first().scrollIntoViewIfNeeded().catch(() => {});
    const metaTitle = page.locator('[data-testid="seo-meta-title"]').first();
    await expect(metaTitle).toBeVisible({ timeout: 20000 });
    await metaTitle.fill('Air Quality Dataset — Hourly PM2.5 Open Data');
    await page
      .locator('[data-testid="seo-meta-description"]')
      .first()
      .fill('Download hourly PM2.5 air-quality readings. Methodology, coverage, and licensing included.');
    await shot(page, '07-seo-fields.png');

    // ---- 8. Live preview ---------------------------------------------------
    await page.locator('[data-testid="entity-page-preview"]').first().click();
    await page.waitForTimeout(600);
    await shot(page, '08-preview.png');

    // ---- 9. Save -----------------------------------------------------------
    await page.locator('[data-testid="entity-page-save"]').first().click();
    await expect(page.locator('[data-testid="entity-page-saved"]')).toBeVisible({ timeout: 20000 });
    await shot(page, '09-saved.png');

    // ---- 10. Reload → persistence ------------------------------------------
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="dataset-tab-page"]').click();
    await expect(page.locator('[data-testid="entity-page-tab"]')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200);
    await expect(page.locator('[data-testid="seo-meta-title"]').first()).toHaveValue(
      /Air Quality Dataset/,
      { timeout: 20000 },
    );
    await shot(page, '10-persisted-after-reload.png');

    // ---- 11. Public render -------------------------------------------------
    await page.goto(PUBLIC_DATASET_URL);
    await page.waitForLoadState('networkidle');
    const publicContent = page.locator('[data-testid="entity-page-content"]');
    await expect(publicContent).toBeVisible({ timeout: 25000 });
    await expect(publicContent).toContainText(/Air Quality/i);
    await shot(page, '11-public-render.png');
  });
});
