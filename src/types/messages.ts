// ── Request types (popup → background) ──

export interface GenerateSeedRequest {
  type: 'GENERATE_SEED';
}

export interface SetupWalletRequest {
  type: 'SETUP_WALLET';
  password: string;
  seed: string;
}

export interface UnlockWalletRequest {
  type: 'UNLOCK_WALLET';
  password: string;
}

export interface LockWalletRequest {
  type: 'LOCK_WALLET';
}

export interface IsLockedRequest {
  type: 'IS_LOCKED';
}

export interface HasVaultRequest {
  type: 'HAS_VAULT';
}

export interface GetBalanceRequest {
  type: 'GET_BALANCE';
}

export interface GetReceiveAddressRequest {
  type: 'GET_RECEIVE_ADDRESS';
}

export interface GetTransactionHistoryRequest {
  type: 'GET_TRANSACTION_HISTORY';
}

export interface GetUTXOsRequest {
  type: 'GET_UTXOS';
}

export interface SendTransactionRequest {
  type: 'SEND_TRANSACTION';
  destination: string;
  amountSats: number;
  feeRate: number;
  mode: 'simple' | 'stonewall' | 'ricochet';
  selectedUtxos?: string[]; // txid:vout
}

export interface EstimateFeeRequest {
  type: 'ESTIMATE_FEE';
  destination: string;
  amountSats: number;
  feeRate: number;
  mode: 'simple' | 'stonewall' | 'ricochet';
}

export interface GetFeeRatesRequest {
  type: 'GET_FEE_RATES';
}

export interface GetNodeInfoRequest {
  type: 'GET_NODE_INFO';
}

export interface SetNodeUrlRequest {
  type: 'SET_NODE_URL';
  url: string;
}

export interface TestConnectionRequest {
  type: 'TEST_CONNECTION';
  url?: string;
}

export interface GetConnectionStatusRequest {
  type: 'GET_CONNECTION_STATUS';
}

export interface ExportSeedRequest {
  type: 'EXPORT_SEED';
  password: string;
}

export interface AnalyzePrivacyRequest {
  type: 'ANALYZE_PRIVACY';
  destination: string;
  amountSats: number;
  feeRate: number;
  mode: 'simple' | 'stonewall' | 'ricochet';
  selectedUtxos?: string[];
}

// ── UTXO Label requests ──

export interface SaveLabelRequest {
  type: 'SAVE_LABEL';
  label: {
    txid: string;
    vout: number;
    label: string;
    origin: 'exchange' | 'p2p' | 'mined' | 'mixed' | 'unknown';
    note?: string;
  };
}

export interface GetLabelsRequest {
  type: 'GET_LABELS';
}

export interface DeleteLabelRequest {
  type: 'DELETE_LABEL';
  txid: string;
  vout: number;
}

// ── Coin control ──

export interface AutoSelectUTXOsRequest {
  type: 'AUTO_SELECT_UTXOS';
  target: number;
  feeRate: number;
}

export interface ValidateSelectionRequest {
  type: 'VALIDATE_SELECTION';
  selectedUtxos: string[];
  target: number;
  feeRate: number;
}

// ── PayNym ──

export interface GetPaymentCodeRequest {
  type: 'GET_PAYMENT_CODE';
}

export interface SendNotificationTxRequest {
  type: 'SEND_NOTIFICATION_TX';
  theirPaymentCode: string;
  feeRate: number;
}

// ── Family Node ──

export interface GetWGPeersRequest {
  type: 'GET_WG_PEERS';
}

export interface GenerateWGInviteRequest {
  type: 'GENERATE_WG_INVITE';
  friendName: string;
}

export interface RemoveWGPeerRequest {
  type: 'REMOVE_WG_PEER';
  ip: string;
}

// ── AI Advisor ──

export interface AIAnalyzeRequest {
  type: 'AI_ANALYZE';
  context: {
    score: number;
    issues: Array<{ severity: string; title: string }>;
    utxoCount: number;
    hasStonewall: boolean;
    hasRicochet: boolean;
    destinationType: string;
  };
}

// ── API Key ──

export interface SetApiKeyRequest {
  type: 'SET_API_KEY';
  key: string;
}

export interface GetApiKeyRequest {
  type: 'GET_API_KEY';
}

export interface GetLoginStatusRequest {
  type: 'GET_LOGIN_STATUS';
}

// ── Hardware wallet ──

export interface SetupWatchOnlyRequest {
  type: 'SETUP_WATCH_ONLY';
  xpub: string;
  device: 'coldcard' | 'keystone';
}

export interface GetWalletModeRequest {
  type: 'GET_WALLET_MODE';
}

export interface ValidateXpubRequest {
  type: 'VALIDATE_XPUB';
  xpub: string;
}

export interface BuildUnsignedPSBTRequest {
  type: 'BUILD_UNSIGNED_PSBT';
  destination: string;
  amountSats: number;
  feeRate: number;
  mode: 'simple' | 'stonewall' | 'ricochet';
  selectedUtxos?: string[];
}

export interface BroadcastSignedPSBTRequest {
  type: 'BROADCAST_SIGNED_PSBT';
  psbtBase64: string;
}

export type BackgroundRequest =
  | GenerateSeedRequest
  | SetupWalletRequest
  | UnlockWalletRequest
  | LockWalletRequest
  | IsLockedRequest
  | HasVaultRequest
  | GetBalanceRequest
  | GetReceiveAddressRequest
  | GetTransactionHistoryRequest
  | GetUTXOsRequest
  | SendTransactionRequest
  | EstimateFeeRequest
  | GetFeeRatesRequest
  | GetNodeInfoRequest
  | SetNodeUrlRequest
  | TestConnectionRequest
  | GetConnectionStatusRequest
  | ExportSeedRequest
  | AnalyzePrivacyRequest
  | SaveLabelRequest
  | GetLabelsRequest
  | DeleteLabelRequest
  | AutoSelectUTXOsRequest
  | ValidateSelectionRequest
  | GetPaymentCodeRequest
  | SendNotificationTxRequest
  | GetWGPeersRequest
  | GenerateWGInviteRequest
  | RemoveWGPeerRequest
  | AIAnalyzeRequest
  | SetApiKeyRequest
  | GetApiKeyRequest
  | GetLoginStatusRequest
  | SetupWatchOnlyRequest
  | GetWalletModeRequest
  | ValidateXpubRequest
  | BuildUnsignedPSBTRequest
  | BroadcastSignedPSBTRequest;

// ── Response types (background → popup) ──

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type BackgroundResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

// ── Data shapes ──

export interface BalanceData {
  confirmed: number;
  unconfirmed: number;
  total: number;
}

export interface TransactionRecord {
  txid: string;
  height: number;
  timestamp: number;
  amount: number; // sats, negative = sent
  fee: number;
  confirmed: boolean;
}

export interface UTXOData {
  txid: string;
  vout: number;
  value: number;
  address: string;
  height: number;
  label?: string;
}

export interface FeeRates {
  slow: number;    // sat/vB
  normal: number;
  fast: number;
}

export interface NodeInfo {
  server: string;
  height: number;
  connected: boolean;
}

export interface PrivacyIssue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  suggestion: string;
}

export interface PrivacyAnalysis {
  score: number; // 0-100
  issues: PrivacyIssue[];
  bonuses: string[];
}

// ── Helper to send messages from popup ──

export function sendMessage<T>(request: BackgroundRequest): Promise<BackgroundResponse<T>> {
  return chrome.runtime.sendMessage(request);
}
