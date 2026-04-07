// ── Types ──

interface ElectrumRequest {
  id: number;
  method: string;
  params: unknown[];
}

interface ElectrumResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ElectrumNotification {
  method: string;
  params: unknown[];
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type HeaderCallback = (header: { height: number; hex: string }) => void;

// ── Constants ──

const REQUEST_TIMEOUT = 30_000;
const MAX_BACKOFF = 60_000;
const INITIAL_BACKOFF = 1_000;

// ── Client ──

export class ElectrumClient {
  private ws: WebSocket | null = null;
  private url: string;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private queue: ElectrumRequest[] = [];
  private connected = false;
  private reconnecting = false;
  private backoff = INITIAL_BACKOFF;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private headerCallbacks: HeaderCallback[] = [];
  private shouldReconnect = true;

  constructor(url: string) {
    this.url = url;
  }

  // ── Connection ──

  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(new Error(`Could not connect to ${this.url}`));
        return;
      }

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, REQUEST_TIMEOUT);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnecting = false;
        this.backoff = INITIAL_BACKOFF;
        this.flushQueue();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this.shouldReconnect && !this.reconnecting) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        if (!this.connected) {
          reject(new Error(`Error connecting to ${this.url}`));
        }
      };
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;

    // Reject all pending
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error('Disconnected'));
      this.pending.delete(id);
    }
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  setUrl(url: string): void {
    this.url = url;
  }

  // ── Reconnection ──

  private scheduleReconnect(): void {
    this.reconnecting = true;
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
        this.reconnecting = false;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      }
    }, this.backoff);
  }

  // ── Message handling ──

  private handleMessage(data: string): void {
    let parsed: ElectrumResponse | ElectrumNotification;
    try {
      parsed = JSON.parse(data) as ElectrumResponse | ElectrumNotification;
    } catch {
      return;
    }

    // Notification (subscription)
    if ('method' in parsed && !('id' in parsed)) {
      const notif = parsed as ElectrumNotification;
      if (notif.method === 'blockchain.headers.subscribe') {
        const headerData = notif.params[0] as { height: number; hex: string } | undefined;
        if (headerData) {
          for (const cb of this.headerCallbacks) {
            cb(headerData);
          }
        }
      }
      return;
    }

    // Response
    const resp = parsed as ElectrumResponse;
    const pending = this.pending.get(resp.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(resp.id);

    if (resp.error) {
      pending.reject(new Error(resp.error.message));
    } else {
      pending.resolve(resp.result);
    }
  }

  // ── Request ──

  private request(method: string, params: unknown[] = []): Promise<unknown> {
    const id = ++this.requestId;
    const msg: ElectrumRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, REQUEST_TIMEOUT);

      this.pending.set(id, { resolve, reject, timer });

      if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.queue.push(msg);
      }
    });
  }

  private flushQueue(): void {
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    }
  }

  // ── Public API ──

  async getBalance(scripthash: string): Promise<{ confirmed: number; unconfirmed: number }> {
    const result = await this.request('blockchain.scripthash.get_balance', [scripthash]);
    return result as { confirmed: number; unconfirmed: number };
  }

  async getHistory(scripthash: string): Promise<Array<{ tx_hash: string; height: number; fee?: number }>> {
    const result = await this.request('blockchain.scripthash.get_history', [scripthash]);
    return result as Array<{ tx_hash: string; height: number; fee?: number }>;
  }

  async listUnspent(scripthash: string): Promise<Array<{ tx_hash: string; tx_pos: number; value: number; height: number }>> {
    const result = await this.request('blockchain.scripthash.listunspent', [scripthash]);
    return result as Array<{ tx_hash: string; tx_pos: number; value: number; height: number }>;
  }

  async broadcastTransaction(rawHex: string): Promise<string> {
    const result = await this.request('blockchain.transaction.broadcast', [rawHex]);
    return result as string;
  }

  async estimateFee(nBlocks: number): Promise<number> {
    const result = await this.request('blockchain.estimatefee', [nBlocks]);
    const btcPerKb = result as number;
    if (btcPerKb <= 0) return 1; // minimum 1 sat/vB
    // Convert BTC/kB to sat/vB
    return Math.ceil((btcPerKb * 1e8) / 1000);
  }

  async subscribeToHeaders(callback: HeaderCallback): Promise<{ height: number; hex: string }> {
    this.headerCallbacks.push(callback);
    const result = await this.request('blockchain.headers.subscribe', []);
    return result as { height: number; hex: string };
  }

  async getTransaction(txid: string): Promise<string> {
    const result = await this.request('blockchain.transaction.get', [txid]);
    return result as string;
  }

  async serverVersion(): Promise<[string, string]> {
    const result = await this.request('server.version', ['Sovereign Wallet', '1.4']);
    return result as [string, string];
  }
}

// ── Scripthash helper ──

export async function toElectrumScripthash(address: string, networkName: 'mainnet' | 'testnet' = 'mainnet'): Promise<string> {
  const bitcoin = await import('bitcoinjs-lib');
  const net = networkName === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

  const outputScript = bitcoin.address.toOutputScript(address, net);
  const hashBuffer = await crypto.subtle.digest('SHA-256', outputScript as BufferSource);
  const hashArray = new Uint8Array(hashBuffer);

  // Reverse to little-endian
  const reversed = new Uint8Array(hashArray.length);
  for (let i = 0; i < hashArray.length; i++) {
    reversed[i] = hashArray[hashArray.length - 1 - i]!;
  }

  return Array.from(reversed).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Singleton ──

let clientInstance: ElectrumClient | null = null;

export function getClient(): ElectrumClient {
  if (!clientInstance) {
    clientInstance = new ElectrumClient('');
  }
  return clientInstance;
}

export function resetClient(url: string): ElectrumClient {
  if (clientInstance) {
    clientInstance.disconnect();
  }
  clientInstance = new ElectrumClient(url);
  return clientInstance;
}

export async function switchNode(nodeUrl: string): Promise<void> {
  const client = resetClient(nodeUrl);
  await client.connect();
  await client.serverVersion();
}
