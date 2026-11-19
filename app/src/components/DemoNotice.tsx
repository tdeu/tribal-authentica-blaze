import { DEMO_NOTICE, type Lang } from '../content/mask';
import { copyFor } from '../content/copy';

// Shown near the top of the gallery, every mask page and every certificate (never in a footer).
export function DemoNotice({ lang, className = '' }: { lang: Lang; className?: string }) {
  return (
    <div className={['demo-notice', className].filter(Boolean).join(' ')} role="note" lang={lang}>
      <p>{DEMO_NOTICE[lang]}</p>
      <p className="demo-by">{copyFor(lang).builtBy}</p>
    </div>
  );
}
