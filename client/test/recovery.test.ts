import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptRecovery, hasSavedRecovery, RECOVERY_STORAGE_KEY, removeSavedRecovery, saveRecovery, unlockRecovery } from '../src/recovery';

// Public BIP-39 test vector. Never fund this account.
const phrase = Array(11).fill('abandon').concat('about').join(' ');
const password = 'device-test-password';
function storage() {
  const values = new Map<string, string>();
  return {values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }};
}

test('opt-in recovery survives reload encrypted, requires password, and removes only its own record', async () => {
  const local = storage();
  local.setItem('relay-read-fid', '123');
  assert.equal(hasSavedRecovery(local), false);
  const encrypted = await encryptRecovery(`  ${phrase.toUpperCase().replaceAll(' ', '\n')}  `, password);
  assert.equal(local.getItem(RECOVERY_STORAGE_KEY), null, 'encryption itself does not persist anything');
  saveRecovery(encrypted, local);
  assert.equal(hasSavedRecovery(local), true);
  assert.ok(!encrypted.includes('abandon') && !encrypted.includes(password));
  assert.deepEqual(Object.keys(JSON.parse(encrypted)).sort(), ['ciphertext', 'iv', 'salt', 'version']);
  assert.equal(await unlockRecovery(password, local), phrase);
  await assert.rejects(unlockRecovery('wrong-password', local), /Could not unlock/);
  assert.equal(await unlockRecovery(password, local), phrase, 'bad password does not erase recovery');
  removeSavedRecovery(local);
  assert.equal(hasSavedRecovery(local), false);
  assert.equal(local.getItem('relay-read-fid'), '123');
  await assert.rejects(unlockRecovery(password, local), /No recovery/);
});

test('saving the same phrase twice uses different salt, IV and ciphertext', async () => {
  const a = JSON.parse(await encryptRecovery(phrase, password));
  const b = JSON.parse(await encryptRecovery(phrase, password));
  for (const field of ['salt', 'iv', 'ciphertext']) assert.notEqual(a[field], b[field]);
});

test('ciphertext tampering is rejected by authenticated decryption', async () => {
  const local = storage();
  const record = JSON.parse(await encryptRecovery(phrase, password));
  const bytes = Buffer.from(record.ciphertext, 'base64'); bytes[0] ^= 1;
  record.ciphertext = bytes.toString('base64');
  local.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(record));
  await assert.rejects(unlockRecovery(password, local), /Could not unlock/);
});

test('malformed and unsupported records fail without attempting an unbounded KDF', async () => {
  const local = storage();
  for (const raw of ['{', 'null', JSON.stringify({version: 99}), 'x'.repeat(8193), JSON.stringify({version: 1, salt: '?', iv: '', ciphertext: ''})]) {
    local.setItem(RECOVERY_STORAGE_KEY, raw);
    await assert.rejects(unlockRecovery(password, local), /Saved recovery is unreadable/);
  }
});

test('storage failures and weak passwords are actionable without leaking secrets', async () => {
  const blocked = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }};
  assert.equal(hasSavedRecovery(blocked), false);
  await assert.rejects(encryptRecovery(phrase, 'short'), /at least 12/);
  assert.throws(() => saveRecovery('ciphertext', blocked), /could not save/);
  assert.throws(() => removeSavedRecovery(blocked), /could not remove/);
  await assert.rejects(unlockRecovery(password, blocked), /could not read/);
});
