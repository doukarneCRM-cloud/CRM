import { evolutionProvider } from './evolution';
import { metaProvider } from './meta';
import type { WhatsAppProvider } from './types';

export type {
  WhatsAppProvider,
  NormalizedEvent,
  SendMediaInput,
  SendMediaResult,
  OutboundMediaKind,
} from './types';

// Chosen at boot from WHATSAPP_PROVIDER env. Default = evolution (current
// production). Swap to 'meta' only after Meta Business onboarding is done.
export function getProvider(): WhatsAppProvider {
  const choice = (process.env.WHATSAPP_PROVIDER ?? 'evolution').toLowerCase();
  if (choice === 'meta') return metaProvider;
  return evolutionProvider;
}
