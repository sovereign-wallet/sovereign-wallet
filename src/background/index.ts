import '../buffer-shim';
import {
  generateSeed,
  encryptVault,
  saveVault,
  hasVault,
  unlockWallet,
  lockWallet,
  isLocked,
  getXprv,
  getSeed,
  getStoredXpub,
  getNodeUrl,
  setNodeUrl,
  decryptVault,
  loadVault,
  getLoginStatus,
} from './keyring';
import { getClient, resetClient, toElectrumScripthash } from './electrum';
import { getBalance, getUTXOs, getTransactionHistory, getReceiveAddress } from './wallet';
import { buildTransaction, buildStonewall, buildRicochet, estimateFee } from './transactions';
import { analyzeTransaction } from './privacy';
import { saveLabel, getAllLabels, deleteLabel } from './utxo-labels';
import { selectUTXOs as autoSelectUTXOs, validateSelection } from './coin-control';
import { derivePaymentCode, buildNotificationTransaction } from './paynym';
import { getNodeStatus, getConnectedPeers, generateInviteConfig, removePeer } from './node-admin';
import { analyzeWithAI, getApiKey, setApiKey } from './ai-advisor';
import type {
  BackgroundRequest,
  BackgroundResponse,
  BalanceData,
  TransactionRecord,
  UTXOData,
  FeeRates,
  NodeInfo,
  PrivacyAnalysis,
} from '../types/messages';

// ── Auto-lock alarm ──

chrome.alarms.create('auto-lock-check', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'auto-lock-check') {
    // The keyring module handles its own timer,
    // but this alarm ensures the service worker stays alive
  }
});

// ── Connection management ──

async function ensureConnected(): Promise<void> {
  const client = getClient();
  if (!client.isConnected()) {
    const url = await getNodeUrl();
    client.setUrl(url);
    await client.connect();
    await client.serverVersion();
  }
}

// ── Message handler ──

chrome.runtime.onMessage.addListener(
  (
    request: BackgroundRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void
  ): boolean => {
    handleMessage(request)
      .then(sendResponse)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ success: false, error: message });
      });
    return true; // Keep channel open for async response
  }
);

