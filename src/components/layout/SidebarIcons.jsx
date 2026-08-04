const ICON_PROPS = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function IconHome() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function IconBell() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconOrgChart() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="9" y="3" width="6" height="5" rx="1.2" />
      <rect x="3" y="16" width="6" height="5" rx="1.2" />
      <rect x="15" y="16" width="6" height="5" rx="1.2" />
      <path d="M12 8v4M6 12v4M18 12v4M6 12h12" />
    </svg>
  );
}

export function IconReconciliation() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3v18M8 21h8M5 7h14" />
      <path d="M5 7 2.5 12a2.5 2.5 0 0 0 5 0L5 7Z" />
      <path d="M19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7Z" />
    </svg>
  );
}

export function IconDataQuality() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5 19.5 6.5V11c0 5-3.2 8.4-7.5 9.5C7.7 19.4 4.5 16 4.5 11V6.5L12 3.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}
