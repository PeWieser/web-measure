import React from "react";

type P = { className?: string; size?: number };

function make(children: React.ReactNode) {
  return function Icon({ className, size = 18 }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {children}
      </svg>
    );
  };
}

const dot = (x: number, y: number, r = 1.6) => (
  <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" stroke="none" />
);

export const I = {
  logo: make(
    <>
      <circle cx={10} cy={10} r={7.2} />
      <path d="M10 1.8v3.4M10 14.8v3.4M1.8 10h3.4M14.8 10h3.4" />
      <circle cx={10} cy={10} r={1.4} fill="currentColor" stroke="none" />
    </>
  ),
  select: make(
    <>
      <path d="M5 3.5 15.5 9l-4.6 1.6L8.3 15.8 5 3.5Z" />
      <path d="m9.8 11.5 4.4 4.4" />
    </>
  ),
  pan: make(
    <>
      <path d="M7.5 9V4.6a1.3 1.3 0 0 1 2.6 0V9" />
      <path d="M10.1 8.8V3.9a1.3 1.3 0 0 1 2.6 0v5.4" />
      <path d="M12.7 9.6V5.8a1.3 1.3 0 0 1 2.6 0v6.4c0 3.4-2 5.8-4.9 5.8-2.4 0-3.6-1.2-4.8-3.3l-1.4-2.5c-.6-1 .3-2.2 1.5-1.9.6.2 1 .6 1.3 1.1l.9 1.5" />
    </>
  ),
  calib2: make(
    <>
      <path d="M3 14.5 14.5 3" />
      <path d="M14.5 10.5 3 3" opacity={0} />
      <path d="M3.6 12.2v4.6M14.9 3.2h-4.6" />
      {dot(3, 14.5)}
      {dot(14.5, 3)}
    </>
  ),
  calib4: make(
    <>
      <path d="m4 4.5 12-1.5 1.5 12.5L5.5 17 4 4.5Z" />
      {dot(4, 4.5, 1.4)}
      {dot(16, 3, 1.4)}
      {dot(17.5, 15.5, 1.4)}
      {dot(5.5, 17, 1.4)}
    </>
  ),
  line: make(
    <>
      <path d="M4 15.5 15 4.5" />
      {dot(4, 15.5)}
      {dot(15, 4.5)}
    </>
  ),
  polyline: make(
    <>
      <path d="m2.5 15.5 5-8 4 4.5 5.5-9" />
      {dot(2.5, 15.5)}
      {dot(17, 3)}
    </>
  ),
  polygon: make(
    <>
      <path d="M10 2.8 17.5 9l-3 9.2H5.5L2.5 9 10 2.8Z" />
    </>
  ),
  rect: make(<path d="M3.5 5.5h13v9h-13v-9Z" />),
  ellipse: make(<ellipse cx={10} cy={10} rx={7} ry={4.8} />),
  circle3: make(
    <>
      <circle cx={10} cy={10} r={6.5} />
      {dot(10, 3.5, 1.4)}
      {dot(4.1, 13.3, 1.4)}
      {dot(15.9, 13.3, 1.4)}
    </>
  ),
  angle: make(
    <>
      <path d="M3.5 16 16 4.5" />
      <path d="M3.5 16H16.5" />
      <path d="M8.6 16a6 6 0 0 0-1.5-3.7" />
    </>
  ),
  lineangle: make(
    <>
      <path d="m3 4 14 12" />
      <path d="m17 4-14 12" />
    </>
  ),
  lot: make(
    <>
      <path d="M3 15.5h14" />
      <path d="M10 4v10" />
      <path d="m7.5 11.5 2.5 2.5 2.5-2.5" />
      {dot(10, 4)}
    </>
  ),
  parallel: make(
    <>
      <path d="M3 5.5h14" />
      <path d="M3 14.5h14" />
      <path d="M10 5.5v9" />
      <path d="m8.3 7.3 1.7-1.8 1.7 1.8M8.3 12.7l1.7 1.8 1.7-1.8" />
    </>
  ),
  marker: make(
    <>
      <circle cx={10} cy={10} r={6.5} />
      <path d="M10 6.8v.1M8 12.2l2-4.5h.9v4.5" strokeWidth={1.3} />
    </>
  ),
  text: make(
    <>
      <path d="M4 5.5V3.5h12v2" />
      <path d="M10 3.5v13" />
      <path d="M7.5 16.5h5" />
    </>
  ),
  arrow: make(
    <>
      <path d="M4 16 15 5" />
      <path d="M9.5 4.5H15.5V10.5" />
    </>
  ),
  zoomIn: make(
    <>
      <circle cx={9} cy={9} r={5.8} />
      <path d="m13.4 13.4 4 4M6.8 9h4.4M9 6.8v4.4" />
    </>
  ),
  zoomOut: make(
    <>
      <circle cx={9} cy={9} r={5.8} />
      <path d="m13.4 13.4 4 4M6.8 9h4.4" />
    </>
  ),
  fit: make(
    <>
      <path d="M7.5 3H3.5v4M12.5 3h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" />
    </>
  ),
  oneTo1: make(
    <>
      <rect x={3} y={6} width={14} height={8.5} rx={1} />
      <path d="M7 10.2h.1M10 10.2h.1M13 10.2h.1" strokeWidth={2} />
    </>
  ),
  scalebar: make(
    <>
      <path d="M3 12h14" />
      <path d="M3 9.5v5M17 9.5v5M10 9.5v3" />
      <path d="M3 9.5h14" strokeWidth={1} opacity={0.5} />
    </>
  ),
  download: make(
    <>
      <path d="M10 3.5v8.5M6.8 9l3.2 3.2L13.2 9" />
      <path d="M4 15.5v1.5h12v-1.5" />
    </>
  ),
  image: make(
    <>
      <rect x={3} y={4} width={14} height={12} rx={1} />
      <circle cx={7.3} cy={8} r={1.3} />
      <path d="m3.5 14.5 4-4 3 3 2.5-2.5 3.5 3.5" />
    </>
  ),
  table: make(
    <>
      <rect x={3} y={4} width={14} height={12} rx={1} />
      <path d="M3 8h14M3 12h14M8 4v12" />
    </>
  ),
  trash: make(
    <>
      <path d="M4 5.5h12M8 5V3.5h4V5M5.5 5.5 6.3 16h7.4l.8-10.5" />
      <path d="M8.5 8.5v4.5M11.5 8.5v4.5" />
    </>
  ),
  eye: make(
    <>
      <path d="M2.5 10S5 5.5 10 5.5 17.5 10 17.5 10 15 14.5 10 14.5 2.5 10 2.5 10Z" />
      <circle cx={10} cy={10} r={2.2} />
    </>
  ),
  eyeOff: make(
    <>
      <path d="M4 4.5 16 15.5" />
      <path d="M8.2 6c.6-.2 1.2-.3 1.8-.3 5 0 7.5 4.3 7.5 4.3a13 13 0 0 1-2.3 2.7M6.4 6.7A13 13 0 0 0 2.5 10S5 14.3 10 14.3c.7 0 1.4-.1 2-.3" />
    </>
  ),
  check: make(<path d="m4 10.5 4 4 8-9" />),
  x: make(<path d="m5 5 10 10M15 5 5 15" />),
  plus: make(<path d="M10 4v12M4 10h12" />),
  minus: make(<path d="M4 10h12" />),
  upload: make(
    <>
      <path d="M10 13.5V5M6.8 8 10 4.8 13.2 8" />
      <path d="M4 15.5v1.5h12v-1.5" />
    </>
  ),
  sliders: make(
    <>
      <path d="M4 6h9M16.5 6H17M4 14h3M10.5 14H16" />
      <circle cx={15} cy={6} r={1.8} />
      <circle cx={8.5} cy={14} r={1.8} />
    </>
  ),
  scan: make(
    <>
      <path d="M7.5 3H3.5v4M12.5 3h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" />
      <path d="M3.5 10h13" />
    </>
  ),
  count: make(
    <>
      <circle cx={7} cy={7} r={3.2} />
      <circle cx={13.5} cy={13} r={3.2} />
      <path d="M13.5 11.6h.1" strokeWidth={2} />
    </>
  ),
  save: make(
    <>
      <path d="M4 4.5h11L16 6.5V15.5h-12v-11Z" />
      <path d="M7 4.5v3.5h6V4.5M7 15.5v-4h6v4" />
    </>
  ),
  folder: make(
    <>
      <path d="M3 5.5h5l1.7 2H17v7H3v-9Z" />
    </>
  ),
  reset: make(
    <>
      <path d="M4.5 8A6.3 6.3 0 1 1 4 11.5" />
      <path d="M4.5 4v4h4" />
    </>
  ),
  chevR: make(<path d="m7.5 4.5 6 5.5-6 5.5" />),
  snap: make(
    <>
      <circle cx={10} cy={10} r={2} />
      <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" />
    </>
  ),
  crop: make(
    <>
      <path d="M6 2.5v11.5h11.5M2.5 6h11.5v11.5" />
    </>
  ),
  contrast: make(
    <>
      <circle cx={10} cy={10} r={6.8} />
      <path d="M10 3.2v13.6A6.8 6.8 0 0 0 10 3.2Z" fill="currentColor" stroke="none" />
    </>
  ),
  edge: make(
    <>
      <path d="M3 16.5C5 8 7 5 10 5s3 3 5 5 2-1 2-1" opacity={0} />
      <path d="M2.8 15.5C4.5 7 7.5 4.5 10 4.5s3.5 3.5 5 5.5c1.2 1.6 2.2 1.2 2.2 1.2" />
    </>
  ),
  warn: make(
    <>
      <path d="M10 3.5 17.5 16h-15L10 3.5Z" />
      <path d="M10 8v3.5M10 13.8v.2" strokeWidth={1.8} />
    </>
  ),
};

export type IconComp = keyof typeof I;
