'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/AdminShell';
import { Frame, Sparkle } from '@/components/Frame';
import { SectionTitle } from '@/components/SectionTitle';
import { useAdminToken } from '@/components/useAdminToken';
import { withBasePath } from '@/lib/app-paths';
import type { AuditResult } from '@/components/types';

const products=[
 {value:'quick_win',title:'Homepage Audit',sub:'Focused SEO, UX & conversion clarity.',tone:'coral'},
 {value:'full_site',title:'Comprehensive',sub:'A strategic review of up to five priority pages.',tone:'green'},
 {value:'competitor_conquest',title:'Competitive Edge',sub:'Market context, white space, and a 90-day plan.',tone:'gold'},
];
export default function NewAudit(){
 const {token}=useAdminToken(); const [url,setUrl]=useState(''); const [tier,setTier]=useState('quick_win'); const [competitors,setCompetitors]=useState(''); const [result,setResult]=useState<AuditResult|null>(null); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setResult(null);try{const r=await fetch(withBasePath('/api/audits'),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({url,tier,competitorUrls:competitors.split('\n').map(x=>x.trim()).filter(Boolean)})});const j=await r.json();setResult(r.ok?j:{id:'',status:'error',error:j.error||'Could not start audit.'});}catch(e){setResult({id:'',status:'error',error:e instanceof Error?e.message:'Could not start audit.'});}finally{setBusy(false)}}
 useEffect(()=>{if(!result?.id||['completed','awaiting_etsy_upload','failed'].includes(result.status))return;const t=setInterval(async()=>{const r=await fetch(withBasePath(`/api/audits/${result.id}`),{headers:{authorization:`Bearer ${token}`}});if(r.ok)setResult(await r.json())},3000);return()=>clearInterval(t)},[result?.id,result?.status,token]);
 return <AdminShell><div className="new-audit-layout"><div><SectionTitle eyebrow="NEW REVIEW" title="Begin a New Website Review" script="From URL to polished insight." body="Choose the report tier, enter the website, and let the audit pipeline prepare a client-ready PDF in the MsSaraJo report system."/>
 <form onSubmit={submit} className="audit-form">
  <Frame tone="coral" className="form-frame"><div className="frame-title"><Sparkle/> ENTER WEBSITE URL</div><p>We’ll analyze the site and prepare a tailored report you can trust and share.</p><input className="url-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.sampleclient.com" required/><small>Use the public website URL you want the report to evaluate.</small></Frame>
  <div className="field-label">CHOOSE YOUR REPORT TIER</div><div className="tier-grid">{products.map(p=><button type="button" key={p.value} onClick={()=>setTier(p.value)} className={`tier-choice tone-${p.tone} ${tier===p.value?'selected':''}`}><span>✦</span><strong>{p.title}</strong><small>{p.sub}</small><i/></button>)}</div>
  {tier==='competitor_conquest'&&<Frame tone="gold" className="form-frame"><div className="frame-title"><Sparkle/> COMPETITOR URLS</div><p>Add up to three competitor websites, one per line.</p><textarea value={competitors} onChange={e=>setCompetitors(e.target.value)} rows={5} placeholder={'https://competitor-one.com\nhttps://competitor-two.com'}/></Frame>}
  <button className="primary-btn" disabled={busy||!token}>{busy?'Starting audit…':'Start Audit →'}</button>{!token&&<p className="form-note">Enter your admin token in the left sidebar first.</p>}
  {result&&<div className={`run-status ${result.status}`}><strong>{result.status.replaceAll('_',' ')}</strong>{result.pipelineStage&&<span>{result.pipelineStage.replaceAll('_',' ')}</span>}{result.score!=null&&<span>Score {result.score}/100</span>}{result.error&&<span>{result.error}</span>}{result.id&&<Link href={`/reports/${result.id}`}>Open audit record →</Link>}</div>}
 </form></div>
 <aside className="new-audit-preview"><span className="field-label">REPORT EXPERIENCE</span><Frame tone="gold" className="preview-card"><img src={withBasePath('/mssarajo-logo.png')} alt="MsSaraJo"/><small>PERSONALIZED WEBSITE REVIEW</small><h3>{tier==='quick_win'?'Homepage SEO, UX & Conversion Audit':tier==='full_site'?'Comprehensive Website Audit':'Competitive Edge Website Audit'}</h3><div className="preview-score">78 <span>✦</span></div><p>Same brand system from dashboard to finished PDF.</p></Frame><Frame tone="green" className="receive-card"><div className="frame-title"><Sparkle/> WHAT YOU’LL RECEIVE</div><ul><li><b>Executive Summary</b><span>Clear context at a glance.</span></li><li><b>Score Highlights</b><span>Visual performance signals.</span></li><li><b>Prioritized Actions</b><span>What to do next and why.</span></li><li><b>Polished PDF Report</b><span>Branded and client-ready.</span></li></ul></Frame></aside></div></AdminShell>;
}
