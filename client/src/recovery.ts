// The password and decrypted phrase are never persisted. This vault is local to this origin.
export const RECOVERY_STORAGE_KEY = 'farcaster-recovery-v1';
type VaultStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const iterations = 600_000;
const context = new TextEncoder().encode('farcaster-client:recovery:v1');
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (!crypto.subtle) throw new Error('Saving recovery requires HTTPS or localhost.');
  const bytes = new TextEncoder().encode(password);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  } finally { bytes.fill(0); }
}

export function hasSavedRecovery(storage?: VaultStorage): boolean {
  try { return (storage ?? localStorage).getItem(RECOVERY_STORAGE_KEY) !== null; } catch { return false; }
}

export async function encryptRecovery(phrase: string, password: string): Promise<string> {
  if (password.length < 12) throw new Error('Use at least 12 characters for the device password.');
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 2048) throw new Error('Enter a recovery phrase first.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(normalized);
  try {
    const derived = await key(password, salt);
    const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: context}, derived, bytes);
    return JSON.stringify({version: 1, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext))});
  } finally { bytes.fill(0); }
}

export function saveRecovery(encrypted: string, storage?: VaultStorage): void {
  try { (storage ?? localStorage).setItem(RECOVERY_STORAGE_KEY, encrypted); }
  catch { throw new Error('This browser could not save recovery. Check its storage settings.'); }
}

export async function unlockRecovery(password: string, storage?: VaultStorage): Promise<string> {
  let raw: string | null;
  try { raw = (storage ?? localStorage).getItem(RECOVERY_STORAGE_KEY); }
  catch { throw new Error('This browser could not read saved recovery. Check its storage settings.'); }
  if (!raw) throw new Error('No recovery phrase is saved on this device.');
  let salt: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>, ciphertext: Uint8Array<ArrayBuffer>;
  try {
    if (raw.length > 8192) throw new Error();
    const record = JSON.parse(raw);
    if (record.version !== 1 || ![record.salt, record.iv, record.ciphertext].every(v => typeof v === 'string')) throw new Error();
    salt = decode(record.salt); iv = decode(record.iv); ciphertext = decode(record.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) throw new Error();
  } catch { throw new Error('Saved recovery is unreadable. Remove it and import your backup phrase again.'); }
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv, additionalData: context}, await key(password, salt), ciphertext);
  } catch { throw new Error('Could not unlock recovery. Check the password; the saved data may also be damaged.'); }
  const bytes = new Uint8Array(decrypted);
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  finally { bytes.fill(0); }
}

export function removeSavedRecovery(storage?: VaultStorage): void {
  try { (storage ?? localStorage).removeItem(RECOVERY_STORAGE_KEY); }
  catch { throw new Error('This browser could not remove saved recovery. Check its storage settings.'); }
}
