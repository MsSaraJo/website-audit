'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '@/components/AdminShell';
import { Frame, Sparkle } from '@/components/Frame';
import { ScoreArc } from '@/components/ScoreArc';
import { SectionTitle } from '@/components/SectionTitle';
import { useAdminToken } from '@/components/useAdminToken';
import { withBasePath } from '@/lib/app-paths';
import type { AuditResult } from '@/components/types';

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // The response may not be JSON; fall back to a useful status message.
  }
  return `${fallback} (${response.status})`;
}

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAdminToken();
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !id) return;

    let cancelled = false;
    setAudit(null);
    setLoadError(null);

    async function loadAudit() {
      try {
        const response = await fetch(withBasePath(`/api/audits/${encodeURIComponent(id)}`), {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(await responseError(response, 'Could not load audit'));
        }

        const result = (await response.json()) as AuditResult;
        if (!cancelled) setAudit(result);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load audit.');
        }
      }
    }

    void loadAudit();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  async function download() {
    if (!id || !token) return;
    setBusy(true);
    setLoadError(null);

    try {
      const response = await fetch(withBasePath(`/api/audits/${encodeURIComponent(id)}/report`), {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(await responseError(response, 'Could not download report'));
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `MsSaraJo-${audit?.etsyReceiptId ?? id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not download report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <SectionTitle
        eyebrow="REPORT DETAIL"
        title={audit?.product ?? 'Website Review'}
        script="Review, download, deliver."
        body="A single record for the report status, score, source, and finished PDF."
      />

      {loadError && !audit ? (
        <Frame tone="coral" className="empty-state">
          <Sparkle />
          <h2>Could not load this audit</h2>
          <p className="error-copy">{loadError}</p>
        </Frame>
      ) : !audit ? (
        <p className="muted">Loading report...</p>
      ) : (
        <div className="detail-grid">
          <Frame tone="gold" className="detail-score">
            <ScoreArc score={audit.score} label="overall score" />
            <div>
              <span className="mini-label">STATUS</span>
              <h2>{audit.status.replaceAll('_', ' ')}</h2>
              <p>
                Source: {audit.source ?? '-'}
                {audit.etsyReceiptId ? ` · Etsy receipt ${audit.etsyReceiptId}` : ''}
              </p>
            </div>
          </Frame>

          <Frame tone="coral" className="detail-actions">
            <div className="frame-title"><Sparkle /> REPORT ACTIONS</div>
            {audit.error && <p className="error-copy">{audit.error}</p>}
            {loadError && <p className="error-copy">{loadError}</p>}
            <button
              className="primary-btn"
              onClick={download}
              disabled={!audit.reportDownloadUrl || busy}
            >
              {busy ? 'Preparing...' : 'Download PDF →'}
            </button>
            {audit.reportUrl && (
              <a className="secondary-btn" href={audit.reportUrl} target="_blank" rel="noreferrer">
                Open hosted PDF ↗
              </a>
            )}
          </Frame>
        </div>
      )}
    </AdminShell>
  );
}
