import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { BlazeBanner } from './components/BlazeBanner';
import { WalletChip, WalletConnect } from './components/WalletConnect';
import { HowItWorks } from './components/HowItWorks';
import { MaskPage } from './pages/MaskPage';
import { Gallery } from './pages/Gallery';
import { maskById } from './content/mask';
import { wallet } from './wallet/wizard';
import { T } from './content/i18n';
import type { Lang } from './content/mask';

// Hash routes: #/ = gallery, #/mask/<catalogueId> = one mask
const parseRoute = () => {
  const m = /^#\/mask\/(\d+)/.exec(window.location.hash);
  return m ? maskById(Number(m[1])) : undefined;
};
function useRoute() {
  const [mask, setMask] = useState(parseRoute);
  useEffect(() => {
    const on = () => { setMask(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return mask;
}

const initialLang = (): Lang => {
  try { const v = localStorage.getItem('lang'); if (v === 'fr' || v === 'en') return v; } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
};

function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [connectOpen, setConnectOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const t = T[lang];
  const mask = useRoute();

  useEffect(() => { wallet.resume(); }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  }, [lang]);

  return (
    <>
      <BlazeBanner />
      <div className="topbar">
        <a className="brand" href="#/">Tribal Authentica</a>
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
        {mask
          ? (<>
              <a className="back link" href="#/">{t.back}</a>
              <MaskPage key={mask.catalogueId} mask={mask} lang={lang} t={t} onConnect={() => setConnectOpen(true)} onHow={() => setHowOpen(true)} />
            </>)
          : <Gallery lang={lang} t={t} />}
      </main>
      <WalletConnect open={connectOpen} onClose={() => setConnectOpen(false)} t={t} />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} lang={lang} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
