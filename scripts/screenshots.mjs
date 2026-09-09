/**
 * Captures the README's product screenshots against a running instance.
 *
 *   BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
 *
 * Uses the locally installed Google Chrome (channel: 'chrome') rather than a
 * downloaded Chromium build, so it needs no extra browser download.
 *
 * It creates a throwaway account, walks the full contact lifecycle, and writes
 * PNGs into docs/. Steps that need a working backend are skipped with a warning
 * if the app is not wired to Neon yet, so the script is still useful for
 * capturing the auth screens alone.
 */
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = 'docs';

const stamp = Date.now();
const USER = {
  name: 'Demo User',
  email: `demo-${stamp}@example.com`,
  password: 'Demo-Password-123',
};

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

const CONTACTS = [
  {
    name: 'Priya Raman',
    company: 'Genentech',
    role: 'Director, Commercial Strategy',
    where_met: 'Haas healthcare panel',
    notes: 'Offered to intro me to her team lead. Follow up in October.',
    priority: 'High',
  },
  {
    name: 'Marcus Webb',
    company: 'Salesforce',
    role: 'Senior PM',
    where_met: 'Berkeley Tech Club mixer',
    notes: 'Berkeley MBA 2019. Happy to do a mock PM interview.',
    priority: 'Medium',
  },
  {
    name: 'Ana Duarte',
    company: 'Sutter Hill Ventures',
    role: 'Investor',
    where_met: 'Startup showcase',
    notes: 'Interested in the healthcare rotation project.',
    priority: 'High',
  },
  {
    name: 'Tom Ishikawa',
    company: 'Bain',
    role: 'Consultant',
    where_met: 'Case prep workshop',
    notes: '',
    priority: 'Low',
  },
];

const shots = [];

async function shot(page, name) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  shots.push(file);
  console.log(`  ✓ ${file}`);
}

/** Waits until the contact list has actually rendered (not the loading skeleton). */
async function waitForList(page, expectedText) {
  await page.getByText(expectedText, { exact: true }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

async function fillContact(page, contact) {
  await page.getByRole('button', { name: 'Add contact' }).first().click();

  // Scope to the dialog: the list behind it has its own "Priority" filter.
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(contact.name);
  await dialog.getByLabel('Company').fill(contact.company);
  await dialog.getByLabel('Role', { exact: true }).fill(contact.role);
  await dialog.getByLabel('Where you met').fill(contact.where_met);
  if (contact.notes) await dialog.getByLabel('Notes').fill(contact.notes);

  await dialog.getByLabel('Priority').click();
  await page.getByRole('option', { name: contact.priority }).click();

  await dialog.getByRole('button', { name: 'Add contact' }).click();
  await page.waitForTimeout(700);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: DESKTOP });
  // A freshly started dev server compiles routes on first hit; give it room.
  context.setDefaultNavigationTimeout(90_000);
  const page = await context.newPage();

  console.log(`Capturing against ${BASE_URL}`);

  // --- Auth screens (work without a backend) -------------------------------
  await page.goto(`${BASE_URL}/auth/sign-in`, { waitUntil: 'networkidle' });
  await shot(page, '01-sign-in');

  await page.goto(`${BASE_URL}/auth/sign-up`, { waitUntil: 'networkidle' });
  await page.getByLabel('Name').fill(USER.name);
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Password').fill(USER.password);
  await shot(page, '02-sign-up-filled');

  // --- Everything below needs Neon ----------------------------------------
  await page.getByRole('button', { name: 'Create account' }).click();

  try {
    await page.waitForURL('**/contacts', { timeout: 20_000 });
  } catch {
    console.warn(
      '\n  ! Sign-up did not reach /contacts — the app is probably not wired to Neon yet.',
    );
    console.warn('    Captured the auth screens only. Re-run once Neon is configured.\n');
    await browser.close();
    return;
  }

  await waitForList(page, 'No contacts yet');
  await shot(page, '03-empty-state');

  for (const contact of CONTACTS) await fillContact(page, contact);
  await waitForList(page, '4 contacts');
  await shot(page, '04-contact-list');

  // Invalid input failing safely: blank name, rejected by the server.
  await page.getByRole('button', { name: 'Add contact' }).first().click();
  await page.getByRole('dialog').getByLabel('Company').fill('No Name Corp');
  await page.getByRole('dialog').getByRole('button', { name: 'Add contact' }).click();
  await page.getByRole('dialog').getByText('Name is required.').waitFor();
  await shot(page, '05-invalid-input-rejected');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(400);

  // Sorting and filtering.
  await page.getByLabel('Filter by priority').click();
  await page.getByRole('option', { name: 'High' }).click();
  await waitForList(page, '2 contacts');
  await shot(page, '06-filtered-high-priority');

  await page.getByLabel('Filter by priority').click();
  await page.getByRole('option', { name: 'All priorities' }).click();
  await waitForList(page, '4 contacts');

  // Editing.
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('dialog').getByLabel('Notes').fill('Updated: coffee chat booked for next Tuesday.');
  await shot(page, '07-edit-contact');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await waitForList(page, '4 contacts');

  // Survives a refresh, because it lives in Postgres.
  await page.reload({ waitUntil: 'networkidle' });
  await waitForList(page, '4 contacts');
  await shot(page, '08-persists-after-refresh');

  // Mobile.
  const mobile = await browser.newContext({
    viewport: MOBILE,
    storageState: await context.storageState(),
  });
  mobile.setDefaultNavigationTimeout(90_000);
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${BASE_URL}/contacts`, { waitUntil: 'networkidle' });
  await waitForList(mobilePage, '4 contacts');
  await shot(mobilePage, '09-mobile-contact-list');
  await mobile.close();

  // Deleting. The app confirms with window.confirm; accept it.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await waitForList(page, '3 contacts');
  await shot(page, '10-after-delete');

  // Sign out lands back on the sign-in screen.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/auth/sign-in', { timeout: 15_000 });
  await page.waitForTimeout(400);
  await shot(page, '11-signed-out');

  await browser.close();
  console.log(`\nDone — ${shots.length} screenshots in ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
