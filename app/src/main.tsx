import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { BlazeBanner } from './components/BlazeBanner';
import { WalletChip, WalletConnect } from './components/WalletConnect';
import { HowItWorks } from './components/HowItWorks';
import { MaskPage } from './pages/MaskPage';
import { wallet } from './wallet/wizard';
import { T } from './content/i18n';
import type { Lang } from './content/mask';

const initialLang = (): Lang => {
  try { const v = localStorage.getItem('lang'); if (v === 'fr' || v === 'en') return v; } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
};

function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [connectOpen, setConnectOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const t = T[lang];

  useEffect(() => { wallet.resume(); }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  }, [lang]);

  return (
    <>
      <BlazeBanner />
      <div className="topbar">
        <span className="brand">Tribal Authentica</span>
        <div className="topbar-right">
          <div className="lang-toggle" role="group" aria-label="Language">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <WalletChip onOpen={() => setConnectOpen(true)} t={t} />
        </div>
      </div>
      <main>
        <MaskPage lang={lang} t={t} onConnect={() => setConnectOpen(true)} onHow={() => setHowOpen(true)} />
      </main>
      <WalletConnect open={connectOpen} onClose={() => setConnectOpen(false)} t={t} />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} lang={lang} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
