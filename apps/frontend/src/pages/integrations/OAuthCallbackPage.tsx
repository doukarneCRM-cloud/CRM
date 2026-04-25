import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { integrationsApi } from '@/services/integrationsApi';
import { apiErrorMessage } from '@/lib/apiError';

/**
 * Runs inside the OAuth popup window. Exchanges the code for tokens,
 * then postMessages the result back to the parent and closes itself.
 */
export default function OAuthCallbackPage() {
  const { t } = useTranslation();
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
      const msg = t('integrations.oauth.missingCode');
      setStatus('error');
      setMessage(msg);
      postResult({ ok: false, error: msg });
      setTimeout(() => window.close(), 1200);
      return;
    }

    const storeId = state.split(':')[0];
    if (!storeId) {
      const msg = t('integrations.oauth.invalidState');
      setStatus('error');
      setMessage(msg);
      postResult({ ok: false, error: msg });
      setTimeout(() => window.close(), 1200);
      return;
    }

    integrationsApi.completeOAuth(storeId, code, state)
      .then(() => {
        setStatus('success');
        setMessage(t('integrations.oauth.storeConnected'));
        postResult({ ok: true, storeId });
        setTimeout(() => window.close(), 800);
      })
      .catch((e: unknown) => {
        const msg = apiErrorMessage(e, t('integrations.oauth.callbackFailed'));
        setStatus('error');
        setMessage(msg);
        postResult({ ok: false, storeId, error: msg });
        setTimeout(() => window.close(), 1500);
      });
  }, [t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
        {status === 'pending' && (
          <>
            <Loader2 size={36} className="animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">{t('integrations.oauth.connecting')}</p>
              <p className="mt-1 text-xs text-gray-400">{t('integrations.oauth.finalizing')}</p>
            </div>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={36} className="text-emerald-500" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">{t('integrations.oauth.connectedTitle')}</p>
              <p className="mt-1 text-xs text-gray-400">{message}</p>
            </div>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={36} className="text-red-500" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">{t('integrations.oauth.connectionFailed')}</p>
              <p className="mt-1 text-xs text-red-600">{message}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
