import React from 'react';

/*
 * MIZAN brand mark — vector translation of the approved lockup
 * (public/brand/mizan-logo-approved.png).
 *
 * The previous MizanMark drew an unrelated pair of scale pans, so the product and the
 * approved identity disagreed on every screen. This is the approved mark rebuilt as
 * geometry: an ogee mihrab arch, an open muṣḥaf, the gold qalam rising through the spine,
 * and the diamond finial. It carries the double reading the name asks for — the qalam is
 * also the beam of a balance, the two pages its pans.
 *
 * Parts are individually classed (mz-arch, mz-page…) so motion lives in CSS
 * (see "MIZAN brand motion" in src/index.css) and this file stays pure geometry.
 */

export type MizanTone = 'brand' | 'inverse' | 'mono';

const PATHS = {
  finial: 'M60 2.5 64.6 8.6 60 14.7 55.4 8.6Z',
  // Ogee arch, drawn as one stroke so the apex keeps a true mitred point.
  arch:
    'M39.5 90C34.5 81.5 30.8 70.5 32.2 54 34 35 56.4 28 60 20c3.6 8 26 15 27.8 34 1.4 16.5-2.3 27.5-7.3 36',
  pageRight: 'M60 71c13.5-9.5 27-13.5 40-11.5-2 8.5-2 19 0 27.5-13.5-2-28 .5-40 9Z',
  pageLeft: 'M60 71c-13.5-9.5-27-13.5-40-11.5 2 8.5 2 19 0 27.5 13.5-2 28 .5 40 9Z',
  // Leaf creases: the second page under the top one. Fades out on its own at icon sizes.
  leafRight: 'M60 80c11-7.6 22.6-10.6 33.6-9.6',
  leafLeft: 'M60 80c-11-7.6-22.6-10.6-33.6-9.6',
  coverRight: 'M60 96c12-8.5 26.5-11 40-9 .5 6-4 11.5-11.5 13.5-13.5 0-22.5 2-28.5 5.5Z',
  coverLeft: 'M60 96c-12-8.5-26.5-11-40-9-.5 6 4 11.5 11.5 13.5 13.5 0 22.5 2 28.5 5.5Z',
  qalam:
    'M60 43c.85 0 1.35 2.2 1.5 9.4l.55 33.6c.08 6.2-.7 11.4-2.05 15.5-1.35-4.1-2.13-9.3-2.05-15.5l.55-33.6c.15-7.2.65-9.4 1.5-9.4Z',
} as const;

interface MarkProps {
  className?: string;
  tone?: MizanTone;
  decorative?: boolean;
  title?: string;
}

