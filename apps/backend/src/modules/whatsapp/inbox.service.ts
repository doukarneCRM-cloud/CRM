import type { NormalizedEvent } from './provider';

// Inbox plumbing — extended in Phase 3 with WhatsAppThread/WhatsAppMessage
// models. For now we accept inbound events and swallow them so the Phase 1
// refactor doesn't change runtime behavior.

type InboundEvent = Extract<NormalizedEvent, { type: 'inbound_message' }>;

export async function handleInboundMessage(_event: InboundEvent): Promise<void> {
  // No-op until Phase 3 migration lands the thread/message tables.
  return;
}
