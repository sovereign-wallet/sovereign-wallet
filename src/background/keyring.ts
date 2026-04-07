import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';

// ── Types ──

interface EncryptedVault {
  salt: string;   // base64
  iv: string;     // base64
  ciphertext: string; // base64
}

interface UnlockedState {
  seed: string;
  xprv: string;
  unlockedAt: number;
}

// ── Constants ──

const VAULT_KEY = 'sovereign_vault';
const NODE_URL_KEY = 'sovereign_node_url';
const PBKDF2_ITERATIONS = 100_000;
const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes

// ── Module state (lives only in service worker memory) ──

let unlockedState: UnlockedState | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ──

function base64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Core functions ──

export function generateSeed(): string {
  return bip39.generateMnemonic(256); // 24 words
}

export async function encryptVault(seed: string, password: string): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(seed) as BufferSource
  );

  return {
    salt: base64Encode(salt.buffer as ArrayBuffer),
    iv: base64Encode(iv.buffer as ArrayBuffer),
    ciphertext: base64Encode(ciphertext),
  };
}

export async function decryptVault(vault: EncryptedVault, password: string): Promise<string> {
  const salt = base64Decode(vault.salt);
  const iv = base64Decode(vault.iv);
  const ciphertext = base64Decode(vault.ciphertext);
  const key = await deriveKey(password, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Incorrect password');
  }
}

export async function saveVault(vault: EncryptedVault): Promise<void> {
  await chrome.storage.local.set({ [VAULT_KEY]: JSON.stringify(vault) });
}

export async function loadVault(): Promise<EncryptedVault | null> {
  const result = await chrome.storage.local.get(VAULT_KEY);
  const raw = result[VAULT_KEY] as string | undefined;
  if (!raw) return null;
  return JSON.parse(raw) as EncryptedVault;
}

export async function hasVault(): Promise<boolean> {
  const vault = await loadVault();
  return vault !== null;
}

// ── Lock / Unlock ──

function resetAutoLock(): void {
  if (autoLockTimer !== null) {
    clearTimeout(autoLockTimer);
  }
  autoLockTimer = setTimeout(() => {
    lockWallet();
  }, AUTO_LOCK_MS);
}

// ── Rate limiting ──

const RATE_LIMIT_KEY = 'sovereign_rate_limit';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

interface RateLimitState {
  attempts: number;
  lockedUntil: number;
}

async function getRateLimit(): Promise<RateLimitState> {
  const result = await chrome.storage.local.get(RATE_LIMIT_KEY);
  const raw = result[RATE_LIMIT_KEY] as string | undefined;
  if (!raw) return { attempts: 0, lockedUntil: 0 };
  return JSON.parse(raw) as RateLimitState;
}

async function setRateLimit(state: RateLimitState): Promise<void> {
  await chrome.storage.local.set({ [RATE_LIMIT_KEY]: JSON.stringify(state) });
}

async function resetRateLimit(): Promise<void> {
  await chrome.storage.local.remove(RATE_LIMIT_KEY);
}

export async function getLoginStatus(): Promise<{ attemptsLeft: number; lockedUntilMs: number }> {
  const state = await getRateLimit();
  if (state.lockedUntil > Date.now()) {
    return { attemptsLeft: 0, lockedUntilMs: state.lockedUntil };
  }
  if (state.lockedUntil > 0 && state.lockedUntil <= Date.now()) {
    await resetRateLimit();
    return { attemptsLeft: MAX_ATTEMPTS, lockedUntilMs: 0 };
  }
  return { attemptsLeft: MAX_ATTEMPTS - state.attempts, lockedUntilMs: 0 };
}

export async function unlockWallet(password: string): Promise<{ xpub: string }> {
  // Check rate limit
  const state = await getRateLimit();
  if (state.lockedUntil > Date.now()) {
    const remainMin = Math.ceil((state.lockedUntil - Date.now()) / 60_000);
    throw new Error(`Wallet locked for ${remainMin} minutes. Too many failed attempts.`);
  }

  const vault = await loadVault();
  if (!vault) throw new Error('No wallet configured');

  let seed: string;
  try {
    seed = await decryptVault(vault, password);
  } catch {
    const newAttempts = state.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await setRateLimit({ attempts: newAttempts, lockedUntil: Date.now() + LOCKOUT_MS });
      throw new Error('Incorrect password. Wallet locked for 30 minutes.');
    }
    await setRateLimit({ attempts: newAttempts, lockedUntil: 0 });
    const left = MAX_ATTEMPTS - newAttempts;
    throw new Error(`Incorrect password. ${left} attempt${left !== 1 ? 's' : ''} remaining.`);
  }

  // Success — reset rate limit
  await resetRateLimit();

  // Derive master key
  const seedBuffer = await bip39.mnemonicToSeed(seed);
  const master = HDKey.fromMasterSeed(new Uint8Array(seedBuffer));

  // BIP84 account path
  const account = master.derive("m/84'/0'/0'");
  if (!account.privateKey || !account.publicKey) {
    throw new Error('Key derivation failed');
  }

  const xprv = account.privateExtendedKey;
  const xpub = account.publicExtendedKey;

  unlockedState = {
    seed,
    xprv,
    unlockedAt: Date.now(),
  };

  resetAutoLock();

  // Store xpub for read-only operations
  await chrome.storage.local.set({ sovereign_xpub: xpub });

  return { xpub };
}

export function lockWallet(): void {
  unlockedState = null;
  if (autoLockTimer !== null) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

export function isLocked(): boolean {
  return unlockedState === null;
}

export function getXprv(): string {
  if (!unlockedState) throw new Error('Wallet is locked');
  resetAutoLock();
  return unlockedState.xprv;
}

export function getSeed(): string {
  if (!unlockedState) throw new Error('Wallet is locked');
  resetAutoLock();
  return unlockedState.seed;
}

export async function getStoredXpub(): Promise<string | null> {
  const result = await chrome.storage.local.get('sovereign_xpub');
  return (result['sovereign_xpub'] as string) ?? null;
}

// ── Node URL ──

export async function getNodeUrl(): Promise<string> {
  const result = await chrome.storage.local.get(NODE_URL_KEY);
  return (result[NODE_URL_KEY] as string) ?? '';
}

export async function setNodeUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [NODE_URL_KEY]: url });
}
