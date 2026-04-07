import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '../noble-ecc';
import { HDKey } from '@scure/bip32';
import type { UTXOData } from '../types/messages';
import { findAddressInfo } from './wallet';
import { getClient } from './electrum';

bitcoin.initEccLib(ecc);

const network = bitcoin.networks.bitcoin;
const RBF_SEQUENCE = 0xFFFFFFFD; // enables RBF (< 0xFFFFFFFE)

// ── Types ──

export interface RBFParams {
  originalTxHex: string;
  newFeeRate: number; // sat/vB
  xprv: string;
  xpub: string;
  utxos: UTXOData[]; // current UTXOs for finding originals
}

export interface RBFResult {
  hex: string;
  txid: string;
  newFee: number;
  oldFee: number;
}

// ── RBF detection ──

export function isRBFEnabled(txHex: string): boolean {
  const tx = bitcoin.Transaction.fromHex(txHex);
  for (let i = 0; i < tx.ins.length; i++) {
    if (tx.ins[i]!.sequence < 0xFFFFFFFE) {
      return true;
    }
  }
  return false;
}

// ── Build RBF replacement ──

export async function buildRBFTransaction(params: RBFParams): Promise<RBFResult> {
  const { originalTxHex, newFeeRate, xprv, xpub, utxos } = params;

  const originalTx = bitcoin.Transaction.fromHex(originalTxHex);
  const originalVsize = originalTx.virtualSize();

  // Calculate original fee (sum inputs - sum outputs)
  // We need to find the input values from our UTXO set
  let totalInput = 0;
  const inputInfos: Array<{ utxo: UTXOData; index: number }> = [];

  for (let i = 0; i < originalTx.ins.length; i++) {
    const inp = originalTx.ins[i]!;
    const txid = Buffer.from(inp.hash).reverse().toString('hex');
    const vout = inp.index;

    const utxo = utxos.find(u => u.txid === txid && u.vout === vout);
    if (utxo) {
      totalInput += utxo.value;
      inputInfos.push({ utxo, index: i });
    }
  }

  // Sum original outputs
  let totalOutput = 0;
  for (const out of originalTx.outs) {
    totalOutput += Number(out.value);
  }
  const oldFee = totalInput - totalOutput;

  // Calculate new fee
  const newFee = Math.ceil(originalVsize * newFeeRate);
  if (newFee <= oldFee) {
    throw new Error(`New fee (${newFee} sats) must be higher than original (${oldFee} sats)`);
  }

  const feeDiff = newFee - oldFee;

  // Rebuild the transaction with same inputs/outputs but adjusted change
  const psbt = new bitcoin.Psbt({ network });
  const client = getClient();

  // Add same inputs with RBF sequence
  for (const { utxo } of inputInfos) {
    const rawHex = await client.getTransaction(utxo.txid);
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      sequence: RBF_SEQUENCE,
      witnessUtxo: {
        script: bitcoin.address.toOutputScript(utxo.address, network),
        value: BigInt(utxo.value),
      },
      nonWitnessUtxo: Buffer.from(rawHex, 'hex'),
    });
  }

  // Add same outputs, reducing change by fee difference
  let changeReduced = false;
  for (let i = 0; i < originalTx.outs.length; i++) {
    const out = originalTx.outs[i]!;
    const addr = bitcoin.address.fromOutputScript(out.script, network);
    let value = Number(out.value);

    // Reduce the change output (last non-destination output, or largest output that isn't the payment)
    if (!changeReduced && i === originalTx.outs.length - 1) {
      value -= feeDiff;
      if (value < 546) {
        // Change is dust after fee increase — skip it entirely
        continue;
      }
      changeReduced = true;
    }

    psbt.addOutput({ address: addr, value: BigInt(value) });
  }

  // Sign
  const privNode = HDKey.fromExtendedKey(xprv);
  for (let i = 0; i < inputInfos.length; i++) {
    const { utxo } = inputInfos[i]!;
    const info = findAddressInfo(xpub, utxo.address);
    if (!info) throw new Error(`Dirección no encontrada: ${utxo.address}`);

    const chainIndex = info.change ? 1 : 0;
    const child = privNode.deriveChild(chainIndex).deriveChild(info.index);
    if (!child.privateKey || !child.publicKey) throw new Error('Key error');

    const { secp256k1 } = await import('@noble/curves/secp256k1.js');
    const signer = {
      publicKey: Buffer.from(child.publicKey),
      sign(hash: Buffer): Buffer {
        return Buffer.from(secp256k1.sign(new Uint8Array(hash), child.privateKey!, { lowS: true }));
      },
    };
    psbt.signInput(i, signer);
  }

  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();

  return {
    hex: tx.toHex(),
    txid: tx.getId(),
    newFee,
    oldFee,
  };
}
