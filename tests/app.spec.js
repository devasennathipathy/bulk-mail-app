import { expect, test } from '@playwright/test';

test('validates, imports recipients, saves a draft, previews, and records a campaign in MongoDB', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Make their inbox a little brighter.' }),
  ).toBeVisible();
  const submit = page.getByRole('button', { name: 'Save preview', exact: true });
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await submit.click();
  await expect(page.getByText('Add at least one recipient.')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'people.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('email\nalex@example.com\nsam@example.com\nAlex@example.com'),
  });
  await expect(page.locator('#recipients')).toHaveValue('alex@example.com, sam@example.com');
  await page.getByRole('button', { name: 'Use a template' }).click();
  await page.getByRole('button', { name: 'A warm welcome' }).click();
  await expect(page.locator('#subject')).toHaveValue('A little hello from our team');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByRole('link', { name: /Drafts/ }).click();
  await expect(page.getByRole('button', { name: /^A little hello from our team/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^A little hello from our team/ }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('A peek into the inbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await submit.click();
  await expect(page.getByRole('status')).toContainText('No real emails were sent.');
  await expect(page.locator('#subject')).toHaveValue('');
  await page.getByRole('link', { name: 'Email history' }).click();
  await page
    .getByRole('button', { name: /A little hello from our team/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('alex@example.com');
  await expect(page.getByRole('dialog')).toContainText('sam@example.com');
  await expect(page.getByRole('dialog')).toContainText('Preview mode: no real email sent');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('textbox', { name: 'Search email history' }).fill('no-such-subject');
  await expect(page.getByRole('heading', { name: 'No matching messages' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('works on mobile without horizontal overflow and exposes working navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Workspace settings' }).click();
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check connection' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('backend outages preserve composing and provide an actionable setup state', async ({
  page,
}) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.goto('/');
  await expect(
    page.getByText('Your backend is offline. Start the app with npm run dev.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save preview', exact: true })).toBeDisabled();
  await page.locator('#subject').fill('An offline idea');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.reload();
  await expect(page.locator('#subject')).toHaveValue('An offline idea');
});
