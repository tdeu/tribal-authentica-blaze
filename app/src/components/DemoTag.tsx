import type { Lang } from '../content/mask';
import { copyFor } from '../content/copy';

// One small tag next to every price (collection, mask page, buy sheet) and on the certificate.
// The full demo notice lives at the top of #/what-if.
export function DemoTag({ lang }: { lang: Lang }) {
  return <span className="demo-tag" lang={lang}>{copyFor(lang).demoTag}</span>;
}
