// ── Types ──

export interface NodeStatus {
  blocks: number;
  headers: number;
  connections: number;
  version: string;
  syncProgress: number; // 0-1
  isReady: boolean;
}

export interface InviteConfig {
  friendName: string;
  assignedIP: string;
  serverEndpoint: string;
  serverPublicKey: string;
  presharedKey: string;
  configText: string;
}

// ── Constants ──

// These are read from storage or fall back to defaults.
// Users configure them via .env (VITE_WIREGUARD_PUBLIC_KEY) or Settings.
const WG_DEFAULT_ENDPOINT = '';
const WG_DEFAULT_PUBKEY = 'CHANGE_ME_SET_IN_ENV';

async function getWGConfig(): Promise<{ endpoint: string; pubkey: string }> {
  const result = await chrome.storage.local.get(['wg_endpoint', 'wg_pubkey']);
  return {
    endpoint: (result['wg_endpoint'] as string) ?? WG_DEFAULT_ENDPOINT,
    pubkey: (result['wg_pubkey'] as string) ?? WG_DEFAULT_PUBKEY,
  };
}
const WG_SUBNET = '10.0.0';
const PEERS_KEY = 'sovereign_wg_peers';

interface StoredPeer {
  name: string;
  ip: string;
  publicKey: string;
  presharedKey: string;
  createdAt: number;
  lastSeen: number;
}

// ── Node status via Bitcoin Core RPC (via Electrum proxy) ──

export async function getNodeStatus(electrumClient: {
  isConnected: () => boolean;
  subscribeToHeaders: (cb: (h: { height: number }) => void) => Promise<{ height: number; hex: string }>;
  serverVersion: () => Promise<[string, string]>;
}): Promise<NodeStatus> {
  if (!electrumClient.isConnected()) {
    return {
      blocks: 0,
      headers: 0,
      connections: 0,
      version: 'Disconnected',
      syncProgress: 0,
      isReady: false,
    };
  }

  try {
    const header = await electrumClient.subscribeToHeaders(() => {});
    const version = await electrumClient.serverVersion();

    return {
      blocks: header.height,
      headers: header.height, // Electrum doesn't expose header count separately
      connections: 1, // We are a connection
      version: version[0] ?? 'unknown',
      syncProgress: 1, // If responding, it's synced
      isReady: true,
    };
  } catch {
    return {
      blocks: 0,
      headers: 0,
      connections: 0,
      version: 'Error',
      syncProgress: 0,
      isReady: false,
    };
  }
}

// ── WireGuard peer management ──

async function loadPeers(): Promise<StoredPeer[]> {
  const result = await chrome.storage.local.get(PEERS_KEY);
  const raw = result[PEERS_KEY] as string | undefined;
  if (!raw) return [];
  return JSON.parse(raw) as StoredPeer[];
}

async function savePeers(peers: StoredPeer[]): Promise<void> {
  await chrome.storage.local.set({ [PEERS_KEY]: JSON.stringify(peers) });
}

export async function getConnectedPeers(): Promise<StoredPeer[]> {
  return loadPeers();
}

function generateBase64Key(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function generateInviteConfig(friendName: string): Promise<InviteConfig> {
  const wg = await getWGConfig();
  const peers = await loadPeers();

  // Assign next IP in range (server is .1, first peer is .2)
  const usedIPs = new Set(peers.map(p => p.ip));
  let assignedNum = 2;
  while (usedIPs.has(`${WG_SUBNET}.${assignedNum}`)) {
    assignedNum++;
    if (assignedNum > 254) throw new Error('No available IPs');
  }

  const assignedIP = `${WG_SUBNET}.${assignedNum}`;
  const peerPrivateKey = generateBase64Key();
  const presharedKey = generateBase64Key();

  // In a real implementation, we'd derive the public key from the private key
  // using the WireGuard algorithm. For MVP, we generate a placeholder.
  const peerPublicKey = generateBase64Key(); // placeholder

  // Build WireGuard config for the peer
  const configText = [
    '[Interface]',
    `PrivateKey = ${peerPrivateKey}`,
    `Address = ${assignedIP}/24`,
    `DNS = ${WG_SUBNET}.1`,
    '',
    '[Peer]',
    `PublicKey = ${wg.pubkey}`,
    `PresharedKey = ${presharedKey}`,
    `Endpoint = ${wg.endpoint}`,
    `AllowedIPs = ${WG_SUBNET}.0/24`,
    'PersistentKeepalive = 25',
  ].join('\n');

  // Save peer
  const newPeer: StoredPeer = {
    name: friendName,
    ip: assignedIP,
    publicKey: peerPublicKey,
    presharedKey,
    createdAt: Date.now(),
    lastSeen: 0,
  };

  peers.push(newPeer);
  await savePeers(peers);

  return {
    friendName,
    assignedIP,
    serverEndpoint: wg.endpoint,
    serverPublicKey: wg.pubkey,
    presharedKey,
    configText,
  };
}

export async function removePeer(ip: string): Promise<void> {
  const peers = await loadPeers();
  const filtered = peers.filter(p => p.ip !== ip);
  await savePeers(filtered);
}
