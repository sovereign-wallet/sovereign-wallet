// ── Types ──

export type UTXOOrigin = 'exchange' | 'p2p' | 'mined' | 'mixed' | 'unknown';

export interface UTXOLabel {
  txid: string;
  vout: number;
  label: string;
  origin: UTXOOrigin;
  note?: string;
  timestamp: number;
}

// ── Constants ──

const LABELS_KEY = 'sovereign_utxo_labels';

// ── Helpers ──

function makeKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

async function loadLabelsMap(): Promise<Map<string, UTXOLabel>> {
  const result = await chrome.storage.local.get(LABELS_KEY);
  const raw = result[LABELS_KEY] as string | undefined;
  if (!raw) return new Map();

  const arr = JSON.parse(raw) as UTXOLabel[];
  const map = new Map<string, UTXOLabel>();
  for (const label of arr) {
    map.set(makeKey(label.txid, label.vout), label);
  }
  return map;
}

async function saveLabelsMap(map: Map<string, UTXOLabel>): Promise<void> {
  const arr = Array.from(map.values());
  await chrome.storage.local.set({ [LABELS_KEY]: JSON.stringify(arr) });
}

// ── Public API ──

export async function saveLabel(label: UTXOLabel): Promise<void> {
  const map = await loadLabelsMap();
  map.set(makeKey(label.txid, label.vout), label);
  await saveLabelsMap(map);
}

export async function getLabel(txid: string, vout: number): Promise<UTXOLabel | null> {
  const map = await loadLabelsMap();
  return map.get(makeKey(txid, vout)) ?? null;
}

export async function getAllLabels(): Promise<UTXOLabel[]> {
  const map = await loadLabelsMap();
  return Array.from(map.values());
}

export async function deleteLabel(txid: string, vout: number): Promise<void> {
  const map = await loadLabelsMap();
  map.delete(makeKey(txid, vout));
  await saveLabelsMap(map);
}

export async function getLabelsByOrigin(origin: UTXOOrigin): Promise<UTXOLabel[]> {
  const all = await getAllLabels();
  return all.filter(l => l.origin === origin);
}
