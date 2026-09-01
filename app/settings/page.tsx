'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Frame, Sparkle } from '@/components/Frame';
import { SectionTitle } from '@/components/SectionTitle';
import { useAdminToken } from '@/components/useAdminToken';
import { withBasePath } from '@/lib/app-paths';

type EtsyStatus = {
  appConfigured: boolean;
  connected: boolean;
  connectionSource: 'oauth' | 'environment' | null;
  userId: string | null;
  accessExpiresAt: string | null;
  updatedAt: string | null;
  callbackUrl: string;
  scopes: string[];
};

export default function Settings() {
  const { token, setToken } = useAdminToken();
  const [etsy, setEtsy] = useState<EtsyStatus | null>(null);
  const [etsyBusy, setEtsyBusy] = useState(false);
  const [etsyError, setEtsyError] = useState('');
  const [etsyNotice, setEtsyNotice] = useState('');

  async function loadEtsyStatus() {
    if (!token) return;
    setEtsyError('');
    try {
      const response = await fetch(withBasePath('/api/etsy/oauth/status'), {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Could not load Etsy connection status');
      setEtsy(json);
    } catch (error) {
      setEtsyError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    loadEtsyStatus();
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('etsy') === 'connected') {
      setEtsyNotice('Etsy is connected. Order webhooks can now use the authorized shop connection.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('etsy') === 'error') {
      setEtsyError(params.get('message') || 'Etsy authorization was not completed.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function connectEtsy() {
    if (!token) {
      setEtsyError('Enter your Admin Token first, then connect Etsy.');
      return;
    }
    setEtsyBusy(true);
    setEtsyError('');
    setEtsyNotice('');
    try {
      const response = await fetch(withBasePath('/api/etsy/oauth/start'), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Could not start Etsy authorization');
      window.location.assign(json.authorizeUrl);
    } catch (error) {
      setEtsyError(error instanceof Error ? error.message : String(error));
      setEtsyBusy(false);
    }
  }

  return (
    <AdminShell>
      <SectionTitle
        eyebrow="STUDIO SETTINGS"
        title="Workspace Settings"
        script="Quiet controls, clear boundaries."
        body="Manage browser-local admin access, Etsy authorization, and the internal workspace without exposing client-facing credentials."
      />
      <div className="settings-grid">
        <Frame tone="coral" className="settings-card">
          <div className="frame-title"><Sparkle /> ADMIN TOKEN</div>
          <p>The internal API uses this token to authorize audit and report actions.</p>
          <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Admin token" />
          <small>Stored in this browser only.</small>
        </Frame>

        <Frame tone="green" className="settings-card etsy-connect-card">
          <div className="frame-title"><Sparkle /> ETSY CONNECTION</div>
          <div className={`integration-status ${etsy?.connected ? 'connected' : ''}`}>
            <span className="integration-dot" />
            <div>
              <strong>{etsy?.connected ? 'Connected' : 'Not connected'}</strong>
              <small>
                {etsy?.connected
                  ? `Authorized${etsy.userId ? ` as Etsy user ${etsy.userId}` : ''}`
                  : 'Authorize your Etsy shop so paid-order webhooks can retrieve receipt details.'}
              </small>
            </div>
          </div>

          {etsyNotice ? <p className="settings-notice">{etsyNotice}</p> : null}
          {etsyError ? <p className="error-copy">{etsyError}</p> : null}

          <button className="primary-btn" type="button" onClick={connectEtsy} disabled={etsyBusy || !etsy?.appConfigured}>
            {etsyBusy ? 'Opening Etsy…' : etsy?.connected ? 'Reconnect Etsy' : 'Connect Etsy'}
          </button>

          {!etsy?.appConfigured ? (
            <small>Set ETSY_KEYSTRING and ETSY_SHARED_SECRET on the server before connecting.</small>
          ) : (
            <div className="integration-meta">
              <span><b>Scope</b> {etsy.scopes.join(', ')}</span>
              <span><b>Callback</b> {etsy.callbackUrl}</span>
              {etsy.updatedAt ? <span><b>Last authorized</b> {new Date(etsy.updatedAt).toLocaleString()}</span> : null}
            </div>
          )}
          <small className="etsy-trademark">The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</small>
        </Frame>

        <Frame tone="gold" className="settings-card">
          <div className="frame-title"><Sparkle /> BRAND SYSTEM</div>
          <p>This interface intentionally mirrors the report family: warm ivory, navy editorial type, terracotta, emerald, gold, score arcs, sparkles, and quarter-notch frames.</p>
          <span className="brand-lock">MsSaraJo Website Insight Studio</span>
        </Frame>
      </div>
    </AdminShell>
  );
}
