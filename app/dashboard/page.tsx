'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Frame, Sparkle } from '@/components/Frame';
import { ScoreArc } from '@/components/ScoreArc';
import { SectionTitle } from '@/components/SectionTitle';
import { useAdminToken } from '@/components/useAdminToken';
import { withBasePath } from '@/lib/app-paths';
import type { AuditSummary } from '@/components/types';

function prettyTier(tier:string){ return tier==='quick_win'?'Homepage Audit':tier==='full_site'?'Comprehensive':'Competitive Edge'; }
function domain(url:string){ try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url} }

export default function Dashboard(){
 const {token}=useAdminToken(); const [audits,setAudits]=useState<AuditSummary[]>([]); const [loading,setLoading]=useState(false);
 useEffect(()=>{ if(!token)return; setLoading(true); fetch(withBasePath('/api/audits'),{headers:{authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>setAudits(j.audits??[])).finally(()=>setLoading(false)); },[token]);
 const completed=useMemo(()=>audits.filter(a=>a.hasReport),[audits]); const featured=completed[0]; const avg=Math.round(completed.filter(a=>a.score!=null).reduce((s,a)=>s+(a.score??0),0)/Math.max(1,completed.filter(a=>a.score!=null).length));
 const queue=audits.filter(a=>a.status==='awaiting_etsy_upload').length;
 return <AdminShell><SectionTitle eyebrow="INSIGHT STUDIO" title="Your Website Insight Dashboard" script="Clear insights. Confident next steps." body="A calm command center for running audits, reviewing reports, and moving Etsy orders from analysis to delivery."/>
 <div className="dashboard-grid">
   <Frame className="hero-score" tone="gold"><ScoreArc score={featured?.score ?? avg} label="latest website score" tone="navy"/><div><span className="mini-label">LATEST RESULT</span><h2>{featured?domain(featured.targetUrl):'Ready for your next audit'}</h2><p>{featured?'Your newest completed report is ready to review, download, or use as a reference for the next client.':'Start a new audit to populate your dashboard with live report data.'}</p>{featured?<Link className="text-link" href={`/reports/${featured.id}`}>View full report →</Link>:<Link className="text-link" href="/audits/new">Begin a new audit →</Link>}</div></Frame>
   <Frame className="summary-card" tone="coral"><div className="frame-title"><Sparkle/> EXECUTIVE SUMMARY</div><p>{completed.length?`You have ${completed.length} completed report${completed.length===1?'':'s'} in the studio. ${queue?`${queue} Etsy order${queue===1?' is':'s are'} waiting for upload confirmation.`:'No Etsy reports are currently waiting for upload.'} The average available audit score is ${avg || '—'}.`:'This workspace will surface a concise operational snapshot once audits are completed.'}</p><Link className="text-link" href="/reports">Browse report library →</Link></Frame>
   <Frame className="opportunity-card" tone="gold"><div className="frame-title">TOP OPERATIONS</div><div className="ops-list"><Link href="/audits/new"><b>01</b><span><strong>Run a new audit</strong><small>Homepage, Comprehensive, or Competitive Edge.</small></span><i>›</i></Link><Link href="/queue"><b>02</b><span><strong>Check Etsy delivery queue</strong><small>{queue?`${queue} report${queue===1?'':'s'} currently waiting.`:'Nothing waiting right now.'}</small></span><i>›</i></Link><Link href="/reports"><b>03</b><span><strong>Review recent reports</strong><small>Open, download, and compare completed work.</small></span><i>›</i></Link></div></Frame>
   <Frame className="recent-card" tone="green"><div className="frame-title">RECENT REPORTS</div>{loading?<p className="muted">Loading reports…</p>:!completed.length?<p className="muted">No completed reports yet.</p>:<div className="recent-list">{completed.slice(0,3).map(a=><Link href={`/reports/${a.id}`} key={a.id}><span className={`report-gem ${a.tier}`}>✦</span><div><strong>{domain(a.targetUrl)}</strong><small>{prettyTier(a.tier)} · {new Date(a.createdAt).toLocaleDateString()}</small></div><b>{a.score??'—'}</b></Link>)}</div>}</Frame>
   <Frame className="glance-card" tone="coral"><div className="frame-title">STUDIO AT A GLANCE</div><div className="glance-stats"><div><b>{completed.length}</b><small>Completed reports</small></div><div><b>{queue}</b><small>Etsy queue</small></div><div><b>{avg || '—'}</b><small>Average score</small></div><div><b>{audits.filter(a=>a.status==='failed').length}</b><small>Needs attention</small></div></div></Frame>
 </div></AdminShell>;
}
