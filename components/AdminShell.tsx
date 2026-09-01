'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon } from './Icons';
import { withBasePath } from '@/lib/app-paths';
import { useAdminToken } from './useAdminToken';

const nav = [
  ['/dashboard','dashboard','Dashboard'],
  ['/audits/new','new','New Audit'],
  ['/reports','reports','Reports'],
  ['/queue','queue','Etsy Queue'],
  ['/settings','settings','Settings'],
] as const;

export function AdminShell({children}:{children:ReactNode}) {
  const pathname = usePathname();
  const { token, setToken } = useAdminToken();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><img src={withBasePath('/mssarajo-logo.png')} alt="MsSaraJo Website Insight Studio"/></Link>
      <div className="nav-label">Overview</div>
      <nav>{nav.map(([href,icon,label]) => <Link key={href} href={href} className={pathname===href || (href==='/reports'&&pathname.startsWith('/reports/')) ? 'active':''}><Icon name={icon}/><span>{label}</span></Link>)}</nav>
      <div className="nav-divider"/>
      <div className="nav-label">Audit tiers</div>
      <div className="tier-key"><span className="tier-dot coral">✦</span><div><strong>Homepage Audit</strong><small>Focused clarity</small></div></div>
      <div className="tier-key"><span className="tier-dot green">✦</span><div><strong>Comprehensive</strong><small>Full-site strategy</small></div></div>
      <div className="tier-key"><span className="tier-dot gold">✦</span><div><strong>Competitive Edge</strong><small>Market advantage</small></div></div>
      <div className="sidebar-token">
        <label>Admin access</label>
        <input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Admin token"/>
        <small>Stored only in this browser.</small>
      </div>
    </aside>
    <section className="app-main">
      <header className="topbar"><div/><div className="welcome"><span>WELCOME BACK,</span><strong>Insight Studio</strong><b>IS</b></div></header>
      <div className="content-wrap">{children}</div>
      <footer className="app-footer"><span>© 2026 MsSaraJo Website Insight Studio</span><span>Internal audit workspace</span></footer>
    </section>
  </div>;
}
