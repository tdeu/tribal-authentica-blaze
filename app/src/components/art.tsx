// Visual primitives of the redesign (design/*.dc.html). Pure rendering, no logic.
import { useMemo, type CSSProperties } from 'react';

// ---------------------------------------------------------------- DotMask
// 24×34 dot-matrix mask, same shape function as design/Main.dc.html.
const W = 24, H = 34, CX = 11.5;
function maskDots(): (number | null)[] {
  const out: (number | null)[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let on = false;
      const dx = (x - CX) / 9.5, dy = (y - 19) / 14.5;
      if (dx * dx + dy * dy <= 1) on = true;
      if (y >= 1 && y <= 5) { const hw = 2 + (5 - y) * 0.2 + (y - 1); if (Math.abs(x - CX) <= Math.min(hw, 6)) on = true; }
      const eye = (y === 15 || y === 16) && ((x >= 6 && x <= 9) || (x >= 14 && x <= 17));
      const mouth = y === 27 && x >= 10 && x <= 13;
      const nose = y >= 17 && y <= 23 && (x === 11 || x === 12);
      const brow = y === 13 && ((x >= 5 && x <= 10) || (x >= 13 && x <= 18));
      if (!on || eye || mouth) { out.push(null); continue; }
      const d = Math.sqrt(((x - 6) / 18) ** 2 + ((y - 8) / 30) ** 2);
      out.push(nose || brow ? 1 : Math.max(0.28, 1 - d * 0.9));
    }
  }
  return out;
}
const MASK_DOTS = maskDots();

export function DotMask({ label }: { label: string }) {
  return (
    <div className="dotmask" role="img" aria-label={label}>
      {MASK_DOTS.map((a, i) => (
        <span key={i} aria-hidden className={a === null ? 'off' : undefined} style={a === null ? undefined : { opacity: a.toFixed(2) }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- PixelDigits
// 5×7 pixel font for digits and %. The 9, 0 and % glyphs are the design's.
const FONT: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
};

export function PixelDigits({ value, label }: { value: string; label: string }) {
  return (
    <div className="pixeldigits" role="img" aria-label={label}>
      {[...value].filter((ch) => FONT[ch]).map((ch, i) => (
        <div key={i} className="pixelglyph" aria-hidden>
          {FONT[ch].join('').split('').map((b, j) => <span key={j} className={b === '1' ? 'on' : undefined} />)}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- HashGrid
// Real bytes as dots, 1 bit = 1 dot, most significant bit first, 16 dots per row (2 bytes per row).
// 32 bytes → 16×16. `revealed` false = all dots off (before the step runs). `mark` = byte index to
// highlight (first differing byte).
export function HashGrid({ bytes, revealed, mark, label }: { bytes?: Uint8Array; revealed: boolean; mark?: number; label: string }) {
  const n = bytes?.length ?? 32;
  const dots = useMemo(() => {
    const out: { on: boolean; byte: number }[] = [];
    for (let i = 0; i < n; i++) for (let b = 7; b >= 0; b--) out.push({ on: !!bytes && ((bytes[i] >> b) & 1) === 1, byte: i });
    return out;
  }, [bytes, n]);
  return (
    <div className="hashgrid" role="img" aria-label={label}>
      {dots.map((d, i) => (
        <span key={i} aria-hidden className={`${revealed && d.on ? 'on' : ''}${revealed && mark === d.byte ? ' mark' : ''}`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Ticker
// Marquee strip: the item list twice, scrolled by CSS (≥ 40 s loop), static with reduced motion.
export function Ticker({ items, quiet = false }: { items: string[]; quiet?: boolean }) {
  const seq = [...items, ...items];
  return (
    <div className={`ticker${quiet ? ' ticker-quiet' : ''}`} aria-hidden>
      <div className="ticker-track" style={{ '--ticker-s': `${Math.max(40, items.length * 9)}s` } as CSSProperties}>
        {[0, 1].map((k) => (
          <span key={k} className="ticker-run">
            {seq.map((t, i) => <span key={i}>{t}<i>✱</i></span>)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Bracket corners
export function Corners({ bottom = true }: { bottom?: boolean }) {
  return (
    <>
      <span aria-hidden className="corner tl" />
      <span aria-hidden className="corner tr" />
      {bottom && <><span aria-hidden className="corner bl" /><span aria-hidden className="corner br" /></>}
    </>
  );
}

// ---------------------------------------------------------------- Logo (5×7 dot mask)
const LOGO = ['01110', '11111', '10101', '11111', '11011', '01110', '00100'].join('');
export function Logo() {
  return <span className="logo" aria-hidden>{LOGO.split('').map((b, i) => <span key={i} className={b === '1' ? 'on' : undefined} />)}</span>;
}

// ---------------------------------------------------------------- SplitBar
// 20 squares: `accent` of them in the accent colour (the keeper's share), the rest muted.
export function SplitBar({ accent, label }: { accent: number; label: string }) {
  return (
    <div className="splitsq" role="img" aria-label={label}>
      {Array.from({ length: 20 }, (_, i) => <span key={i} aria-hidden className={i < accent ? 'on' : undefined} />)}
    </div>
  );
}
