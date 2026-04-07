export type PrivacyLevel = 'maximum' | 'medium' | 'low';
export type NodeBadge = 'own' | 'dev' | 'public' | 'custom';

export interface NodeOption {
  id: string;
  name: string;
  url: string;
  privacyLevel: PrivacyLevel;
  privacyLabel: string;
  privacyDescription: string;
  badge: NodeBadge;
  isDefault: boolean;
  warning?: string;
}

const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
const env = meta.env ?? {};

export const KNOWN_NODES: NodeOption[] = [
  {
    id: 'own-node',
    name: 'My Node (NUC)',
    url: env.VITE_DEFAULT_NODE_URL ?? '',
    privacyLevel: 'maximum',
    privacyLabel: 'Maximum privacy',
    privacyDescription: 'Your own node. Nobody sees your queries.',
    badge: 'own',
    isDefault: true,
  },
  {
    id: 'dev-node',
    name: 'Developer node',
    url: env.VITE_NODE_ONION_ADDRESS ?? '',
    privacyLevel: 'medium',
    privacyLabel: 'Medium privacy',
    privacyDescription: 'The developer can see your addresses but never your keys.',
    badge: 'dev',
    isDefault: false,
    warning: 'The developer can see which addresses you query. Your keys never leave your device.',
  },
  {
    id: 'blockstream',
    name: 'Blockstream (public)',
    url: 'wss://electrum.blockstream.info:50002',
    privacyLevel: 'low',
    privacyLabel: 'Low privacy',
    privacyDescription: 'Public node by Blockstream. Third parties can see your addresses.',
    badge: 'public',
    isDefault: false,
    warning: 'Public nodes can see your Bitcoin addresses and link them to your IP. Use only for testing.',
  },
  {
    id: 'mempool',
    name: 'mempool.space (public)',
    url: 'wss://electrum.mempool.space:50002',
    privacyLevel: 'low',
    privacyLabel: 'Low privacy',
    privacyDescription: 'Public node by mempool.space. Third parties can see your addresses.',
    badge: 'public',
    isDefault: false,
    warning: 'Public nodes can see your Bitcoin addresses and link them to your IP. Use only for testing.',
  },
  {
    id: 'custom',
    name: 'Custom node',
    url: '',
    privacyLevel: 'maximum',
    privacyLabel: 'Depends on your node',
    privacyDescription: 'Enter the URL of your own Electrum server.',
    badge: 'custom',
    isDefault: false,
  },
];

export const BADGE_COLORS: Record<NodeBadge, string> = {
  own: 'var(--green)',
  dev: 'var(--yellow)',
  public: 'var(--red)',
  custom: 'var(--text-muted)',
};

export const PRIVACY_COLORS: Record<PrivacyLevel, string> = {
  maximum: 'var(--green)',
  medium: 'var(--yellow)',
  low: 'var(--red)',
};
