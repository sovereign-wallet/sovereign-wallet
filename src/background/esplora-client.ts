// REST client for public Esplora/mempool APIs (Blockstream, mempool.space)
// Used when the user doesn't have their own WebSocket-capable node (Fulcrum)

interface EsploraUTXO {
  txid: string;
  vout: number;
  status: { confirmed: boolean; block_height: number };
  value: number;
}

interface EsploraTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  fee: number;
  vin: Array<{ prevout: { scriptpubkey_address: string; value: number } }>;
  vout: Array<{ scriptpubkey_address: string; value: number }>;
}

export class EsploraClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async get(path: string): Promise<Response> {
    const resp = await fetch(`${this.baseUrl}${path}`);
    if (!resp.ok) throw new Error(`Esplora API error: ${resp.status} ${resp.statusText}`);
    return resp;
  }

  async getBlockHeight(): Promise<number> {
    const resp = await this.get('/blocks/tip/height');
    return parseInt(await resp.text(), 10);
  }

  async getBalance(address: string): Promise<{ confirmed: number; unconfirmed: number }> {
    const resp = await this.get(`/address/${address}`);
    const data = await resp.json() as {
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
      mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
    };
    return {
      confirmed: data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum,
      unconfirmed: data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum,
    };
  }

  async getAddressTxs(address: string): Promise<EsploraTx[]> {
    const resp = await this.get(`/address/${address}/txs`);
    return resp.json() as Promise<EsploraTx[]>;
  }

  async getAddressUTXOs(address: string): Promise<EsploraUTXO[]> {
    const resp = await this.get(`/address/${address}/utxo`);
    return resp.json() as Promise<EsploraUTXO[]>;
  }

  async broadcastTransaction(hex: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/tx`, {
      method: 'POST',
      body: hex,
      headers: { 'Content-Type': 'text/plain' },
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Broadcast failed: ${err}`);
    }
    return resp.text();
  }

  async getFeeEstimates(): Promise<{ [blocks: string]: number }> {
    const resp = await this.get('/fee-estimates');
    return resp.json() as Promise<{ [blocks: string]: number }>;
  }

  async getTransaction(txid: string): Promise<string> {
    const resp = await this.get(`/tx/${txid}/hex`);
    return resp.text();
  }

  async serverVersion(): Promise<string> {
    const height = await this.getBlockHeight();
    return `Esplora (block ${height})`;
  }
}

// ── Adapter: make EsploraClient look like ElectrumClient for wallet.ts ──
// This wraps the REST API to match the interface the wallet module expects

export class EsploraElectrumAdapter {
  private client: EsploraClient;
  private connected = false;

  constructor(baseUrl: string) {
    this.client = new EsploraClient(baseUrl);
  }

  async connect(): Promise<void> {
    // Test connection by fetching block height
    await this.client.getBlockHeight();
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  setUrl(url: string): void {
    this.client = new EsploraClient(url);
    this.connected = false;
  }

  // Electrum-compatible methods using address-based lookups
  async getBalance(scripthash: string): Promise<{ confirmed: number; unconfirmed: number }> {
    // scripthash can't be used with Esplora — we store address mappings
    // This will be called through the address-aware wrapper
    void scripthash;
    throw new Error('Use getBalanceForAddress instead');
  }

  async getBalanceForAddress(address: string): Promise<{ confirmed: number; unconfirmed: number }> {
    return this.client.getBalance(address);
  }

  async getHistory(_scripthash: string): Promise<Array<{ tx_hash: string; height: number; fee?: number }>> {
    void _scripthash;
    throw new Error('Use getHistoryForAddress instead');
  }

  async getHistoryForAddress(address: string): Promise<Array<{ tx_hash: string; height: number; fee?: number }>> {
    const txs = await this.client.getAddressTxs(address);
    return txs.map(tx => ({
      tx_hash: tx.txid,
      height: tx.status.block_height ?? 0,
      fee: tx.fee,
    }));
  }

  async listUnspent(_scripthash: string): Promise<Array<{ tx_hash: string; tx_pos: number; value: number; height: number }>> {
    void _scripthash;
    throw new Error('Use listUnspentForAddress instead');
  }

  async listUnspentForAddress(address: string): Promise<Array<{ tx_hash: string; tx_pos: number; value: number; height: number }>> {
    const utxos = await this.client.getAddressUTXOs(address);
    return utxos.map(u => ({
      tx_hash: u.txid,
      tx_pos: u.vout,
      value: u.value,
      height: u.status.block_height ?? 0,
    }));
  }

  async broadcastTransaction(hex: string): Promise<string> {
    return this.client.broadcastTransaction(hex);
  }

  async estimateFee(nBlocks: number): Promise<number> {
    const estimates = await this.client.getFeeEstimates();
    // Find closest block target
    const key = String(nBlocks);
    const rate = estimates[key] ?? estimates['6'] ?? 5;
    return Math.ceil(rate);
  }

  async getTransaction(txid: string): Promise<string> {
    return this.client.getTransaction(txid);
  }

  async serverVersion(): Promise<[string, string]> {
    const version = await this.client.serverVersion();
    return [version, '1.4'];
  }

  async subscribeToHeaders(callback: (header: { height: number; hex: string }) => void): Promise<{ height: number; hex: string }> {
    const height = await this.client.getBlockHeight();
    // No real subscription with REST — just return current height
    void callback;
    return { height, hex: '' };
  }
}
