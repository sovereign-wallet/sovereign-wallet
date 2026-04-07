// Hardware wallet support — watch-only mode via xpub import
// Supports Coldcard and Keystone via PSBT file exchange

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '../noble-ecc';

bitcoin.initEccLib(ecc);

const network = bitcoin.networks.bitcoin;

// ── Storage keys ──

const HW_MODE_KEY = 'sovereign_hw_mode'; // 'full' | 'watch-only'
const HW_DEVICE_KEY = 'sovereign_hw_device'; // 'coldcard' | 'keystone' | null

export type HWDevice = 'coldcard' | 'keystone';
export type WalletMode = 'full' | 'watch-only';

// ── Mode management ──

export async function getWalletMode(): Promise<WalletMode> {
  const result = await chrome.storage.local.get(HW_MODE_KEY);
  return (result[HW_MODE_KEY] as WalletMode) ?? 'full';
}

export async function setWalletMode(mode: WalletMode): Promise<void> {
  await chrome.storage.local.set({ [HW_MODE_KEY]: mode });
}

export async function getHWDevice(): Promise<HWDevice | null> {
  const result = await chrome.storage.local.get(HW_DEVICE_KEY);
  return (result[HW_DEVICE_KEY] as HWDevice) ?? null;
}

export async function setHWDevice(device: HWDevice): Promise<void> {
  await chrome.storage.local.set({ [HW_DEVICE_KEY]: device });
}

// ── xpub import ──

export function validateXpub(xpub: string): { valid: boolean; error?: string } {
  // Accept xpub, ypub, zpub formats
  if (!xpub || xpub.length < 100) {
    return { valid: false, error: 'Invalid xpub: too short' };
  }

  const validPrefixes = ['xpub', 'ypub', 'zpub', 'tpub'];
  const prefix = xpub.slice(0, 4);
  if (!validPrefixes.includes(prefix)) {
    return { valid: false, error: `Invalid prefix "${prefix}". Expected xpub, ypub, or zpub.` };
  }

  try {
    const { HDKey } = require('@scure/bip32') as typeof import('@scure/bip32');
    HDKey.fromExtendedKey(xpub);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid xpub format' };
  }
}

export async function setupWatchOnly(xpub: string, device: HWDevice): Promise<void> {
  // Store xpub for read-only operations (same key as full wallet)
  await chrome.storage.local.set({
    sovereign_xpub: xpub,
    [HW_MODE_KEY]: 'watch-only',
    [HW_DEVICE_KEY]: device,
    // Mark that vault "exists" so the app doesn't show onboarding
    sovereign_vault: JSON.stringify({ watchOnly: true }),
  });
}

// ── PSBT operations ──

export function createUnsignedPSBT(psbtHex: string): string {
  // Convert internal PSBT to base64 for file export
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network });
  return psbt.toBase64();
}

export function psbtToBase64(psbtBuffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < psbtBuffer.length; i++) {
    binary += String.fromCharCode(psbtBuffer[i]!);
  }
  return btoa(binary);
}

export function base64ToPsbt(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function extractSignedTx(psbtBase64: string): { hex: string; txid: string } {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  // Check if all inputs are finalized
  try {
    psbt.finalizeAllInputs();
  } catch {
    // Already finalized or partially signed — try to extract anyway
  }

  const tx = psbt.extractTransaction();
  return {
    hex: tx.toHex(),
    txid: tx.getId(),
  };
}

export function validateSignedPSBT(psbtBase64: string): { valid: boolean; error?: string } {
  try {
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
    // Check that at least one input has signatures
    let hasSigs = false;
    for (let i = 0; i < psbt.data.inputs.length; i++) {
      const input = psbt.data.inputs[i];
      if (input?.partialSig?.length || input?.finalScriptWitness || input?.finalScriptSig) {
        hasSigs = true;
        break;
      }
    }
    if (!hasSigs) {
      return { valid: false, error: 'PSBT has no signatures. Sign it with your hardware wallet first.' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid PSBT' };
  }
}
