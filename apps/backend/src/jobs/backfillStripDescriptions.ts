/**
 * One-shot startup backfill: strip HTML from every existing product
 * description so the text matches the format new YouCan imports now use.
 *
 * Runs automatically the first time the server boots after this code lands,
 * then writes a sentinel into `Setting` so subsequent boots skip the work.
 * Idempotent and safe to leave wired forever — every read of the sentinel
 * short-circuits in O(1).
 *
 * Why a Setting flag and not a migration: the change is data-only (no
 * schema), and tying it to migration ordering would couple deployment of
 * the backend image to a Prisma migration step the ops team doesn't
 * otherwise need. The flag also makes the operation visible in the DB
 * without grepping migration history.
 */

import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '../shared/prisma';
import { stripHtml } from '../utils/stripHtml';

const SENTINEL_KEY = 'backfill.descriptionsHtmlStripped';

export async function backfillStripDescriptionsOnce(log: FastifyBaseLogger): Promise<void> {
  const sentinel = await prisma.setting.findUnique({ where: { key: SENTINEL_KEY } });
  if (sentinel?.value === 'true') {
    return;
  }

  const products = await prisma.product.findMany({
    where: { description: { not: null } },
    select: { id: true, description: true },
  });

  let scanned = 0;
  let changed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const p of products) {
    scanned += 1;
    const before = p.description ?? '';
    // Cheap pre-filter — descriptions with no markup at all skip the
    // strip+write round trip. Catches the (large) chunk of catalog where
    // owners typed plain text directly into the YouCan editor.
    if (!/[<&]/.test(before)) {
      unchanged += 1;
      continue;
    }
    const after = stripHtml(before);
    if (after === before) {
      unchanged += 1;
      continue;
    }
    try {
      await prisma.product.update({
        where: { id: p.id },
        data: { description: after.length > 0 ? after : null },
      });
      changed += 1;
    } catch (err) {
      failed += 1;
      log.warn({ err, productId: p.id }, '[backfill] strip-html failed for product');
    }
  }

  // Persist the sentinel even on partial failure — re-running would only
  // retry the same rows that already failed once, and we'd rather surface
  // the failures via the warning log than re-scan the entire catalog on
  // every boot. If the failures were transient, an admin can clear the
  // sentinel manually and the next boot reruns.
  await prisma.setting.upsert({
    where: { key: SENTINEL_KEY },
    update: { value: 'true' },
    create: { key: SENTINEL_KEY, value: 'true' },
  });

  log.info(
    { scanned, changed, unchanged, failed },
    `[backfill] stripped HTML from product descriptions`,
  );
}
