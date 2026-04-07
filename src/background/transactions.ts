import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '../noble-ecc';
import { HDKey } from '@scure/bip32';
import type { UTXOData } from '../types/messages';
import { findAddressInfo } from './wallet';
import { getClient } from './electrum';

bitcoin.initEccLib(ecc);

const network = bitcoin.networks.bitcoin;

// ── Types ──

export interface BuildTxParams {
  xprv: string;
  xpub: string;
  utxos: UTXOData[];
  destination: string;
  amountSats: number;
  feeRate: number; // sat/vB
  changeAddress: string;
  selectedUtxos?: string[]; // txid:vout for coin control
}

export interface BuiltTransaction {
  hex: string;
  txid: string;
  fee: number;
  vsize: number;
  inputs: UTXOData[];
  outputs: Array<{ address: string; value: number }>;
}

export interface RicochetChain {
  transactions: BuiltTransaction[];
  totalFee: number;
  hops: string[]; // intermediate addresses
}

// ── Signer interface for bitcoinjs-lib v7 ──

interface Signer {
  publicKey: Buffer;
  sign(hash: Buffer): Buffer;
}

function createSigner(privateKey: Uint8Array, publicKey: Uint8Array): Signer {
  return {
    publicKey: Buffer.from(publicKey),
    sign(hash: Buffer): Buffer {
      const sig = ecc.sign(new Uint8Array(hash), privateKey);
      return Buffer.from(sig);
    },
  };
}

// ── UTXO selection: Branch and Bound ──

function branchAndBound(
  utxos: UTXOData[],
  target: number,
  feePerInput: number,
  costOfChange: number,
): UTXOData[] | null {
  const MAX_TRIES = 100_000;
  const sorted = [...utxos].sort((a, b) => b.value - a.value);

  let bestSelection: UTXOData[] | null = null;
  let bestWaste = Infinity;
  let tries = 0;

  function search(index: number, selected: UTXOData[], currentValue: number): void {
    if (tries++ > MAX_TRIES) return;

    const effectiveTarget = target + selected.length * feePerInput;

    if (currentValue >= effectiveTarget) {
      const waste = currentValue - effectiveTarget;
      if (waste < costOfChange && waste < bestWaste) {
        bestWaste = waste;
        bestSelection = [...selected];
      }
      return;
    }

    if (index >= sorted.length) return;

    let remaining = 0;
    for (let i = index; i < sorted.length; i++) {
      remaining += sorted[i]!.value;
    }
    if (currentValue + remaining < effectiveTarget) return;

    selected.push(sorted[index]!);
    search(index + 1, selected, currentValue + sorted[index]!.value);
    selected.pop();

    search(index + 1, selected, currentValue);
  }

  search(0, [], 0);
  return bestSelection;
}

function selectUTXOs(
  utxos: UTXOData[],
  target: number,
  feeRate: number,
  selectedIds?: string[]
): UTXOData[] {
  if (selectedIds && selectedIds.length > 0) {
    const idSet = new Set(selectedIds);
    return utxos.filter(u => idSet.has(`${u.txid}:${u.vout}`));
  }

  const feePerInput = Math.ceil(68 * feeRate);
  const costOfChange = Math.ceil(99 * feeRate);

  const bnb = branchAndBound(utxos, target, feePerInput, costOfChange);
  if (bnb) return bnb;

  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: UTXOData[] = [];
  let total = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;
    const fee = estimateTxFee(selected.length, 2, feeRate);
    if (total >= target + fee) break;
  }

  return selected;
}

// ── Fee estimation ──

function estimateTxFee(inputCount: number, outputCount: number, feeRate: number): number {
  const vsize = Math.ceil(10.5 + 68 * inputCount + 31 * outputCount);
  return Math.ceil(vsize * feeRate);
}

export function estimateFee(
  inputCount: number,
  outputCount: number,
  feeRate: number
): number {
  return estimateTxFee(inputCount, outputCount, feeRate);
}

// ── Sign inputs ──

function signTransaction(
  psbt: bitcoin.Psbt,
  inputs: UTXOData[],
  xprv: string,
  xpub: string
): void {
  const privNode = HDKey.fromExtendedKey(xprv);

  for (let i = 0; i < inputs.length; i++) {
    const utxo = inputs[i]!;
    const info = findAddressInfo(xpub, utxo.address);
    if (!info) throw new Error(`Address not found: ${utxo.address}`);

    const chainIndex = info.change ? 1 : 0;
    const child = privNode.deriveChild(chainIndex).deriveChild(info.index);
    if (!child.privateKey || !child.publicKey) throw new Error('Failed to get private key');

    const signer = createSigner(child.privateKey, child.publicKey);
    psbt.signInput(i, signer);
  }
}

// ── Helper: add PSBT input ──

