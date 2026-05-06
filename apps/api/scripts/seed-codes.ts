/* eslint-disable no-console */
// Seed script: generates a handful of valid demo claim codes with proper
// HMAC signatures and inserts them into `collectibles_catalog`.
//
// Output: prints each code + its signature so you can build test URLs:
//   http://localhost:5173/claim?c=HVPD-AAAA-AAAA&s=<sig>
//
// Usage from repo root:
//   tsx apps/api/scripts/seed-codes.ts

import 'dotenv/config';
import { randomBytes } from 'node:crypto';

import { signPayload } from '../src/lib/hmac.js';
import { getSupabaseAdmin } from '../src/lib/supabase-admin.js';

const NUM_CODES = 5;
const BATCH_ID = `demo-${new Date().toISOString().slice(0, 10)}`;

function randomCodeSegment(): string {
  // 4-char alphanumeric, uppercase, no ambiguous chars (0/O, 1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(4))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

function generateCode(): string {
  return `HVPD-${randomCodeSegment()}-${randomCodeSegment()}`;
}

async function main() {
  console.log('=== HeroPad — seed demo claim codes ===');
  const supa = getSupabaseAdmin();

  const rows: Array<{ code: string; signature: string }> = [];
  for (let i = 0; i < NUM_CODES; i += 1) {
    const code = generateCode();
    const signature = signPayload(code);
    rows.push({ code, signature });
  }

  // Insert as figurine_nfc, distribution_channel = 'event' for demo.
  const { error } = await supa.from('collectibles_catalog').insert(
    rows.map((r) => ({
      code: r.code,
      type: 'figurine_nfc',
      character_id: null,
      signature: r.signature,
      cnft_template: {
        name: `Super Victor — ${r.code.slice(-4)}`,
        symbol: 'HEROPAD',
        // Placeholder metadata URI; Day 4 we wire real Pinata / R2 uploads.
        uri: 'https://heropad.vercel.app/cnft/placeholder.json',
      },
      distribution_channel: 'event',
      batch_id: BATCH_ID,
    }))
  );

  if (error) {
    console.error('✗ Insert failed:', error.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${rows.length} demo codes (batch ${BATCH_ID})\n`);
  console.log('Use any of these to test the claim flow:\n');
  for (const r of rows) {
    console.log(`  Code: ${r.code}`);
    console.log(`  Sig : ${r.signature}`);
    console.log(`  URL : http://localhost:5173/claim?c=${r.code}&s=${r.signature}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