async function handleMessage(request: BackgroundRequest): Promise<BackgroundResponse> {
  switch (request.type) {
    case 'GENERATE_SEED': {
      const seed = generateSeed();
      return { success: true, data: seed };
    }

    case 'SETUP_WALLET': {
      const vault = await encryptVault(request.seed, request.password);
      await saveVault(vault);
      const result = await unlockWallet(request.password);
      return { success: true, data: result };
    }

    case 'UNLOCK_WALLET': {
      const result = await unlockWallet(request.password);
      // Connect to node in background — don't block unlock
      ensureConnected().catch(() => {});
      return { success: true, data: result };
    }

    case 'LOCK_WALLET': {
      lockWallet();
      return { success: true, data: null };
    }

    case 'IS_LOCKED': {
      return { success: true, data: isLocked() };
    }

    case 'HAS_VAULT': {
      const exists = await hasVault();
      return { success: true, data: exists };
    }

    case 'GET_BALANCE': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const balance: BalanceData = await getBalance(xpub);
      return { success: true, data: balance };
    }

    case 'GET_RECEIVE_ADDRESS': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const address = await getReceiveAddress(xpub);
      return { success: true, data: address };
    }

    case 'GET_TRANSACTION_HISTORY': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const history: TransactionRecord[] = await getTransactionHistory(xpub);
      return { success: true, data: history };
    }

    case 'GET_UTXOS': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const utxos: UTXOData[] = await getUTXOs(xpub);
      return { success: true, data: utxos };
    }

    case 'SEND_TRANSACTION': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();

      const xprv = getXprv();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };

      const utxos = await getUTXOs(xpub);
      const changeAddr = await getReceiveAddress(xpub); // Use next unused for change

      const buildParams = {
        xprv,
        xpub,
        utxos,
        destination: request.destination,
        amountSats: request.amountSats,
        feeRate: request.feeRate,
        changeAddress: changeAddr,
        selectedUtxos: request.selectedUtxos,
      };

      const client = getClient();

      if (request.mode === 'ricochet') {
        const chain = await buildRicochet(buildParams);
        // Broadcast all transactions in sequence
        const txids: string[] = [];
        for (const tx of chain.transactions) {
          const broadcastedTxid = await client.broadcastTransaction(tx.hex);
          txids.push(broadcastedTxid);
        }
        return {
          success: true,
          data: {
            txid: txids[txids.length - 1]!, // final tx to destination
            fee: chain.totalFee,
            vsize: chain.transactions.reduce((sum, t) => sum + t.vsize, 0),
            hops: chain.hops,
            txids,
          },
        };
      }

      const built = request.mode === 'stonewall'
        ? await buildStonewall(buildParams)
        : await buildTransaction(buildParams);

      const txid = await client.broadcastTransaction(built.hex);
      return { success: true, data: { txid, fee: built.fee, vsize: built.vsize } };
    }

    case 'ESTIMATE_FEE': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };

      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };

      const utxos = await getUTXOs(xpub);
      const totalAvailable = utxos.reduce((sum, u) => sum + u.value, 0);

      // Rough estimate based on typical tx shape
      let inputCount = 1;
      let outputCount = 2;

      if (request.mode === 'stonewall') outputCount = 4;
      if (request.mode === 'ricochet') outputCount = 2; // + 2 hop fees

      // Estimate how many inputs needed
      const sorted = [...utxos].sort((a, b) => b.value - a.value);
      let accum = 0;
      for (const u of sorted) {
        accum += u.value;
        inputCount++;
        if (accum >= request.amountSats) break;
      }

      let fee = estimateFee(inputCount, outputCount, request.feeRate);
      if (request.mode === 'ricochet') {
        fee += estimateFee(1, 1, request.feeRate) * 2;
      }

      return {
        success: true,
        data: { fee, estimatedVsize: Math.ceil(fee / request.feeRate), totalAvailable },
      };
    }

    case 'GET_FEE_RATES': {
      await ensureConnected();
      const client = getClient();
      const [fast, normal, slow] = await Promise.all([
        client.estimateFee(1),
        client.estimateFee(6),
        client.estimateFee(24),
      ]);
      const rates: FeeRates = { fast, normal, slow };
      return { success: true, data: rates };
    }

    case 'GET_NODE_INFO': {
      try {
        await ensureConnected();
        const client = getClient();
        const header = await client.subscribeToHeaders(() => {});
        const url = await getNodeUrl();
        const info: NodeInfo = {
          server: url,
          height: header.height,
          connected: client.isConnected(),
        };
        return { success: true, data: info };
      } catch {
        const url = await getNodeUrl();
        return {
          success: true,
          data: { server: url, height: 0, connected: false } as NodeInfo,
        };
      }
    }

    case 'SET_NODE_URL': {
      await setNodeUrl(request.url);
      const client = getClient();
      client.disconnect();
      resetClient(request.url);
      return { success: true, data: null };
    }

    case 'TEST_CONNECTION': {
      const url = request.url ?? await getNodeUrl();
      const testClient = resetClient(url);
      try {
        await testClient.connect();
        const version = await testClient.serverVersion();
        return { success: true, data: { connected: true, version: version[0] } };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { success: true, data: { connected: false, error: msg } };
      }
    }

    case 'GET_CONNECTION_STATUS': {
      const client = getClient();
      return { success: true, data: client.isConnected() };
    }

    case 'EXPORT_SEED': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      // Verify password before exporting
      const vault = await loadVault();
      if (!vault) return { success: false, error: 'No vault found' };
      await decryptVault(vault, request.password); // Throws if wrong
      const seed = getSeed();
      return { success: true, data: seed };
    }

    case 'ANALYZE_PRIVACY': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };

      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };

      const utxos = await getUTXOs(xpub);
      const changeAddr = await getReceiveAddress(xpub);

      // Build a mock transaction to analyze
      const selected = request.selectedUtxos
        ? utxos.filter(u => request.selectedUtxos!.includes(`${u.txid}:${u.vout}`))
        : utxos.slice(0, 3); // rough estimate

      const totalInput = selected.reduce((sum, u) => sum + u.value, 0);
      const fee = estimateFee(selected.length, 2, request.feeRate);
      const change = totalInput - request.amountSats - fee;

      const outputs = [
        { address: request.destination, value: request.amountSats },
      ];
      if (change > 546) {
        outputs.push({ address: changeAddr, value: change });
      }

      const analysis: PrivacyAnalysis = analyzeTransaction({
        inputs: selected,
        outputs,
        mode: request.mode,
        destination: request.destination,
        amountSats: request.amountSats,
        fee,
      });

      return { success: true, data: analysis };
    }

    // ── UTXO Labels ──

    case 'SAVE_LABEL': {
      await saveLabel({
        ...request.label,
        timestamp: Date.now(),
      });
      return { success: true, data: null };
    }

    case 'GET_LABELS': {
      const labels = await getAllLabels();
      return { success: true, data: labels };
    }

    case 'DELETE_LABEL': {
      await deleteLabel(request.txid, request.vout);
      return { success: true, data: null };
    }

    // ── Coin Control ──

    case 'AUTO_SELECT_UTXOS': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const utxos = await getUTXOs(xpub);
      const selection = autoSelectUTXOs(utxos, request.target, request.feeRate);
      return { success: true, data: selection };
    }

    case 'VALIDATE_SELECTION': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const utxos = await getUTXOs(xpub);
      const idSet = new Set(request.selectedUtxos);
      const selectedUtxos = utxos.filter(u => idSet.has(`${u.txid}:${u.vout}`));
      const result = validateSelection(selectedUtxos, request.target, request.feeRate);
      return { success: true, data: result };
    }

    // ── PayNym ──

    case 'GET_PAYMENT_CODE': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const pc = derivePaymentCode(xpub);
      return { success: true, data: pc.code };
    }

    case 'SEND_NOTIFICATION_TX': {
      if (isLocked()) return { success: false, error: 'Wallet is locked' };
      await ensureConnected();
      const xprv = getXprv();
      const xpub = await getStoredXpub();
      if (!xpub) return { success: false, error: 'No xpub found' };
      const utxos = await getUTXOs(xpub);
      const result = await buildNotificationTransaction({
        xprv,
        xpub,
        theirPaymentCode: request.theirPaymentCode,
        utxos,
        feeRate: request.feeRate,
      });
      const client = getClient();
      await client.broadcastTransaction(result.hex);
      return { success: true, data: { txid: result.txid, fee: result.fee } };
    }

    // ── Family Node ──

    case 'GET_WG_PEERS': {
      const peers = await getConnectedPeers();
      return { success: true, data: peers };
    }

    case 'GENERATE_WG_INVITE': {
      const invite = await generateInviteConfig(request.friendName);
      return { success: true, data: invite };
    }

    case 'REMOVE_WG_PEER': {
      await removePeer(request.ip);
      return { success: true, data: null };
    }

    // ── AI Advisor ──

    case 'AI_ANALYZE': {
      const aiResult = await analyzeWithAI({
        ...request.context,
        destinationType: request.context.destinationType as 'p2wpkh' | 'p2tr' | 'p2sh' | 'p2pkh' | 'silent' | 'paynym' | 'unknown',
      });
      return { success: true, data: aiResult };
    }

    case 'SET_API_KEY': {
      await setApiKey(request.key);
      return { success: true, data: null };
    }

    case 'GET_API_KEY': {
      const key = await getApiKey();
      return { success: true, data: key ? '****' + key.slice(-4) : null };
    }

    case 'GET_LOGIN_STATUS': {
      const status = await getLoginStatus();
      return { success: true, data: status };
    }

    default: {
      return { success: false, error: 'Unknown message type' };
    }
  }
}

