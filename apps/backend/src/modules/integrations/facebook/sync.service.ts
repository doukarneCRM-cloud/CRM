/**
 * Facebook ad sync — runs hourly per active account.
 *
 * For each call to syncAccount(accountId):
 *   1. Pull yesterday's daily spend → upsert AdSpendDay.
 *   2. Upsert (and create / update) the linked Expense row so the
 *      Money page total stays accurate without manual entry.
 *   3. Refresh the campaigns + adsets list (with cached 7-day spend).
 *   4. If the account has a businessId, refresh the invoice list.
 *   5. Stamp lastSyncAt + clear lastError on success.
 *
 * All writes are idempotent — re-running a sync for the same day
 * updates rows in place via @@unique constraints on (accountId, date)
 * and (accountId, externalId) etc.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import {
  fetchAccountInsights,
  fetchCampaigns,
  fetchAdsets,
  fetchCampaignSpend7d,
  fetchAdsetSpend7d,
  fetchBusinessInvoices,
  type FbBusinessInvoice,
} from './facebook.client';
import { getValidAccessToken } from './accounts.service';

// Format a Date as YYYY-MM-DD in UTC. Coliix's tz vs ours doesn't matter
// here — the operator only cares "the day Facebook billed for", which
// Meta returns labelled in their account_timezone, but the daily insight
// rows themselves carry date_start so we trust those.
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayUtc(): { since: string; until: string } {
  const now = new Date();
  // Pull yesterday's full day. "yesterday" preset would also work, but
  // building it explicitly lets us extend the range to back-fill if a
  // tick was missed.
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const until = since;
  return { since: ymd(since), until: ymd(until) };
}

// ─── Public entry point ─────────────────────────────────────────────────────

export interface SyncResult {
  accountId: string;
  spendDays: number;
  campaigns: number;
  adsets: number;
  invoices: number;
  errors: string[];
}

export async function syncAccount(accountId: string): Promise<SyncResult> {
  const result: SyncResult = {
    accountId,
    spendDays: 0,
    campaigns: 0,
    adsets: 0,
    invoices: 0,
    errors: [],
  };

  const account = await prisma.adAccount.findUnique({
    where: { id: accountId },
    select: { id: true, externalId: true, businessId: true, isActive: true },
  });
  if (!account) {
    result.errors.push('Account not found');
    return result;
  }
  if (!account.isActive) {
    return result; // disabled — nothing to do
  }

  let token: string;
  try {
    token = await getValidAccessToken(accountId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`auth: ${msg}`);
    // getValidAccessToken already wrote lastError on the row
    return result;
  }

  // 1. Daily spend → Expense upsert.
  try {
    const { since, until } = yesterdayUtc();
    const insights = await fetchAccountInsights(token, account.externalId, since, until);
    for (const ins of insights) {
      await upsertSpendDay(accountId, ins.date_start, ins.spend, ins.account_currency ?? 'USD');
      result.spendDays += 1;
    }
  } catch (err) {
    result.errors.push(`insights: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Campaigns + cached 7-day spend.
  try {
    const [campaigns, spend7d] = await Promise.all([
      fetchCampaigns(token, account.externalId),
      fetchCampaignSpend7d(token, account.externalId).catch(() => []),
    ]);
    const spendByCampaign = new Map(spend7d.map((s) => [s.campaign_id, Number(s.spend) || 0]));
    for (const c of campaigns) {
      await prisma.adCampaign.upsert({
        where: { accountId_externalId: { accountId, externalId: c.id } },
        create: {
          accountId,
          externalId: c.id,
          name: c.name,
          status: c.status,
          spendCached: spendByCampaign.get(c.id) ?? 0,
        },
        update: {
          name: c.name,
          status: c.status,
          spendCached: spendByCampaign.get(c.id) ?? 0,
          refreshedAt: new Date(),
        },
      });
      result.campaigns += 1;
    }
  } catch (err) {
    result.errors.push(`campaigns: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Adsets + cached 7-day spend.
  try {
    const [adsets, spend7d] = await Promise.all([
      fetchAdsets(token, account.externalId),
      fetchAdsetSpend7d(token, account.externalId).catch(() => []),
    ]);
    const spendByAdset = new Map(spend7d.map((s) => [s.adset_id, Number(s.spend) || 0]));
    // Adsets are FK'd to campaigns, so we need the campaign row id.
    const campaignRows = await prisma.adCampaign.findMany({
      where: { accountId },
      select: { id: true, externalId: true },
    });
    const campaignIdByExt = new Map(campaignRows.map((c) => [c.externalId, c.id]));
    for (const a of adsets) {
      const campaignDbId = campaignIdByExt.get(a.campaign_id);
      if (!campaignDbId) continue; // campaign not in our DB yet
      await prisma.adAdset.upsert({
        where: { campaignId_externalId: { campaignId: campaignDbId, externalId: a.id } },
        create: {
          campaignId: campaignDbId,
          externalId: a.id,
          name: a.name,
          status: a.status,
          spendCached: spendByAdset.get(a.id) ?? 0,
        },
        update: {
          name: a.name,
          status: a.status,
          spendCached: spendByAdset.get(a.id) ?? 0,
          refreshedAt: new Date(),
        },
      });
      result.adsets += 1;
    }
  } catch (err) {
    result.errors.push(`adsets: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Invoices (only if the account knows its business id).
  if (account.businessId) {
    try {
      const invoices = await fetchBusinessInvoices(token, account.businessId);
      for (const inv of invoices) {
        await upsertInvoice(accountId, inv);
        result.invoices += 1;
      }
    } catch (err) {
      // Invoice access is fragile (requires business admin role). Don't
      // count it as a hard sync failure.
      result.errors.push(`invoices: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await prisma.adAccount.update({
    where: { id: accountId },
    data: {
      lastSyncAt: new Date(),
      lastError: result.errors.length === 0 ? null : result.errors.join(' | ').slice(0, 500),
    },
  });

  return result;
}

// ─── Spend day → Expense upsert ─────────────────────────────────────────────

async function upsertSpendDay(
  accountId: string,
  dateIso: string,
  spendStr: string,
  currency: string,
): Promise<void> {
  const spend = new Prisma.Decimal(spendStr || '0');
  if (spend.lte(0)) {
    // No spend on this day. Don't create empty Expense rows that pollute
    // the Money page — but DO upsert the AdSpendDay row so the operator
    // sees a 0 in the daily chart instead of a hole.
    await prisma.adSpendDay.upsert({
      where: { accountId_date: { accountId, date: new Date(dateIso) } },
      create: { accountId, date: new Date(dateIso), spend, currency },
      update: { spend, currency },
    });
    return;
  }

  // Need the account's name for the Expense description. Cached because
  // we already fetched the row at the top of syncAccount, but a fresh
  // read here keeps this helper self-contained.
  const acct = await prisma.adAccount.findUnique({
    where: { id: accountId },
    select: { name: true },
  });
  const description = `Facebook Ads · ${acct?.name ?? accountId} · ${dateIso}`;

  const existing = await prisma.adSpendDay.findUnique({
    where: { accountId_date: { accountId, date: new Date(dateIso) } },
    select: { id: true, expenseId: true },
  });

  if (existing?.expenseId) {
    // Update both rows together.
    await prisma.$transaction([
      prisma.expense.update({
        where: { id: existing.expenseId },
        data: { amount: spend, description, date: new Date(dateIso) },
      }),
      prisma.adSpendDay.update({
        where: { id: existing.id },
        data: { spend, currency },
      }),
    ]);
    return;
  }

  // Create both atomically. Expense row first so AdSpendDay.expenseId
  // can reference it.
  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        description,
        amount: spend,
        date: new Date(dateIso),
        source: 'facebook',
      },
    });
    await tx.adSpendDay.upsert({
      where: { accountId_date: { accountId, date: new Date(dateIso) } },
      create: {
        accountId,
        date: new Date(dateIso),
        spend,
        currency,
        expenseId: expense.id,
      },
      update: {
        spend,
        currency,
        expenseId: expense.id,
      },
    });
  });
}

// ─── Invoice upsert ─────────────────────────────────────────────────────────

async function upsertInvoice(accountId: string, inv: FbBusinessInvoice): Promise<void> {
  // Meta returns billing_period as "YYYY-MM"; expand to full month range.
  const [yearStr, monthStr] = (inv.billing_period ?? '').split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || 1;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0)); // last day of month

  await prisma.adInvoice.upsert({
    where: { accountId_externalId: { accountId, externalId: inv.id } },
    create: {
      accountId,
      externalId: inv.id,
      periodStart,
      periodEnd,
      amount: new Prisma.Decimal(inv.amount_due?.amount ?? '0'),
      currency: inv.amount_due?.currency ?? 'USD',
      status: (inv.payment_status ?? 'pending').toUpperCase(),
      pdfUrl: inv.download_uri ?? null,
    },
    update: {
      periodStart,
      periodEnd,
      amount: new Prisma.Decimal(inv.amount_due?.amount ?? '0'),
      currency: inv.amount_due?.currency ?? 'USD',
      status: (inv.payment_status ?? 'pending').toUpperCase(),
      pdfUrl: inv.download_uri ?? null,
    },
  });
}
