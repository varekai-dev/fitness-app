import type { Env } from './index';

/**
 * Free plan limits (developers.cloudflare.com: workers/platform/pricing,
 * d1/platform/pricing, r2/pricing). Daily ones reset at 00:00 UTC; all are
 * per account, so other Workers, databases and buckets count too.
 */
export const FREE_LIMITS = {
  workerRequestsPerDay: 100_000,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  d1StorageBytes: 5 * 1e9,
  r2StorageBytes: 10 * 1e9,
  r2ClassAPerMonth: 1_000_000,
  r2ClassBPerMonth: 10_000_000,
};

// From r2/pricing; everything else (DeleteObject and the like) is free.
const R2_CLASS_A = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
]);
const R2_CLASS_B = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);

const QUERY = `query Usage($account: string!, $dayStart: Time!, $monthStart: Time!, $now: Time!,
  $today: Date!, $yesterday: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workers: workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $dayStart, datetime_leq: $now }) {
        sum { requests errors }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 1, filter: { date_geq: $today, date_leq: $today }) {
        sum { rowsRead rowsWritten }
      }
      d1Storage: d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $yesterday, date_leq: $today }) {
        max { databaseSizeBytes }
        dimensions { databaseId }
      }
      r2Ops: r2OperationsAdaptiveGroups(limit: 100, filter: { datetime_geq: $monthStart, datetime_leq: $now }) {
        sum { requests }
        dimensions { actionType }
      }
      r2Storage: r2StorageAdaptiveGroups(limit: 100, filter: { datetime_geq: $dayStart, datetime_leq: $now }) {
        max { payloadSize metadataSize objectCount }
        dimensions { bucketName }
      }
    }
  }
}`;

type Account = {
  workers: { sum: { requests: number; errors: number } }[];
  d1: { sum: { rowsRead: number; rowsWritten: number } }[];
  d1Storage: { max: { databaseSizeBytes: number } }[];
  r2Ops: { sum: { requests: number }; dimensions: { actionType: string } }[];
  r2Storage: { max: { payloadSize: number; metadataSize: number; objectCount: number } }[];
};

/**
 * The account's usage against the free plan, from the GraphQL Analytics API:
 * today's (UTC) Worker requests and D1 rows, this month's R2 operations, and
 * storage now. Needs CF_ACCOUNT_ID and a CF_API_TOKEN with Account Analytics Read.
 */
export async function cloudflareUsage(env: Env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return { configured: false as const };
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart);
  monthStart.setUTCDate(1);
  const date = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        account: env.CF_ACCOUNT_ID,
        dayStart: dayStart.toISOString(),
        monthStart: monthStart.toISOString(),
        now: now.toISOString(),
        today: date(now),
        yesterday: date(new Date(dayStart.getTime() - 1)),
      },
    }),
  });
  const body = await res
    .json<{ data?: { viewer: { accounts: Account[] } }; errors?: { message: string }[] }>()
    .catch(() => null);
  const account = body?.data?.viewer.accounts[0];
  if (!res.ok || !account) {
    const error = body?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    return { configured: true as const, error };
  }

  const sum = <T>(rows: T[], pick: (row: T) => number) =>
    rows.reduce((total, row) => total + (pick(row) || 0), 0);
  const r2Ops = (classes: Set<string>) =>
    sum(
      account.r2Ops.filter((r) => classes.has(r.dimensions.actionType)),
      (r) => r.sum.requests,
    );
  return {
    configured: true as const,
    limits: FREE_LIMITS,
    // When the daily counters start over, for the page to show.
    resetsAt: dayStart.getTime() + 24 * 60 * 60 * 1000,
    workerRequests: sum(account.workers, (r) => r.sum.requests),
    workerErrors: sum(account.workers, (r) => r.sum.errors),
    d1RowsRead: sum(account.d1, (r) => r.sum.rowsRead),
    d1RowsWritten: sum(account.d1, (r) => r.sum.rowsWritten),
    d1StorageBytes: sum(account.d1Storage, (r) => r.max.databaseSizeBytes),
    r2StorageBytes: sum(account.r2Storage, (r) => r.max.payloadSize + r.max.metadataSize),
    r2Objects: sum(account.r2Storage, (r) => r.max.objectCount),
    r2ClassA: r2Ops(R2_CLASS_A),
    r2ClassB: r2Ops(R2_CLASS_B),
  };
}
