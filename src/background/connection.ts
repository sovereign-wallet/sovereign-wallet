// Unified connection layer: routes to Electrum (WebSocket) or Esplora (REST)
// depending on the configured node type.

import { ElectrumClient, toElectrumScripthash } from './electrum';
import { EsploraClient } from './esplora-client';
import { KNOWN_NODES } from '../config/nodes';
import type { BalanceData, TransactionRecord, UTXOData, FeeRates, NodeInfo } from '../types/messages';
import { deriveAddresses } from './wallet-derive';

const SELECTED_NODE_KEY = 'selected_node_id';
const NODE_URL_KEY = 'sovereign_node_url';
const GAP_LIMIT = 20;

type ActiveClient =
  | { type: 'electrum'; client: ElectrumClient }
  | { type: 'esplora'; client: EsploraClient };

let activeClient: ActiveClient | null = null;

// ── Resolve which client to use ──

async function getNodeConfig(): Promise<{ url: string; connectionType: 'websocket' | 'rest' }> {
  const stored = await chrome.storage.local.get([SELECTED_NODE_KEY, NODE_URL_KEY]);
  const nodeId = (stored[SELECTED_NODE_KEY] as string) ?? 'own-node';
  const savedUrl = stored[NODE_URL_KEY] as string | undefined;

  const node = KNOWN_NODES.find(n => n.id === nodeId);
  const url = savedUrl ?? node?.url ?? '';
  const connectionType = node?.connectionType ?? 'websocket';

  return { url, connectionType };
}

export async function connectToNode(): Promise<void> {
  const { url, connectionType } = await getNodeConfig();
  if (!url) throw new Error('No node URL configured. Set one in Settings.');

  if (connectionType === 'rest') {
    const client = new EsploraClient(url);
    await client.getBlockHeight(); // test connection
    activeClient = { type: 'esplora', client };
  } else {
    const client = new ElectrumClient(url);
    await client.connect();
    await client.serverVersion();
    activeClient = { type: 'electrum', client };
  }
}

export function disconnectNode(): void {
  if (activeClient?.type === 'electrum') {
    activeClient.client.disconnect();
  }
  activeClient = null;
}

export function isNodeConnected(): boolean {
  if (!activeClient) return false;
  if (activeClient.type === 'electrum') return activeClient.client.isConnected();
  return true; // REST is stateless, always "connected" if it was initialized
}

async function ensureClient(): Promise<ActiveClient> {
  if (activeClient && isNodeConnected()) return activeClient;
  await connectToNode();
  if (!activeClient) throw new Error('Failed to connect');
  return activeClient;
}

// ── Scan addresses with gap limit ──

async function scanAddressesElectrum(
  client: ElectrumClient,
  xpub: string,
  change: boolean,
): Promise<{ addresses: string[]; lastUsedIndex: number }> {
  const allAddresses: string[] = [];
  let lastUsedIndex = -1;
  let currentIndex = 0;

  while (true) {
    const batch = deriveAddresses(xpub, currentIndex + GAP_LIMIT, change).slice(currentIndex);
    let foundActivity = false;

    for (let i = 0; i < batch.length; i++) {
      const addr = batch[i]!;
      allAddresses.push(addr);
      const scripthash = await toElectrumScripthash(addr);
      const history = await client.getHistory(scripthash);
      if (history.length > 0) {
        lastUsedIndex = currentIndex + i;
        foundActivity = true;
      }
    }

    if (!foundActivity) break;
    currentIndex += GAP_LIMIT;
  }

  return { addresses: allAddresses, lastUsedIndex };
}

async function scanAddressesEsplora(
  client: EsploraClient,
  xpub: string,
  change: boolean,
): Promise<{ addresses: string[]; lastUsedIndex: number }> {
  const allAddresses: string[] = [];
  let lastUsedIndex = -1;
  let currentIndex = 0;

  while (true) {
    const batch = deriveAddresses(xpub, currentIndex + GAP_LIMIT, change).slice(currentIndex);
    let foundActivity = false;

    for (let i = 0; i < batch.length; i++) {
      const addr = batch[i]!;
      allAddresses.push(addr);
      const txs = await client.getAddressTxs(addr);
      if (txs.length > 0) {
        lastUsedIndex = currentIndex + i;
        foundActivity = true;
      }
    }

    if (!foundActivity) break;
    currentIndex += GAP_LIMIT;
  }

  return { addresses: allAddresses, lastUsedIndex };
}

// ── Public API (used by message handler) ──

export async function getBalance(xpub: string): Promise<BalanceData> {
  const ac = await ensureClient();
  let confirmed = 0;
  let unconfirmed = 0;

  for (const change of [false, true]) {
    if (ac.type === 'electrum') {
      const { addresses } = await scanAddressesElectrum(ac.client, xpub, change);
      for (const addr of addresses) {
        const sh = await toElectrumScripthash(addr);
        const bal = await ac.client.getBalance(sh);
        confirmed += bal.confirmed;
        unconfirmed += bal.unconfirmed;
      }
    } else {
      const { addresses } = await scanAddressesEsplora(ac.client, xpub, change);
      for (const addr of addresses) {
        const bal = await ac.client.getBalance(addr);
        confirmed += bal.confirmed;
        unconfirmed += bal.unconfirmed;
      }
    }
  }

  return { confirmed, unconfirmed, total: confirmed + unconfirmed };
}

