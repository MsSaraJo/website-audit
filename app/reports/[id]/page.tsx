'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '@/components/AdminShell';
import { Frame, Sparkle } from '@/components/Frame';
import { ScoreArc } from '@/components/ScoreArc';
import { SectionTitle } from '@/components/SectionTitle';
import { useAdminToken } from '@/components/useAdminToken';
import type { AuditResult } from '@/components/types';

export default function ReportDetail(){const {id}=useParams<{id:string}>();const {token}=useAdminToken();const [audit,setAudit]=useState<AuditResult|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!token||!id)return;fetch(`/api/audits/${id}`,{headers:{authorization:`Bearer ${token}`}}).then(async r=>setAudit(r.ok?await r.json():{id,status:'error',error:'Could not load audit.'}))},[id,token]);
 async function download(){setBusy(true);try{const r=await fetch(`/api/audits/${id}/report`,{headers:{authorization:`Bearer ${token}`}});if(!r.ok)throw new Error();const blob=await r.blob();const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=`MsSaraJo-${audit?.etsyReceiptId??id}.pdf`;a.click();URL.revokeObjectURL(href)}finally{setBusy(false)}}
 return <AdminShell><SectionTitle eyebrow="REPORT DETAIL" title={audit?.product ?? 'Website Review'} script="Review, download, deliver." body="A single record for the report status, score, source, and finished PDF."/>{!audit?<p className="muted">Loading report…</p>:<div className="detail-grid"><Frame tone="gold" className="detail-score"><ScoreArc score={audit.score} label="overall score"/><div><span className="mini-label">STATUS</span><h2>{audit.status.replaceAll('_',' ')}</h2><p>Source: {audit.source??'—'}{audit.etsyReceiptId?` · Etsy receipt ${audit.etsyReceiptId}`:''}</p></div></Frame><Frame tone="coral" className="detail-actions"><div className="frame-title"><Sparkle/> REPORT ACTIONS</div>{audit.error&&<p className="error-copy">{audit.error}</p>}<button className="primary-btn" onClick={download} disabled={!audit.reportDownloadUrl||busy}>{busy?'Preparing…':'Download PDF →'}</button>{audit.reportUrl&&<a className="secondary-btn" href={audit.reportUrl} target="_blank">Open hosted PDF ↗</a>}</Frame></div>}</AdminShell>}
