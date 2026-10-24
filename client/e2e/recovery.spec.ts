import '../src/sdk-compat';
import { test, expect, type Page } from '@playwright/test';
import { Message } from '@farcaster/core';
import { RECOVERY_STORAGE_KEY } from '../src/recovery';

// Public test vector only. All API requests are intercepted; no live signer is registered.
const phrase = Array(11).fill('abandon').concat('about').join(' ');
const password = 'a-public-device-test-password';

async function mockNode(page: Page) {
  let registrations = 0;
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.postData() || '').not.toContain(phrase);
    expect(request.postData() || '').not.toContain(password);
    if (url.origin !== 'http://127.0.0.1:5187') return route.abort();
    if (url.pathname === '/api/config') return route.fulfill({json: {nodeUrl: 'http://127.0.0.1:5187/api/node', mode: 'local'}});
    if (!url.pathname.startsWith('/api/node/')) return route.continue();
    const endpoint = url.pathname.split('/').pop();
    switch (endpoint) {
      case 'info': return route.fulfill({json: {version: 'fixture', shardInfos: [{shardId: 1, maxHeight: 100, blockDelay: 0}]}});
      case 'onChainIdRegistryEventByAddress': return route.fulfill({json: {fid: 123}});
      case 'storageLimitsByFid': return route.fulfill({json: {limits: [{name: 'CASTS', limit: 100}]}});
      case 'signersByFid': return route.fulfill({json: {signers: [], currentUserNonce: registrations}});
      case 'signer': return route.fulfill({json: {signer: {nonce: registrations}}});
      case 'events': return route.fulfill({json: {events: [{id: 1}]}});
      case 'submitMessage': {
        const message = Message.decode(request.postDataBuffer()!);
        expect(message.data?.keyAddBody?.nonce).toBe(registrations + 1);
        registrations++;
        return route.fulfill({json: {hash: '0xfixture'}});
      }
      case 'castsByFid': case 'userDataByFid': case 'linksByFid': return route.fulfill({json: {messages: []}});
      default: throw new Error(`Unexpected fixture endpoint: ${endpoint}`);
    }
  });
  return () => registrations;
}

async function importPhrase(page: Page) {
  await page.getByRole('button', {name: 'Connect account', exact: true}).click();
  await page.getByRole('button', {name: 'Use an existing account', exact: true}).click();
  await page.getByRole('button', {name: 'Import an existing recovery phrase instead'}).click();
  await page.getByLabel('Recovery phrase (English)', {exact: true}).fill(phrase);
  await page.getByLabel('I understand this phrase controls my wallet.').check();
  await page.getByRole('button', {name: 'Find my account', exact: true}).click();
  await expect(page.getByText('FID 123', {exact: true})).toBeVisible();
}

for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
  test(`encrypted recovery and logout at ${viewport.width}px`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    const registrations = await mockNode(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/Farcaster/);
    await importPhrase(page);
    const optIn = page.getByLabel('Save recovery on this device');
    await expect(optIn).not.toBeChecked();
    await optIn.check();
    await page.getByLabel('New device password', {exact: true}).fill(password);
    await page.getByLabel('Confirm device password', {exact: true}).fill('does-not-match');
    const authorize = page.getByRole('button', {name: 'Authorize gasless app key', exact: true});
    await expect(authorize).toBeDisabled();
    await page.getByLabel('Confirm device password', {exact: true}).fill(password);
    await expect(authorize).toBeEnabled();
    await page.screenshot({path: testInfo.outputPath('save-recovery.png'), fullPage: true});
    await authorize.click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(registrations()).toBe(1);
    const encrypted = await page.evaluate(key => localStorage.getItem(key), RECOVERY_STORAGE_KEY);
    expect(encrypted).toBeTruthy(); expect(encrypted).not.toContain('abandon'); expect(encrypted).not.toContain(password);
    await page.getByLabel('What’s on your mind?', {exact: true}).fill('Private unsent draft');
    await page.getByRole('button', {name: 'Log out', exact: true}).click();
    await expect(page.getByLabel('What’s on your mind?', {exact: true})).toHaveValue('');
    await expect(page.getByRole('button', {name: 'Connect account', exact: true})).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), RECOVERY_STORAGE_KEY)).toBe(encrypted);
    await page.reload();
    await page.getByRole('button', {name: 'Connect account', exact: true}).click();
    await page.getByRole('button', {name: 'Unlock saved account', exact: true}).click();
    await page.getByLabel('Device password', {exact: true}).fill('wrong-password');
    await page.getByRole('button', {name: 'Unlock recovery', exact: true}).click();
    await expect(page.getByRole('alert')).toContainText('Could not unlock recovery');
    expect(registrations()).toBe(1);
    await page.getByLabel('Device password', {exact: true}).fill(password);
    await page.getByRole('button', {name: 'Unlock recovery', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Your saved account'})).toBeVisible();
    expect(registrations(), 'unlock alone does not authorize a signer').toBe(1);
    await page.getByRole('button', {name: 'Authorize gasless app key', exact: true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(registrations()).toBe(2);
    await page.getByRole('button', {name: 'Log out', exact: true}).click();
    await page.getByRole('button', {name: 'Connect account', exact: true}).click();
    await page.getByRole('button', {name: 'Remove saved recovery', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Unlock saved account', exact: true})).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), RECOVERY_STORAGE_KEY)).toBeNull();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({path: testInfo.outputPath('recovery-removed.png'), fullPage: true});
  });
}

test('phrase import is not persisted without explicit opt-in', async ({page}) => {
  await mockNode(page); await page.goto('/'); await importPhrase(page);
  await page.getByRole('button', {name: 'Authorize gasless app key', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), RECOVERY_STORAGE_KEY)).toBeNull();
});

test('failed storage still keeps the authorized session available for logout or revocation', async ({page}) => {
  await mockNode(page); await page.goto('/'); await importPhrase(page);
  await page.getByLabel('Save recovery on this device').check();
  await page.getByLabel('New device password', {exact: true}).fill(password);
  await page.getByLabel('Confirm device password', {exact: true}).fill(password);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Fixture: storage blocked', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, RECOVERY_STORAGE_KEY);
  await page.getByRole('button', {name: 'Authorize gasless app key', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('status').filter({hasText: 'recovery could not be saved'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Log out', exact: true})).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), RECOVERY_STORAGE_KEY)).toBeNull();
});
