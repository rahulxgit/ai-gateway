/**
 * One-off diagnostic script for the "possibly stale defaultModel" providers
 * flagged in PROJECT_OVERVIEW.md (inference, nebius, nvidia, novita).
 *
 * Run this wherever the real *_API_KEY env vars already live and network
 * access to the provider hosts is unrestricted — i.e. locally with a real
 * .env, or via Render's shell (from the service's own environment, not this
 * sandbox, which has an egress allowlist that blocks these hosts).
 *
 * Usage (from repo root, after `npm install`):
 *   npx ts-node src/scripts/check-providers.ts
 *
 * Or add as a package.json script:
 *   "check-providers": "ts-node src/scripts/check-providers.ts"
 *
 * For each of the 4 providers this prints:
 *   1. checkModelAvailability() result (available/unavailable/undetermined)
 *   2. The raw GET /models response (or the raw error body on failure)
 *   3. A highlighted list of model IDs from /models that look like plausible
 *      replacements (fuzzy match against the current defaultModel family)
 *
 * Nothing here mutates any files — it's read-only diagnostics. Paste the
 * full output back and I'll do the actual defaultModel fixes one provider
 * at a time.
 */
import axios from 'axios';
import { providerRegistry } from '../providers/registry';
import { env } from '../config/env';
import { ProviderName } from '../types';

const TARGETS: ProviderName[] = ['inference', 'nebius', 'nvidia', 'novita'];

// Mirrors each adapter's baseUrl / apiKey / headers so we can hit /models
// directly for the *raw* response, not just the boolean-ish
// checkModelAvailability() summary. Kept in sync manually with the adapter
// constructors — if you change a baseUrl there, update it here too.
const RAW_CONFIG: Record<
  string,
  { baseUrl: string; apiKey: string; headers: Record<string, string> }
> = {
  inference: {
    baseUrl: 'https://api.inference.net/v1',
    apiKey: env.inferenceApiKey,
    headers: { Authorization: `Bearer ${env.inferenceApiKey}` },
  },
  nebius: {
    baseUrl: 'https://api.studio.nebius.com/v1',
    apiKey: env.nebiusApiKey,
    headers: { Authorization: `Bearer ${env.nebiusApiKey}` },
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: env.nvidiaApiKey,
    headers: { Authorization: `Bearer ${env.nvidiaApiKey}` },
  },
  novita: {
    baseUrl: 'https://api.novita.ai/openai/v1',
    apiKey: env.novitaApiKey,
    headers: { Authorization: `Bearer ${env.novitaApiKey}` },
  },
};

function currentDefaultModel(name: ProviderName): string {
  return providerRegistry[name].defaultModel;
}

async function checkOne(name: ProviderName) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PROVIDER: ${name}`);
  console.log(`current defaultModel: ${currentDefaultModel(name)}`);
  console.log('='.repeat(70));

  const adapter = providerRegistry[name];
  const cfg = RAW_CONFIG[name];

  if (!cfg.apiKey) {
    console.log(`SKIPPED — no API key set for ${name} in this environment.`);
    return;
  }

  // 1. checkModelAvailability()
  try {
    const result = await adapter.checkModelAvailability?.();
    console.log('\n--- checkModelAvailability() ---');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log('\n--- checkModelAvailability() threw ---');
    console.log(String(err));
  }

  // 2. Raw GET /models
  console.log('\n--- raw GET /models ---');
  try {
    const { data } = await axios.get(`${cfg.baseUrl}/models`, {
      headers: cfg.headers,
      timeout: 15000,
    });
    console.log(JSON.stringify(data, null, 2));

    // 3. Fuzzy-match candidates
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => (typeof m === 'string' ? m : m?.id)).filter(Boolean)
      : Array.isArray(data)
        ? data.map((m: any) => (typeof m === 'string' ? m : m?.id)).filter(Boolean)
        : [];

    if (ids.length) {
      const familyHints = ['llama', 'meta'];
      const candidates = ids.filter((id) =>
        familyHints.some((h) => id.toLowerCase().includes(h))
      );
      console.log(`\n--- ${ids.length} total model IDs returned ---`);
      console.log(`--- ${candidates.length} plausible Llama-family matches ---`);
      candidates.forEach((c) => console.log(`  - ${c}`));
      if (candidates.length === 0) {
        console.log('  (none — current model family may be fully retired from this catalog)');
        console.log('  Full ID list:');
        ids.forEach((c) => console.log(`  - ${c}`));
      }
    }
  } catch (err) {
    console.log('RAW ERROR (this is what we need pasted back verbatim):');
    if (axios.isAxiosError(err)) {
      console.log(`status: ${err.response?.status}`);
      console.log(`body: ${JSON.stringify(err.response?.data, null, 2)}`);
    } else {
      console.log(String(err));
    }
  }
}

async function main() {
  for (const name of TARGETS) {
    await checkOne(name);
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log('Done. Paste this entire output back.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
