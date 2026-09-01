import type { ReactNode } from 'react';

type IconName = 'dashboard'|'reports'|'new'|'queue'|'settings'|'search'|'download'|'external'|'sparkle'|'refresh';
const paths: Record<IconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  reports: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
  new: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
  queue: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="1" fill="currentColor"/><circle cx="7" cy="12" r="1" fill="currentColor"/><circle cx="7" cy="18" r="1" fill="currentColor"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.12-1.3l2-1.56-2-3.46-2.42.98a7 7 0 0 0-2.25-1.3L13.9 3h-4l-.31 2.36a7 7 0 0 0-2.25 1.3l-2.42-.98-2 3.46 2 1.56A7 7 0 0 0 4.8 12c0 .44.04.87.12 1.3l-2 1.56 2 3.46 2.42-.98a7 7 0 0 0 2.25 1.3L9.9 21h4l.31-2.36a7 7 0 0 0 2.25-1.3l2.42.98 2-3.46-2-1.56c.08-.43.12-.86.12-1.3z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/></>,
  external: <><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></>,
  sparkle: <path d="M12 2c.8 5 3 7.2 8 8-5 .8-7.2 3-8 8-.8-5-3-7.2-8-8 5-.8 7.2-3 8-8z" fill="currentColor" stroke="none"/>,
  refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2.5L20 11M4 13l2.4 4.5A7 7 0 0 0 18 15"/></>,
};
export function Icon({name,size=18}:{name:IconName,size?:number}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>; }