export const MizanMark: React.FC<MarkProps> = ({
  className = '',
  tone = 'brand',
  decorative = false,
  title = 'شعار ميزان',
}) => {
  const uid = React.useId().replace(/[:]/g, '');
  const mono = tone === 'mono';
  const inverse = tone === 'inverse';

  // Emerald reads as warm parchment on dark venue screens so the mark keeps its
  // silhouette on the Ceremony / Waiting Hall backgrounds instead of vanishing.
  const archFrom = mono ? 'currentColor' : inverse ? '#F2ECDD' : '#123F35';
  const archTo = mono ? 'currentColor' : inverse ? '#CFE0D6' : '#2C6656';
  const goldFrom = mono ? 'currentColor' : '#E8CB93';
  const goldTo = mono ? 'currentColor' : '#B98B4E';
  const pageFrom = mono ? 'none' : inverse ? 'rgba(255,253,246,.94)' : '#FFFDF6';
  const pageTo = mono ? 'none' : inverse ? 'rgba(238,228,206,.86)' : '#F3E8D2';
  const pageStroke = mono ? 'currentColor' : inverse ? 'rgba(216,177,114,.9)' : '#D8B172';
  const coverFill = mono ? 'currentColor' : inverse ? '#B7CCC1' : `url(#mzArch${uid})`;

  return (
    <svg
      className={`mizan-mark ${className}`}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
    >
      {!mono && (
        <defs>
          <linearGradient id={`mzArch${uid}`} x1="26" y1="30" x2="94" y2="96" gradientUnits="userSpaceOnUse">
            <stop stopColor={archFrom} />
            <stop offset="1" stopColor={archTo} />
          </linearGradient>
          <linearGradient id={`mzGold${uid}`} x1="60" y1="30" x2="60" y2="104" gradientUnits="userSpaceOnUse">
            <stop stopColor={goldFrom} />
            <stop offset=".55" stopColor={goldTo} />
            <stop offset="1" stopColor={goldFrom} />
          </linearGradient>
          <linearGradient id={`mzPage${uid}`} x1="60" y1="58" x2="78" y2="98" gradientUnits="userSpaceOnUse">
            <stop stopColor={pageFrom} />
            <stop offset="1" stopColor={pageTo} />
          </linearGradient>
        </defs>
      )}

      <g transform="translate(0 3)">
        <path className="mz-finial" d={PATHS.finial} fill={mono ? 'currentColor' : `url(#mzGold${uid})`} />

        {/* pathLength normalises the draw-on animation regardless of stroke geometry */}
        <path
          className="mz-arch"
          d={PATHS.arch}
          pathLength={100}
          stroke={mono ? 'currentColor' : `url(#mzArch${uid})`}
          strokeWidth={6.8}
          strokeLinecap="round"
          strokeLinejoin="miter"
          strokeMiterlimit={7}
        />

        <g className="mz-book">
          <path className="mz-cover mz-cover-l" d={PATHS.coverLeft} fill={coverFill} />
          <path className="mz-cover mz-cover-r" d={PATHS.coverRight} fill={coverFill} />
          <path
            className="mz-page mz-page-l"
            d={PATHS.pageLeft}
            fill={mono ? 'none' : `url(#mzPage${uid})`}
            stroke={pageStroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <path
            className="mz-page mz-page-r"
            d={PATHS.pageRight}
            fill={mono ? 'none' : `url(#mzPage${uid})`}
            stroke={pageStroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <g className="mz-leaves" opacity={mono ? 0 : 0.5}>
            <path d={PATHS.leafLeft} stroke={pageStroke} strokeWidth={1} strokeLinecap="round" />
            <path d={PATHS.leafRight} stroke={pageStroke} strokeWidth={1} strokeLinecap="round" />
          </g>
        </g>

        <path className="mz-qalam" d={PATHS.qalam} fill={mono ? 'currentColor' : `url(#mzGold${uid})`} />
        <g className="mz-orb">
          <circle cx="60" cy="39" r="5.4" fill={mono ? 'currentColor' : `url(#mzGold${uid})`} />
          {!mono && <circle cx="58.3" cy="37.2" r="1.9" fill="#FFF6E4" opacity=".55" />}
        </g>
      </g>
    </svg>
  );
};

/* ── Wordmark ──────────────────────────────────────────────────────────────── */

interface WordmarkProps {
  language?: string;
  tone?: MizanTone;
  compact?: boolean;
  tagline?: string;
  className?: string;
}

export const MizanWordmark: React.FC<WordmarkProps> = ({
  language = 'ar',
  tone = 'brand',
  compact = false,
  tagline,
  className = '',
}) => {
  const ar = language === 'ar';
  return (
    <span className={`mizan-wordmark ${tone === 'inverse' ? 'is-inverse' : ''} ${compact ? 'is-compact' : ''} ${className}`}>
      <span className="mizan-wordmark-name" dir={ar ? 'rtl' : 'ltr'}>
        {ar ? 'ميزان' : 'MIZAN'}
      </span>
      {/* data-no-localize keeps ArabicInterfaceGuard from rewriting the Latin
          half of the lockup into "ميزان" while the app is in Arabic. */}
      {ar && (
        <span className="mizan-wordmark-rule" aria-hidden="true" data-no-localize="true">
          <i /><b>MIZAN</b><i />
        </span>
      )}
      {tagline && <span className="mizan-wordmark-tagline">{tagline}</span>}
    </span>
  );
};

/* ── Lockup ────────────────────────────────────────────────────────────────── */

interface LogoProps {
  language?: string;
  compact?: boolean;
  className?: string;
  showWordmark?: boolean;
  tone?: MizanTone;
  stacked?: boolean;
  tagline?: string;
}

export const MizanLogo: React.FC<LogoProps> = ({
  language = 'ar',
  compact = false,
  className = '',
  showWordmark = true,
  tone = 'brand',
  stacked = false,
  tagline,
}) => {
  const ar = language === 'ar';
  const markSize = stacked ? 'w-24 h-24' : compact ? 'w-10 h-10' : 'w-14 h-14';
  return (
    <span
      className={`mizan-logo ${stacked ? 'is-stacked' : ''} ${className}`}
      aria-label={ar ? 'ميزان' : 'MIZAN'}
    >
      <MizanMark className={markSize} tone={tone} decorative />
      {showWordmark && (
        <MizanWordmark language={language} tone={tone} compact={compact} tagline={tagline} />
      )}
    </span>
  );
};
