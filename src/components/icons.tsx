/** Hairline icons, 1.5px stroke, drawn on a 24-unit grid. */

type P = { size?: number };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const ArrowLeft = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
);

export const Sun = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const Moon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
);

export const Copy = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h7a2 2 0 0 1 2 2" />
  </svg>
);

export const Check = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="m4 12.5 5 5L20 6.5" />
  </svg>
);

export const Users = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2M18 14.4a6.5 6.5 0 0 1 3.5 5.6" />
  </svg>
);

export const Bot = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="3.5" y="7.5" width="17" height="12" rx="4" />
    <path d="M12 3.5v4M8.5 13h.01M15.5 13h.01M9.5 16.5h5" />
  </svg>
);

export const Spinner = ({ size = 16 }: P) => (
  <svg {...base(size)} className="spin">
    <path d="M12 3a9 9 0 1 1-6.4 2.7" />
  </svg>
);
