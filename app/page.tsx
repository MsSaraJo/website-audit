'use client';
import { FormEvent, useEffect, useState } from 'react';

type Result = {
  id: string;
  status: string;
  score?: number | null;
  reportUrl?: string | null;
  reportDownloadUrl?: string | null;
  error?: string | null;
};

type QueueAudit = {
  id: string;
  status: string;
  tier: string;
  product: string;
  targetUrl: string;
  createdAt: string;
  etsyReceiptId?: string | null;
  etsyListingTitle?: string | null;
  etsySku?: string | null;
  score?: number | null;
  hasReport: boolean;
};

const PRODUCTS = [
  { value: 'quick_win', label: 'Quick Win Website Audit — $49' },
  { value: 'full_site', label: 'Full Website SEO & UX Audit — $99' },
  { value: 'competitor_conquest', label: 'Website + Competitor Audit — $179' },
];

export default function Home() {
  const [token,setToken]=useState('');
  const [url,setUrl]=useState('');
  const [tier,setTier]=useState('quick_win');
  const [competitors,setCompetitors]=useState('');
  const [result,setResult]=useState<Result|null>(null);
  const [queue,setQueue]=useState<QueueAudit[]>([]);
  const [busy,setBusy]=useState(false);
  const [queueBusy,setQueueBusy]=useState(false);

  async function submit(e: FormEvent){
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const r=await fetch('/api/audits',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({url,tier,competitorUrls:competitors.split('\n').map(x=>x.trim()).filter(Boolean)})});
      const text=await r.text();
      let j: any = {};
      if(text){
        try { j=JSON.parse(text); } catch { j={error:text}; }
      }
      setBusy(false);
      if(!r.ok){setResult({id:'',status:'error',error:j.error || `Request failed with HTTP ${r.status}${text?'':'. The server returned an empty response; check the terminal for the server-side error.'}`});return;}
      setResult(j);
    } catch (error) {
      setBusy(false);
      setResult({id:'',status:'error',error:error instanceof Error ? error.message : 'Could not start audit.'});
    }
  }

  async function loadQueue(){
    if(!token) return;
    setQueueBusy(true);
    const r=await fetch('/api/audits?status=awaiting_etsy_upload',{headers:{authorization:`Bearer ${token}`}});
    const j=await r.json();
    setQueueBusy(false);
    if(r.ok) setQueue(j.audits ?? []);
  }

  async function downloadReport(audit: QueueAudit){
    const r=await fetch(`/api/audits/${audit.id}/report`,{headers:{authorization:`Bearer ${token}`}});
    if(!r.ok){ alert('Could not download report.'); return; }
    const blob=await r.blob();
    const href=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=href; a.download=`MsSaraJo-${audit.etsyReceiptId ?? audit.id}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
  }

  async function markUploaded(audit: QueueAudit){
    const r=await fetch(`/api/audits/${audit.id}/etsy-complete`,{method:'POST',headers:{authorization:`Bearer ${token}`}});
    if(r.ok) await loadQueue(); else alert((await r.json()).error ?? 'Could not update audit.');
  }

  useEffect(()=>{
    if(!result?.id || ['completed','awaiting_etsy_upload','failed'].includes(result.status)) return;
    const t=setInterval(async()=>{
      const r=await fetch(`/api/audits/${result.id}`,{headers:{authorization:`Bearer ${token}`}});
      if(r.ok)setResult(await r.json());
    },3000);
    return()=>clearInterval(t);
  },[result?.id,result?.status,token]);

  return <main>
    <section className="hero">
      <span className="eyebrow">MsSaraJo audit operations</span>
      <h1>Website SEO & UX Audit Engine</h1>
      <p>Three Etsy offerings feed the same secure audit pipeline. Etsy reports stop in a ready-for-upload queue so the finished PDF can be attached to the buyer's made-to-order digital order before it is marked complete.</p>
    </section>

    <section className="card">
      <h2>Manual test audit</h2>
      <form onSubmit={submit}>
        <label>Admin token<input type="password" value={token} onChange={e=>setToken(e.target.value)} required/></label>
        <label>Website URL<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" required/></label>
        <label>Audit offering<select value={tier} onChange={e=>setTier(e.target.value)}>{PRODUCTS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
        {tier==='competitor_conquest'&&<label>Competitor URLs, one per line<textarea value={competitors} onChange={e=>setCompetitors(e.target.value)} rows={4}/></label>}
        <button disabled={busy}>{busy?'Starting…':'Run audit'}</button>
      </form>
      {result&&<div className={`status ${result.status}`}><strong>{result.status.replaceAll('_',' ')}</strong>{result.score!=null&&<span>Score: {result.score}/100</span>}{result.error&&<span>{result.error}</span>}{result.reportUrl&&<a href={result.reportUrl} target="_blank">Open PDF report</a>}</div>}
    </section>

    <section className="card queue-card">
      <div className="section-head"><div><h2>Etsy reports ready for upload</h2><p>Download the PDF, open the matching order in Etsy Shop Manager, choose Complete order, upload the PDF, then confirm it here.</p></div><button type="button" onClick={loadQueue} disabled={!token||queueBusy}>{queueBusy?'Refreshing…':'Refresh queue'}</button></div>
      {!queue.length?<p className="muted">No reports loaded. Enter your admin token above and refresh the queue.</p>:<div className="queue-list">{queue.map(a=><article className="queue-item" key={a.id}>
        <div><span className="queue-product">{a.product}</span><strong>{a.targetUrl}</strong><span>Receipt {a.etsyReceiptId ?? '—'} · {a.etsySku ?? a.tier}{a.score!=null?` · Score ${a.score}/100`:''}</span></div>
        <div className="queue-actions"><button type="button" onClick={()=>downloadReport(a)}>Download PDF</button><button type="button" className="secondary" onClick={()=>markUploaded(a)}>I uploaded it to Etsy</button></div>
      </article>)}</div>}
    </section>

    <footer>The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.</footer>
  </main>;
}
