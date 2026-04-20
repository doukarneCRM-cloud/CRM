import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { integrationsApi } from '@/services/integrationsApi';

/**
 * Runs inside the OAuth popup window. Exchanges the code for tokens,
 * then postMessages the result back to the parent and closes itself.
 */
export default function OAuthCallbackPage() {
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error') ?? params.get('error_description');

    const postResult = (payload: Record<string, unknown>) => {
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'youcan-oauth', ...payload }, window.location.origin);
        } catch {
          // ignore
        }
      }
    };

    if (error) {
      setStatus('error');
      setMessage(error);
      postResult({ ok: false, error });
      setTimeout(() => window.close(), 1200);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization code');
      postResult({ ok: false, error: 'Missing authorization code' });
      setTimeout(() => window.close(), 1200);
      return;
    }

    const storeId = state.split(':')[0];
    if (!storeId) {
      setStatus('error');
      setMessage('Invalid state');
      postResult({ ok: false, error: 'Invalid state' });
      setTimeout(() => window.close(), 1200);
      return;
    }

    integrationsApi.completeOAuth(storeId, code, state)
      .then(() => {
        setStatus('success');
        setMessage('Store connected successfully');
        postResult({ ok: true, storeId });
        setTimeout(() => window.close(), 800);
      })
      .catch((e: any) => {
        const msg = e?.response?.data?.error?.message ?? e?.message ?? 'OAuth callback failed';
        setStatus('error');
        setMessage(msg);
        postResult({ ok: false, storeId, error: msg });
        setTimeout(() => window.close(), 1500);
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
        {status === 'pending' && (
          <>
            <Loader2 size={36} className="animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Connecting to YouCan...</p>
              <p className="mt-1 text-xs text-gray-400">Finalizing the connection.</p>
            </div>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={36} className="text-emerald-500" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Connected!</p>
              <p className="mt-1 text-xs text-gray-400">{message}</p>
            </div>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={36} className="text-red-500" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Connection failed</p>
              <p className="mt-1 text-xs text-red-600">{message}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
