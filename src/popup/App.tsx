import { useState, useEffect } from 'react';
import { sendMessage } from '../types/messages';
import Onboarding from './views/Onboarding';
import Unlock from './views/Unlock';
import Dashboard from './views/Dashboard';
import Send from './views/Send';
import Receive from './views/Receive';
import Settings from './views/Settings';
import UTXOMap from './views/UTXOMap';
import FamilyNode from './views/FamilyNode';
import WalletBackup from './views/WalletBackup';
import AdvancedSettings from './views/AdvancedSettings';
import TransactionHistory from './views/TransactionHistory';

type View = 'loading' | 'onboarding' | 'unlock' | 'dashboard' | 'send' | 'receive'
  | 'settings' | 'utxomap' | 'familynode' | 'backup' | 'advanced' | 'history';

export default function App() {
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    checkState();
  }, []);

  const checkState = async () => {
    const hasVaultResp = await sendMessage<boolean>({ type: 'HAS_VAULT' });
    if (!hasVaultResp.success || !hasVaultResp.data) {
      setView('onboarding');
      return;
    }
    const isLockedResp = await sendMessage<boolean>({ type: 'IS_LOCKED' });
    if (!isLockedResp.success || isLockedResp.data) {
      setView('unlock');
      return;
    }
    setView('dashboard');
  };

  const handleNavigate = (target: string) => setView(target as View);

  if (view === 'loading') {
    return (
      <div className="container" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '560px' }}>
        <div className="spinner" />
        <p className="text-muted text-small mt-16">Cargando...</p>
      </div>
    );
  }

  const back = () => setView('dashboard');

  switch (view) {
    case 'onboarding': return <Onboarding onComplete={() => setView('dashboard')} />;
    case 'unlock': return <Unlock onUnlock={() => setView('dashboard')} />;
    case 'dashboard': return <Dashboard onNavigate={handleNavigate} />;
    case 'send': return <Send onBack={back} />;
    case 'receive': return <Receive onBack={back} />;
    case 'settings': return <Settings onBack={back} onLock={() => setView('unlock')} onNavigate={handleNavigate} />;
    case 'utxomap': return <UTXOMap onBack={back} />;
    case 'familynode': return <FamilyNode onBack={back} />;
    case 'backup': return <WalletBackup onBack={back} onImported={() => setView('dashboard')} />;
    case 'advanced': return <AdvancedSettings onBack={() => setView('settings')} />;
    case 'history': return <TransactionHistory onBack={back} />;
    default: return null;
  }
}