// ── Transaction notifications ──

let notificationsSetup = false;

async function setupTransactionNotifications(): Promise<void> {
  if (notificationsSetup) return;
  notificationsSetup = true;

  try {
    await ensureConnected();
    const xpub = await getStoredXpub();
    if (!xpub) return;

    const client = getClient();

    // Subscribe to headers for confirmation tracking
    const knownTxids = new Set<string>();

    // Check for new transactions periodically
    chrome.alarms.create('check-txs', { periodInMinutes: 1 });
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name !== 'check-txs') return;
      if (isLocked()) return;

      try {
        const currentXpub = await getStoredXpub();
        if (!currentXpub) return;

        await ensureConnected();
        const history = await getTransactionHistory(currentXpub);

        for (const tx of history) {
          if (knownTxids.has(tx.txid)) continue;
          knownTxids.add(tx.txid);

          // Only notify for recent unconfirmed or just-confirmed transactions
          if (!tx.confirmed && tx.amount > 0) {
            chrome.notifications.create(tx.txid, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Bitcoin received',
              message: `+${tx.amount.toLocaleString()} sats`,
            });
          }
        }
      } catch {
        // Silent fail for notification polling
      }
    });

    // Subscribe to new block headers for confirmation notifications
    client.subscribeToHeaders(async (header) => {
      try {
        const currentXpub = await getStoredXpub();
        if (!currentXpub || isLocked()) return;

        const history = await getTransactionHistory(currentXpub);
        const justConfirmed = history.filter(
          tx => tx.confirmed && tx.height === header.height && !knownTxids.has(`confirmed:${tx.txid}`)
        );

        for (const tx of justConfirmed) {
          knownTxids.add(`confirmed:${tx.txid}`);
          chrome.notifications.create(`confirmed:${tx.txid}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Transaction confirmed',
            message: `${tx.txid.slice(0, 16)}... en bloque ${header.height}`,
          });
        }
      } catch {
        // Silent fail
      }
    });
  } catch {
    notificationsSetup = false;
  }
}

// Start notification system when wallet is unlocked
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'auto-lock-check' && !isLocked()) {
    setupTransactionNotifications();
  }
});
