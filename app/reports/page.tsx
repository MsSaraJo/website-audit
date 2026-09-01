'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Frame, Sparkle } from '@/components/Frame';
import { SectionTitle } from '@/components/SectionTitle';
import { useAdminToken } from '@/components/useAdminToken';
import { withBasePath } from '@/lib/app-paths';
import type { AuditSummary } from '@/components/types';

function domain(url:string){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url}}
const tierLabel=(t:string)=>t==='quick_win'?'Homepage Audit':t==='full_site'?'Comprehensive':'Competitive Edge';
export default function Reports(){const {token}=useAdminToken();const [audits,setAudits]=useState<AuditSummary[]>([]);const [q,setQ]=useState('');const [filter,setFilter]=useState('all');const [loading,setLoading]=useState(false);
 useEffect(()=>{if(!token)return;setLoading(true);fetch(withBasePath('/api/audits'),{headers:{authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>setAudits(j.audits??[])).finally(()=>setLoading(false))},[token]);
 const reports=useMemo(()=>audits.filter(a=>a.hasReport&&(filter==='all'||a.tier===filter)&&(!q||domain(a.targetUrl).toLowerCase().includes(q.toLowerCase()))),[audits,q,filter]);const featured=reports[0];
 return <AdminShell><div className="reports-head"><SectionTitle eyebrow="REPORT ARCHIVE" title="Your Reports Library" script="Polished work, all in one place." body="Search completed website reviews, open a report record, or jump straight to the PDF."/><div className="report-search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search reports or domains…"/></div></div>
 <div className="filter-row">{[['all','All Reports'],['quick_win','Homepage Audit'],['full_site','Comprehensive'],['competitor_conquest','Competitive Edge']].map(([v,l])=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{l}</button>)}</div>
 {loading?<p className="muted">Loading report library…</p>:!reports.length?<Frame tone="coral" className="empty-state"><Sparkle/><h2>No reports found</h2><p>Run an audit or adjust the current filters.</p><Link className="text-link" href="/audits/new">Start a new audit →</Link></Frame>:<div className="library-layout"><div className="report-card-grid">{reports.slice(0,8).map(a=><Frame tone={a.tier==='quick_win'?'coral':a.tier==='full_site'?'green':'gold'} key={a.id} className="report-card"><span className="mini-label">{tierLabel(a.tier)}</span><h2>{domain(a.targetUrl)}</h2><p>{new Date(a.createdAt).toLocaleDateString()}</p><div className="report-score"><b>{a.score??'—'}</b><span>✦</span></div><small>{a.status.replaceAll('_',' ')}</small><Link className="text-link" href={`/reports/${a.id}`}>View report →</Link></Frame>)}</div>{featured&&<Frame tone="gold" className="featured-report"><div className="frame-title"><Sparkle/> FEATURED REPORT</div><img src={withBasePath('/mssarajo-logo.png')} alt="MsSaraJo"/><span className="mini-label">{tierLabel(featured.tier)}</span><h2>{domain(featured.targetUrl)}<br/>Website Review</h2><p>A client-ready report from the MsSaraJo Website Insight Studio.</p><div className="featured-score"><b>{featured.score??'—'}</b><small>OVERALL SCORE</small></div><Link className="text-link" href={`/reports/${featured.id}`}>View full report →</Link></Frame>}</div>}
 </AdminShell>}