async function addPsbtInput(
  psbt: bitcoin.Psbt,
  utxo: UTXOData
): Promise<void> {
  const client = getClient();
  const rawHex = await client.getTransaction(utxo.txid);
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: bitcoin.address.toOutputScript(utxo.address, network),
      value: BigInt(utxo.value),
    },
    nonWitnessUtxo: Buffer.from(rawHex, 'hex'),
  });
}

// ── Helper: add PSBT output ──

function addPsbtOutput(psbt: bitcoin.Psbt, address: string, value: number): void {
  psbt.addOutput({ address, value: BigInt(value) });
}

// ── Build simple transaction ──

export async function buildTransaction(params: BuildTxParams): Promise<BuiltTransaction> {
  const { xprv, xpub, utxos, destination, amountSats, feeRate, changeAddress, selectedUtxos } = params;

  const selected = selectUTXOs(utxos, amountSats, feeRate, selectedUtxos);
  const totalInput = selected.reduce((sum, u) => sum + u.value, 0);

  let fee = estimateTxFee(selected.length, 2, feeRate);
  let change = totalInput - amountSats - fee;

  const DUST_THRESHOLD = 546;
  let outputCount = 2;
  if (change < DUST_THRESHOLD) {
    outputCount = 1;
    fee = totalInput - amountSats;
    change = 0;
  }

  if (totalInput < amountSats + fee) {
    throw new Error('Insufficient funds');
  }

  fee = estimateTxFee(selected.length, outputCount, feeRate);
  change = totalInput - amountSats - fee;
  if (change < 0) throw new Error('Insufficient funds');
  if (change < DUST_THRESHOLD) {
    fee = totalInput - amountSats;
    change = 0;
    outputCount = 1;
  }

  const psbt = new bitcoin.Psbt({ network });
  const outputs: Array<{ address: string; value: number }> = [];

  for (const utxo of selected) {
    await addPsbtInput(psbt, utxo);
  }

  addPsbtOutput(psbt, destination, amountSats);
  outputs.push({ address: destination, value: amountSats });

  if (change > 0) {
    addPsbtOutput(psbt, changeAddress, change);
    outputs.push({ address: changeAddress, value: change });
  }

  signTransaction(psbt, selected, xprv, xpub);
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();

  return {
    hex: tx.toHex(),
    txid: tx.getId(),
    fee,
    vsize: tx.virtualSize(),
    inputs: selected,
    outputs,
  };
}

// ── Stonewall (fake 2-party) ──

export async function buildStonewall(params: BuildTxParams): Promise<BuiltTransaction> {
  const { xprv, xpub, utxos, destination, amountSats, feeRate, changeAddress, selectedUtxos } = params;

  const halfAmount = Math.floor(amountSats / 2);
  const remainder = amountSats - halfAmount;

  const estFee = estimateTxFee(3, 4, feeRate);
  const selected = selectUTXOs(utxos, amountSats + estFee, feeRate, selectedUtxos);
  const totalInput = selected.reduce((sum, u) => sum + u.value, 0);

  const fee = estimateTxFee(selected.length, 4, feeRate);
  const totalChange = totalInput - amountSats - fee;

  if (totalChange < 0) throw new Error('Insufficient funds for Stonewall');

  const DUST_THRESHOLD = 546;
  const change1 = Math.floor(totalChange / 2);
  const change2 = totalChange - change1;

  const psbt = new bitcoin.Psbt({ network });
  const outputs: Array<{ address: string; value: number }> = [];

  for (const utxo of selected) {
    await addPsbtInput(psbt, utxo);
  }

  const rawOutputs: Array<{ address: string; value: number }> = [
    { address: destination, value: halfAmount },
    { address: destination, value: remainder },
  ];

  if (change1 > DUST_THRESHOLD) {
    rawOutputs.push({ address: changeAddress, value: change1 });
  }

  // Derive a second change address
  const info = findAddressInfo(xpub, changeAddress);
  if (info && change2 > DUST_THRESHOLD) {
    const node = HDKey.fromExtendedKey(xpub);
    const nextChange = node.deriveChild(1).deriveChild(info.index + 1);
    if (nextChange.publicKey) {
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(nextChange.publicKey),
        network,
      });
      if (address) {
        rawOutputs.push({ address, value: change2 });
      }
    }
  }

  // Shuffle outputs to break ordering heuristics
  const shuffled = rawOutputs
    .filter(o => o.value > 0)
    .sort(() => Math.random() - 0.5);

  for (const out of shuffled) {
    addPsbtOutput(psbt, out.address, out.value);
    outputs.push(out);
  }

  signTransaction(psbt, selected, xprv, xpub);
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();

  return {
    hex: tx.toHex(),
    txid: tx.getId(),
    fee,
    vsize: tx.virtualSize(),
    inputs: selected,
    outputs,
  };
}

// ── Ricochet (2 intermediate hops — full chain) ──

