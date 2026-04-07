// ── Types ──

export interface TxContext {
  score: number;
  issues: Array<{ severity: string; title: string }>;
  utxoCount: number;
  hasStonewall: boolean;
  hasRicochet: boolean;
  destinationType: 'p2wpkh' | 'p2tr' | 'p2sh' | 'p2pkh' | 'silent' | 'paynym' | 'unknown';
}

// ── API key management ──

const API_KEY_STORAGE = 'anthropic_api_key';

export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(API_KEY_STORAGE);
  return (result[API_KEY_STORAGE] as string) ?? null;
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE]: key });
}

// ── AI Analysis ──

export async function analyzeWithAI(txContext: TxContext): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('No API key configured. Add one in Settings.');
  }

  // Build context string — NEVER include addresses, txids, or exact amounts
  const issueList = txContext.issues.map(i => `[${i.severity}] ${i.title}`).join('; ');

  const userMessage = [
    `Privacy Score: ${txContext.score}/100`,
    `Problemas: ${issueList || 'ninguno'}`,
    `UTXOs usados: ${txContext.utxoCount}`,
    `Stonewall: ${txContext.hasStonewall ? 'sí' : 'no'}`,
    `Ricochet: ${txContext.hasRicochet ? 'sí' : 'no'}`,
    `Tipo de destino: ${txContext.destinationType}`,
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: 'You are a Bitcoin privacy expert. Analyze this transaction and explain in plain language the risks and how to improve privacy. Be concise, maximum 3 sentences. No emojis.',
      messages: [
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key. Check it in Settings.');
    }
    throw new Error(`Error API (${response.status}): ${errorBody.slice(0, 100)}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Empty response from model');

  return textBlock.text;
}
