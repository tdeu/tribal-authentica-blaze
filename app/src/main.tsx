import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import './styles.css';
import { BlazeBanner } from './components/BlazeBanner';
import { WalletChip, WalletConnect } from './components/WalletConnect';
import { HowItWorks } from './components/HowItWorks';
import { Logo } from './components/art';
import { MaskPage } from './pages/MaskPage';
import { Gallery } from './pages/Gallery';
import { CertificatePage } from './pages/CertificatePage';
import { WhatIfPage } from './pages/WhatIfPage';
import { MINTED_TOTAL, maskById, verifyHref, type MaskView } from './content/mask';
import { wallet } from './wallet/wizard';
import { T } from './content/i18n';
import { copyFor, type Copy } from './content/copy';
import type { Lang } from './content/mask';

// Hash routes: #/ = gallery, #/what-if = what if something goes wrong, #/mask/<catalogueId> = one mask,
// #/mask/<catalogueId>/certificate = its certificate
type Route = { mask: MaskView; certificate: boolean; whatIf?: false } | { whatIf: true; mask?: undefined; certificate?: false };
const parseRoute = (): Route | undefined => {
  if (/^#\/what-if/.test(window.location.hash)) return { whatIf: true };
  const m = /^#\/mask\/(\d+)(\/certificate)?/.exec(window.location.hash);
  const mask = m ? maskById(Number(m[1])) : undefined;
  return mask ? { mask, certificate: !!m![2] } : undefined;
};
// Section links in the nav work from any route: go to the gallery first, then scroll
const toSection = (id: string) => {
  const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  if (window.location.hash === '#/' || window.location.hash === '') { scroll(); return; }
  window.location.hash = '#/';
  setTimeout(scroll, 80);
};
function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const on = () => { setRoute(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const initialLang = (): Lang => {
  try { const v = localStorage.getItem('lang'); if (v === 'fr' || v === 'en') return v; } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
};

const refOf = (m: MaskView) => `[ ${m.ref} / ${MINTED_TOTAL} ]`;

function Header({ c, lang, setLang, mask, certificate, onConnect }: {
  c: Copy; lang: Lang; setLang: (l: Lang) => void; mask?: MaskView; certificate: boolean; onConnect: () => void;
}) {
  const toggle = <button type="button" className="lang-btn" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} aria-label={c.nav.langLabel}>{c.nav.lang}</button>;
  const chip = <WalletChip onOpen={onConnect} label={c.connect} connectedLabel={c.connected} />;
  return (
    <header className="site-head">
      <a className="brand" href="#/"><Logo />SANKOFA</a>
      {!mask && (
        <>
          <nav className="site-nav" aria-label="Main">
            <button type="button" onClick={() => toSection('collection')}>{c.nav.collection}</button>
            <button type="button" onClick={() => toSection('how')}>{c.nav.how}</button>
            <a href="#/what-if">{c.nav.whatIf}</a>
            <a href={verifyHref()}>{c.nav.verify}</a>
          </nav>
          <div className="head-right">{toggle}{chip}</div>
        </>
      )}
      {mask && (
        <>
          {certificate
            ? <a className="head-back" href={`#/mask/${mask.catalogueId}`}>{c.cert.back}</a>
            : <a className="head-back" href="#/">{c.mask.back}</a>}
          <div className="head-right">
            {!certificate && <span className="head-ref">{refOf(mask)}</span>}
            {toggle}{chip}
          </div>
        </>
      )}
    </header>
  );
}

function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [connectOpen, setConnectOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const t = T[lang];
  const c = copyFor(lang);
  const route = useRoute();
  const mask = route?.mask;

  useEffect(() => { wallet.resume(); }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  }, [lang]);

  const onConnect = () => setConnectOpen(true);
  const onHow = () => setHowOpen(true);

  return (
    <>
      <BlazeBanner donate={c.donate} />
      <Header c={c} lang={lang} setLang={setLang} mask={mask} certificate={!!route?.certificate} onConnect={onConnect} />
      <main>
        {mask && route?.certificate
          ? <CertificatePage key={`c${mask.catalogueId}`} mask={mask} lang={lang} t={t} c={c} />
          : mask
          ? <MaskPage key={mask.catalogueId} mask={mask} lang={lang} setLang={setLang} t={t} c={c} onConnect={onConnect} onHow={onHow} />
          : route?.whatIf
          ? <WhatIfPage lang={lang} />
          : <Gallery lang={lang} t={t} c={c} onConnect={onConnect} />}
      </main>
      <footer className="site-foot">{c.footer.map((f) => <span key={f}>{f}</span>)}<a href="#/what-if">{c.whatIfLink}</a></footer>
      <WalletConnect open={connectOpen} onClose={() => setConnectOpen(false)} t={t} />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} lang={lang} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