function deriveHopAddress(xpub: string, hopIndex: number): string {
  const node = HDKey.fromExtendedKey(xpub);
  // Use high-index internal addresses (m/84'/0'/0'/1/90+) for hops
  const child = node.deriveChild(1).deriveChild(90 + hopIndex);
  if (!child.publicKey) throw new Error('Failed to derive hop address');
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network,
  });
  if (!address) throw new Error('Failed to generate hop address');
  return address;
}

function signHopTransaction(
  psbt: bitcoin.Psbt,
  xprv: string,
  hopIndex: number,
): void {
  const privNode = HDKey.fromExtendedKey(xprv);
  const child = privNode.deriveChild(1).deriveChild(90 + hopIndex);
  if (!child.privateKey || !child.publicKey) throw new Error('Failed to get hop signing key');
  const signer = createSigner(child.privateKey, child.publicKey);
  psbt.signInput(0, signer);
}

export async function buildRicochet(params: BuildTxParams): Promise<RicochetChain> {
  const { xprv, xpub, utxos, destination, amountSats, feeRate, changeAddress, selectedUtxos } = params;

  const hopFee = estimateTxFee(1, 1, feeRate);
  const totalExtraFee = hopFee * 2;
  const totalNeeded = amountSats + totalExtraFee;

  const selected = selectUTXOs(utxos, totalNeeded, feeRate, selectedUtxos);
  const totalInput = selected.reduce((sum, u) => sum + u.value, 0);

  const mainFee = estimateTxFee(selected.length, 2, feeRate);
  const totalFee = mainFee + totalExtraFee;
  const change = totalInput - amountSats - totalFee;

  if (change < 0) throw new Error('Insufficient funds for Ricochet');

  const hop1Address = deriveHopAddress(xpub, 0);
  const hop2Address = deriveHopAddress(xpub, 1);
  const DUST_THRESHOLD = 546;

  const transactions: BuiltTransaction[] = [];

  // ── TX 1: wallet UTXOs → hop1 + change ──
  const psbt1 = new bitcoin.Psbt({ network });
  for (const utxo of selected) {
    await addPsbtInput(psbt1, utxo);
  }

  const hop1Amount = amountSats + hopFee * 2;
  addPsbtOutput(psbt1, hop1Address, hop1Amount);
  const tx1Outputs: Array<{ address: string; value: number }> = [
    { address: hop1Address, value: hop1Amount },
  ];

  if (change > DUST_THRESHOLD) {
    addPsbtOutput(psbt1, changeAddress, change);
    tx1Outputs.push({ address: changeAddress, value: change });
  }

  signTransaction(psbt1, selected, xprv, xpub);
  psbt1.finalizeAllInputs();
  const rawTx1 = psbt1.extractTransaction();

  transactions.push({
    hex: rawTx1.toHex(),
    txid: rawTx1.getId(),
    fee: mainFee,
    vsize: rawTx1.virtualSize(),
    inputs: selected,
    outputs: tx1Outputs,
  });

  // ── TX 2: hop1 → hop2 ──
  const hop2Amount = amountSats + hopFee;
  const psbt2 = new bitcoin.Psbt({ network });
  psbt2.addInput({
    hash: rawTx1.getId(),
    index: 0,
    witnessUtxo: {
      script: bitcoin.address.toOutputScript(hop1Address, network),
      value: BigInt(hop1Amount),
    },
  });
  addPsbtOutput(psbt2, hop2Address, hop2Amount);

  signHopTransaction(psbt2, xprv, 0);
  psbt2.finalizeAllInputs();
  const rawTx2 = psbt2.extractTransaction();

  transactions.push({
    hex: rawTx2.toHex(),
    txid: rawTx2.getId(),
    fee: hopFee,
    vsize: rawTx2.virtualSize(),
    inputs: [{ txid: rawTx1.getId(), vout: 0, value: hop1Amount, address: hop1Address, height: 0 }],
    outputs: [{ address: hop2Address, value: hop2Amount }],
  });

  // ── TX 3: hop2 → final destination ──
  const psbt3 = new bitcoin.Psbt({ network });
  psbt3.addInput({
    hash: rawTx2.getId(),
    index: 0,
    witnessUtxo: {
      script: bitcoin.address.toOutputScript(hop2Address, network),
      value: BigInt(hop2Amount),
    },
  });
  addPsbtOutput(psbt3, destination, amountSats);

  signHopTransaction(psbt3, xprv, 1);
  psbt3.finalizeAllInputs();
  const rawTx3 = psbt3.extractTransaction();

  transactions.push({
    hex: rawTx3.toHex(),
    txid: rawTx3.getId(),
    fee: hopFee,
    vsize: rawTx3.virtualSize(),
    inputs: [{ txid: rawTx2.getId(), vout: 0, value: hop2Amount, address: hop2Address, height: 0 }],
    outputs: [{ address: destination, value: amountSats }],
  });

  return {
    transactions,
    totalFee,
    hops: [hop1Address, hop2Address],
  };
}
