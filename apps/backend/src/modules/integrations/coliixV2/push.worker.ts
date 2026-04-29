/**
 * Push worker — CRM → Coliix.
 *
 * Picks up { shipmentId } jobs, calls Coliix `add`, writes back the tracking
 * code. Retry policy comes from Bull (5 attempts, exponential 30s backoff).
 * After the final attempt fails, we flip the shipment to `push_failed` so
 * the UI shows it. The user can retry from the shipment detail.
 */

import { Prisma } from '@prisma/client';
import { coliixV2PushQueue } from '../../../shared/queue';
import { prisma } from '../../../shared/prisma';
import { decryptAccount, pushParcel, ColiixV2Error } from './coliixV2.client';
import { nextPollCadence } from './events.service';
import { emitToAll } from '../../../shared/socket';

coliixV2PushQueue.process(async (job) => {
  const { shipmentId } = job.data;
  const log = console;

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      account: {
        select: { id: true, apiBaseUrl: true, apiKey: true, isActive: true, hubLabel: true },
      },
    },
  });
  if (!shipment) {
    log.warn(`[coliix-v2:push] shipment ${shipmentId} disappeared mid-flight`);
    return { ok: false, reason: 'shipment_not_found' };
  }

  if (shipment.state !== 'pending' && shipment.state !== 'push_failed') {
    // Already pushed or terminal — quietly drop. Possible if a webhook
    // beat us to it (Coliix sometimes confirms before we finish writing).
    log.info(`[coliix-v2:push] skipping ${shipmentId} — state=${shipment.state}`);
    return { ok: true, reason: 'already_pushed' };
  }

  if (!shipment.account.isActive) {
    await markFailed(shipmentId, 'Carrier account is disabled', shipment.pushAttempts);
    return { ok: false, reason: 'account_inactive' };
  }

  const account = decryptAccount({
    apiBaseUrl: shipment.account.apiBaseUrl,
    apiKey: shipment.account.apiKey,
  });

  try {
    const { tracking, raw } = await pushParcel(account, {
      idempotencyKey: shipment.idempotencyKey,
      recipientName: shipment.recipientName,
      recipientPhone: shipment.recipientPhone,
      city: shipment.city,
      address: shipment.address,
      goodsLabel: shipment.goodsLabel,
      goodsQty: shipment.goodsQty,
      cod: Number(shipment.cod),
      driverNote: shipment.note,
    });

    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          trackingCode: tracking,
          state: 'pushed',
          rawState: 'Pushed',
          pushedAt: new Date(),
          lastPushError: null,
          // Schedule a fallback poll in case the webhook is silent.
          nextPollAt: nextPollCadence('pushed'),
        },
      }),
      prisma.shipmentEvent.create({
        data: {
          shipmentId,
          source: 'push',
          rawState: 'Pushed',
          mappedState: 'pushed',
          driverNote: null,
          occurredAt: new Date(),
          payload: raw as Prisma.InputJsonValue,
          dedupeHash: `push:${shipmentId}:${Date.now()}`,
        },
      }),
      // Bridge to legacy Order fields so existing UI logic that gates on
      // labelSent / coliixTrackingId / trackingProvider (call-center filters,
      // edit-modal lock, "label sent" badge) automatically reflects V2 push.
      prisma.order.update({
        where: { id: shipment.orderId },
        data: {
          labelSent: true,
          labelSentAt: new Date(),
          coliixTrackingId: tracking,
          trackingProvider: 'coliix_v2',
          shippingStatus: 'label_created',
        },
      }),
    ]);

    try {
      emitToAll('shipment:updated', {
        shipmentId,
        orderId: shipment.orderId,
        state: 'pushed',
        rawState: 'Pushed',
        trackingCode: tracking,
      });
    } catch {
      /* socket cold-boot, ok to drop */
    }

    return { ok: true, tracking };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const newAttempts = shipment.pushAttempts + 1;
    // Bull will retry up to job.opts.attempts; on the last attempt mark
    // push_failed so the UI shows it. Otherwise leave state=pending so the
    // operator's "in-flight" panel still shows it as "pushing".
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await markFailed(shipmentId, message, newAttempts);
    } else {
      await prisma.shipment.update({
        where: { id: shipmentId },
        data: { pushAttempts: newAttempts, lastPushError: message },
      });
    }
    if (err instanceof ColiixV2Error) {
      log.warn(
        `[coliix-v2:push] ${shipmentId} failed (attempt ${newAttempts}): status=${err.status} ${message}`,
      );
    }
    throw err; // signal failure to Bull so it retries
  }
});

coliixV2PushQueue.on('failed', (job, err) => {
  console.error(
    `[coliix-v2:push] job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`,
    err.message,
  );
});

async function markFailed(shipmentId: string, message: string, attempts: number) {
  // Pull orderId for the legacy bridge so the user can re-click "Send"
  // after a permanent failure.
  const ship = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { orderId: true },
  });
  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        state: 'push_failed',
        lastPushError: message.slice(0, 1000),
        pushAttempts: attempts,
        nextPollAt: null,
      },
    }),
    // Reset the legacy flags so the orders list re-shows the "Send" button.
    ...(ship
      ? [
          prisma.order.update({
            where: { id: ship.orderId },
            data: { labelSent: false, labelSentAt: null, trackingProvider: null },
          }),
        ]
      : []),
  ]);
  try {
    emitToAll('shipment:updated', {
      shipmentId,
      state: 'push_failed',
      lastPushError: message,
    });
  } catch {
    /* */
  }
}
