import assert from 'node:assert/strict';
import {
  fetchLiveSnapshotForTest,
  formatKimiBalanceFooterTextForTest,
  formatKimiQuotaFooterTextForTest,
  isKimiMoonshotModelForTest,
  kimiBalanceURLForTest,
  kimiCodeUsageURLForTest,
  kimiProviderKindForTest,
  mapKimiBalancePayloadForTest,
  mapKimiCodeUsagePayloadForTest,
} from './src/kimi-quota.ts';

const kimiByProvider = {
  hasUI: true,
  model: {
    provider: 'moonshot',
    id: 'kimi-k2.6',
    baseUrl: 'https://api.moonshot.ai/v1',
  },
};
assert.equal(isKimiMoonshotModelForTest(kimiByProvider), true, 'moonshot provider should be detected as Kimi/Moonshot');
assert.equal(kimiProviderKindForTest(kimiByProvider), 'moonshot', 'moonshot provider should use balance endpoint');

const kimiByBaseUrl = {
  hasUI: true,
  model: {
    provider: 'custom-openai',
    id: 'kimi-k2.6',
    baseUrl: 'https://api.moonshot.ai/v1',
  },
};
assert.equal(isKimiMoonshotModelForTest(kimiByBaseUrl), true, 'moonshot.ai baseUrl should be detected as Kimi/Moonshot');

const kimiCodeByProvider = {
  hasUI: true,
  model: {
    provider: 'kimi-coding',
    id: 'kimi-for-coding',
    baseUrl: 'https://api.kimi.com/coding',
  },
};
assert.equal(isKimiMoonshotModelForTest(kimiCodeByProvider), true, 'kimi-coding provider should be detected');
assert.equal(kimiProviderKindForTest(kimiCodeByProvider), 'kimi-code', 'kimi-coding provider should use usage endpoint');

const kimiCodeV1 = {
  hasUI: true,
  model: {
    provider: 'kimi-coding',
    id: 'kimi-for-coding',
    baseUrl: 'https://api.kimi.com/coding/v1',
  },
};
assert.equal(isKimiMoonshotModelForTest(kimiCodeV1), true, 'api.kimi.com/coding/v1 should be detected');

const maliciousMoonshotLookalike = {
  hasUI: true,
  model: {
    provider: 'custom-openai',
    id: 'kimi-k2.6',
    baseUrl: 'https://evilmoonshot.ai.example/v1',
  },
};
assert.equal(isKimiMoonshotModelForTest(maliciousMoonshotLookalike), false, 'lookalike moonshot host must not be detected');

const maliciousKimiLookalike = {
  hasUI: true,
  model: {
    provider: 'kimi-coding',
    id: 'kimi-for-coding',
    baseUrl: 'https://api.kimi.com.evil.example/coding',
  },
};
assert.equal(isKimiMoonshotModelForTest(maliciousKimiLookalike), false, 'lookalike api.kimi.com host must not be detected');

const kimiCodeWrongPath = {
  hasUI: true,
  model: {
    provider: 'kimi-coding',
    id: 'kimi-for-coding',
    baseUrl: 'https://api.kimi.com/not-coding',
  },
};
assert.equal(isKimiMoonshotModelForTest(kimiCodeWrongPath), false, 'kimi-coding with non-coding path must not be detected when baseUrl is provided');

const maliciousKimiAiLookalike = {
  hasUI: true,
  model: {
    provider: 'custom-openai',
    id: 'kimi-k2.6',
    baseUrl: 'https://api.kimi.ai.example/v1',
  },
};
assert.equal(isKimiMoonshotModelForTest(maliciousKimiAiLookalike), false, 'lookalike kimi.ai host must not be detected');

const providerWithMaliciousBaseUrl = {
  hasUI: true,
  model: {
    provider: 'moonshot',
    id: 'kimi-k2.6',
    baseUrl: 'https://evilmoonshot.ai.example/v1',
  },
};
assert.equal(isKimiMoonshotModelForTest(providerWithMaliciousBaseUrl), false, 'moonshot provider with malicious baseUrl must not be detected');

const cloudflareKimi = {
  hasUI: true,
  model: {
    provider: 'cloudflare-workers-ai',
    id: '@cf/moonshotai/kimi-k2.6',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/test/ai/run',
  },
};
assert.equal(isKimiMoonshotModelForTest(cloudflareKimi), false, 'Cloudflare Workers AI Kimi must not use Moonshot balance');

