import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { BlazeBanner } from './components/BlazeBanner';
import { WalletChip, WalletConnect } from './components/WalletConnect';
import { MaskPage } from './pages/MaskPage';
import { wallet } from './wallet/wizard';

function App() {
  const [connectOpen, setConnectOpen] = useState(false);
  useEffect(() => { wallet.resume(); }, []);
  return (
    <>
      <BlazeBanner />
      <div className="topbar">
        <span className="brand">Tribal Authentica</span>
        <WalletChip onOpen={() => setConnectOpen(true)} />
      </div>
      <main>
        <MaskPage onConnect={() => setConnectOpen(true)} />
      </main>
      <WalletConnect open={connectOpen} onClose={() => setConnectOpen(false)} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