export async function getUTXOs(xpub: string): Promise<UTXOData[]> {
  const ac = await ensureClient();
  const utxos: UTXOData[] = [];

  for (const change of [false, true]) {
    if (ac.type === 'electrum') {
      const { addresses } = await scanAddressesElectrum(ac.client, xpub, change);
      for (const addr of addresses) {
        const sh = await toElectrumScripthash(addr);
        const unspent = await ac.client.listUnspent(sh);
        for (const u of unspent) {
          utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, address: addr, height: u.height });
        }
      }
    } else {
      const { addresses } = await scanAddressesEsplora(ac.client, xpub, change);
      for (const addr of addresses) {
        const unspent = await ac.client.getAddressUTXOs(addr);
        for (const u of unspent) {
          utxos.push({ txid: u.txid, vout: u.vout, value: u.value, address: addr, height: u.status.block_height ?? 0 });
        }
      }
    }
  }

  return utxos;
}

export async function getTransactionHistory(xpub: string): Promise<TransactionRecord[]> {
  const ac = await ensureClient();
  const txMap = new Map<string, TransactionRecord>();

  for (const change of [false, true]) {
    if (ac.type === 'electrum') {
      const { addresses } = await scanAddressesElectrum(ac.client, xpub, change);
      for (const addr of addresses) {
        const sh = await toElectrumScripthash(addr);
        const history = await ac.client.getHistory(sh);
        for (const h of history) {
          if (!txMap.has(h.tx_hash)) {
            txMap.set(h.tx_hash, {
              txid: h.tx_hash, height: h.height, timestamp: h.height > 0 ? h.height * 600 : Date.now() / 1000,
              amount: 0, fee: h.fee ?? 0, confirmed: h.height > 0,
            });
          }
        }
      }
    } else {
      const { addresses } = await scanAddressesEsplora(ac.client, xpub, change);
      for (const addr of addresses) {
        const txs = await ac.client.getAddressTxs(addr);
        for (const tx of txs) {
          if (!txMap.has(tx.txid)) {
            txMap.set(tx.txid, {
              txid: tx.txid, height: tx.status.block_height ?? 0,
              timestamp: tx.status.block_time ?? Date.now() / 1000,
              amount: 0, fee: tx.fee, confirmed: tx.status.confirmed,
            });
          }
        }
      }
    }
  }

  return Array.from(txMap.values()).sort((a, b) => b.height - a.height);
}

export async function getReceiveAddress(xpub: string): Promise<string> {
  const ac = await ensureClient();

  let lastUsedIndex: number;
  if (ac.type === 'electrum') {
    const result = await scanAddressesElectrum(ac.client, xpub, false);
    lastUsedIndex = result.lastUsedIndex;
  } else {
    const result = await scanAddressesEsplora(ac.client, xpub, false);
    lastUsedIndex = result.lastUsedIndex;
  }

  const nextIndex = lastUsedIndex + 1;
  const addresses = deriveAddresses(xpub, nextIndex + 1, false);
  return addresses[nextIndex]!;
}

export async function getFeeRates(): Promise<FeeRates> {
  const ac = await ensureClient();

  if (ac.type === 'electrum') {
    const [fast, normal, slow] = await Promise.all([
      ac.client.estimateFee(1),
      ac.client.estimateFee(6),
      ac.client.estimateFee(24),
    ]);
    return { fast, normal, slow };
  } else {
    const estimates = await ac.client.getFeeEstimates();
    return {
      fast: Math.ceil(estimates['1'] ?? estimates['2'] ?? 20),
      normal: Math.ceil(estimates['6'] ?? estimates['3'] ?? 5),
      slow: Math.ceil(estimates['24'] ?? estimates['144'] ?? 1),
    };
  }
}

export async function getNodeInfo(): Promise<NodeInfo> {
  const { url } = await getNodeConfig();
  try {
    const ac = await ensureClient();
    if (ac.type === 'electrum') {
      const header = await ac.client.subscribeToHeaders(() => {});
      return { server: url, height: header.height, connected: true };
    } else {
      const height = await ac.client.getBlockHeight();
      return { server: url, height, connected: true };
    }
  } catch {
    return { server: url, height: 0, connected: false };
  }
}

export async function broadcastTransaction(hex: string): Promise<string> {
  const ac = await ensureClient();
  if (ac.type === 'electrum') {
    return ac.client.broadcastTransaction(hex);
  } else {
    return ac.client.broadcastTransaction(hex);
  }
}

export async function getRawTransaction(txid: string): Promise<string> {
  const ac = await ensureClient();
  if (ac.type === 'electrum') {
    return ac.client.getTransaction(txid);
  } else {
    return ac.client.getTransaction(txid);
  }
}

export async function testConnection(url: string): Promise<{ connected: boolean; version?: string; error?: string }> {
  const isRest = url.startsWith('https://') && !url.includes(':50002');

  try {
    if (isRest) {
      const client = new EsploraClient(url);
      const height = await client.getBlockHeight();
      // Save as active client on success
      activeClient = { type: 'esplora', client };
      return { connected: true, version: `Esplora (block ${height})` };
    } else {
      const client = new ElectrumClient(url);
      await client.connect();
      const version = await client.serverVersion();
      // Save as active client on success
      activeClient = { type: 'electrum', client };
      return { connected: true, version: version[0] };
    }
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