const payload = {
  code: 0,
  data: {
    available_balance: 49.58894,
    voucher_balance: 46.58893,
    cash_balance: 3.00001,
  },
  scode: '0x0',
  status: true,
};
const snapshot = mapKimiBalancePayloadForTest(payload, Date.UTC(2026, 0, 1));
assert.deepEqual(snapshot, {
  kind: 'moonshot',
  source: 'live',
  capturedAtMs: Date.UTC(2026, 0, 1),
  stale: false,
  availableBalance: 49.58894,
  voucherBalance: 46.58893,
  cashBalance: 3.00001,
});

assert.equal(
  formatKimiBalanceFooterTextForTest(snapshot),
  'Kimi: $49.59 left · voucher $46.59 · cash $3.00',
  'Kimi balance footer should show available, voucher, and cash balances',
);

assert.equal(
  formatKimiBalanceFooterTextForTest({ ...snapshot, source: 'cached', stale: true }),
  'Kimi: $49.59 left · voucher $46.59 · cash $3.00 (cached)',
  'stale Kimi balance should be marked as cached',
);

process.env.MOAI_KIMI_BALANCE_URL = 'https://evilmoonshot.ai.example/steal-token';
let requestedUrl = '';
let requestedAuthorization = '';
const fetchCtx = {
  hasUI: true,
  model: {
    provider: 'moonshot',
    id: 'kimi-k2.6',
    baseUrl: 'https://api.moonshot.ai/v1',
  },
  modelRegistry: {
    async getApiKeyAndHeaders() {
      return { ok: true, apiKey: 'test-token', headers: {} };
    },
  },
};
const fetchedSnapshot = await fetchLiveSnapshotForTest(fetchCtx, async (url, init) => {
  requestedUrl = String(url);
  requestedAuthorization = String(init?.headers?.Authorization ?? '');
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
delete process.env.MOAI_KIMI_BALANCE_URL;
assert.equal(requestedUrl, kimiBalanceURLForTest(), 'Kimi balance URL must ignore runtime env override');
assert.equal(requestedUrl, 'https://api.moonshot.ai/v1/users/me/balance', 'Kimi balance URL must use the official endpoint');
assert.equal(requestedAuthorization, 'Bearer test-token', 'Kimi fetch should use bearer auth without rendering the token');
assert.equal(fetchedSnapshot.availableBalance, 49.58894, 'Kimi fetch should parse balance payload');

const usagePayload = {
  usage: {
    limit: '1000',
    used: '400',
    remaining: '600',
    resetTime: '2026-01-03T16:07:00.000Z',
  },
  limits: [
    {
      window: { duration: '300' },
      detail: {
        limit: '100',
        used: '25',
        remaining: '75',
        resetTime: '2026-01-01T02:15:00.000Z',
      },
    },
  ],
};
const usageSnapshot = mapKimiCodeUsagePayloadForTest(usagePayload, Date.UTC(2026, 0, 1));
assert.deepEqual(usageSnapshot, {
  kind: 'kimi-code',
  source: 'live',
  capturedAtMs: Date.UTC(2026, 0, 1),
  stale: false,
  primary: { label: '5H:', usedPercent: 25, resetsAtMs: Date.UTC(2026, 0, 1, 2, 15) },
  secondary: { label: '7D:', usedPercent: 40, resetsAtMs: Date.UTC(2026, 0, 3, 16, 7) },
});
const usageFooter = formatKimiQuotaFooterTextForTest(usageSnapshot) ?? '';
assert(usageFooter.includes('5H: 🔋'), 'Kimi Code usage footer should include 5H native bar');
assert(usageFooter.includes('25%'), 'Kimi Code usage footer should include 5H used percent');
assert(usageFooter.includes('7D: 🔋'), 'Kimi Code usage footer should include 7D native bar');
assert(usageFooter.includes('40%'), 'Kimi Code usage footer should include weekly used percent');

const limitWeeklyPayload = {
  limits: [
    { window: { duration: '300' }, limit: '200', remaining: '100' },
    { window: { duration: '10080' }, limit: '1000', used: '250' },
  ],
};
const limitWeeklySnapshot = mapKimiCodeUsagePayloadForTest(limitWeeklyPayload, Date.UTC(2026, 0, 1));
assert.equal(limitWeeklySnapshot.primary?.usedPercent, 50, '5H limit window should support remaining/limit');
assert.equal(limitWeeklySnapshot.secondary?.usedPercent, 25, '10080-minute limit window should map to 7D');

process.env.MOAI_KIMI_CODE_USAGE_URL = 'https://api.kimi.com.evil.example/steal-token';
let kimiCodeRequestedUrl = '';
let kimiCodeRequestedAuthorization = '';
let kimiCodeRequestedPlatform = '';
let kimiCodeRequestedDevice = '';
const kimiCodeFetchCtx = {
  hasUI: true,
  model: {
    provider: 'kimi-coding',
    id: 'kimi-for-coding',
    baseUrl: 'https://api.kimi.com/coding',
  },
  modelRegistry: {
    async getApiKeyAndHeaders() {
      return {
        ok: true,
        apiKey: undefined,
        headers: {
          Authorization: 'Bearer oauth-access-token',
          'X-Msh-Platform': 'pi-provider-kimi-code',
          'X-Msh-Device-Id': 'device-123',
        },
      };
    },
  },
};
const fetchedUsageSnapshot = await fetchLiveSnapshotForTest(kimiCodeFetchCtx, async (url, init) => {
  kimiCodeRequestedUrl = String(url);
  kimiCodeRequestedAuthorization = String(init?.headers?.Authorization ?? '');
  kimiCodeRequestedPlatform = String(init?.headers?.['X-Msh-Platform'] ?? '');
  kimiCodeRequestedDevice = String(init?.headers?.['X-Msh-Device-Id'] ?? '');
  return new Response(JSON.stringify(usagePayload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
delete process.env.MOAI_KIMI_CODE_USAGE_URL;
assert.equal(kimiCodeRequestedUrl, kimiCodeUsageURLForTest(), 'Kimi Code usage URL must ignore runtime env override');
assert.equal(kimiCodeRequestedUrl, 'https://api.kimi.com/coding/v1/usages', 'Kimi Code fetch must use official usage endpoint');
assert.equal(kimiCodeRequestedAuthorization, 'Bearer oauth-access-token', 'Kimi Code fetch should use bearer auth from modelRegistry');
assert.equal(kimiCodeRequestedPlatform, 'pi-provider-kimi-code', 'Kimi Code fetch should preserve provider fingerprint headers');
assert.equal(kimiCodeRequestedDevice, 'device-123', 'Kimi Code fetch should preserve provider device headers');
assert.equal(fetchedUsageSnapshot.primary?.usedPercent, 25, 'Kimi Code fetch should parse 5H usage payload');
assert.equal(fetchedUsageSnapshot.secondary?.usedPercent, 40, 'Kimi Code fetch should parse weekly usage payload');

const topLevelOnlyUsageSnapshot = mapKimiCodeUsagePayloadForTest({ usage: { limit: '100', used: '30' } }, Date.UTC(2026, 0, 1));
assert.equal(topLevelOnlyUsageSnapshot.primary?.usedPercent, 30, 'ambiguous top-level Kimi Code usage should default to 5H, not 7D');
assert.equal(topLevelOnlyUsageSnapshot.secondary, undefined, 'ambiguous top-level Kimi Code usage should not invent a weekly window');

process.env.MOONSHOT_API_KEY = 'wrong-open-platform-token';
process.env.KIMI_API_KEY = 'kimi-code-env-token';
let envFallbackAuthorization = '';
await fetchLiveSnapshotForTest({
  hasUI: true,
  model: {
    provider: 'kimi-coding',
    id: 'kimi-for-coding',
    baseUrl: 'https://api.kimi.com/coding',
  },
}, async (_url, init) => {
  envFallbackAuthorization = String(init?.headers?.Authorization ?? '');
  return new Response(JSON.stringify(usagePayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
delete process.env.MOONSHOT_API_KEY;
delete process.env.KIMI_API_KEY;
assert.equal(envFallbackAuthorization, 'Bearer kimi-code-env-token', 'Kimi Code env fallback must use KIMI_API_KEY, not MOONSHOT_API_KEY');

console.log('kimi quota footer regression ok');
