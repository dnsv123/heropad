#!/usr/bin/env node
// Validator for Sigil 0.1. No dependencies.
//
//   node validate.mjs <file.json> [...more]     → conformance of each file
//   node validate.mjs --examples                → runs every file in examples/
//
// Exit code 0 when every file conforms, 1 otherwise. Each problem names the
// JSON path and says what is wrong, so an issuer can fix its emitter without
// reading the spec twice. The rules here are the rules of SPEC.md §2; the
// JSON Schema files say the same thing for tools that speak schema.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = ['stamp_card', 'tier', 'limited_edition', 'visit', 'event'];
const PHYSICAL_KINDS = ['figurine', 'pin', 'card', 'tag', 'ticket', 'other'];
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const DAY_RE = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const HTTPS_RE = /^https:\/\/[^\s]+$/;
// Things that must never be in a credential: an email, a phone number, a
// long digit run that looks like an id. Heuristic, on purpose loud.
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function validateCredential(doc) {
  const problems = [];
  const p = (path, msg) => problems.push({ path, message: msg });

  if (!isObj(doc)) return [{ path: '$', message: 'must be a JSON object' }];

  // Metaplex layer
  if (typeof doc.name !== 'string' || doc.name.length < 1 || doc.name.length > 64) p('$.name', 'required, string, 1–64 characters');
  if (doc.symbol !== undefined && (typeof doc.symbol !== 'string' || doc.symbol.length > 10)) p('$.symbol', 'string, at most 10 characters');
  if (typeof doc.image !== 'string' || !HTTPS_RE.test(doc.image)) p('$.image', 'required, https URL');
  if (doc.external_url !== undefined && !HTTPS_RE.test(String(doc.external_url))) p('$.external_url', 'https URL');
  if (doc.description !== undefined && (typeof doc.description !== 'string' || doc.description.length > 1000)) p('$.description', 'string, at most 1000 characters');
  if (doc.attributes !== undefined) {
    if (!Array.isArray(doc.attributes)) p('$.attributes', 'must be an array');
    else doc.attributes.forEach((a, i) => {
      if (!isObj(a) || typeof a.trait_type !== 'string' || !(typeof a.value === 'string' || typeof a.value === 'number')) p(`$.attributes[${i}]`, 'needs trait_type (string) and value (string or number)');
    });
  }

  // credential layer
  const c = doc.credential;
  if (!isObj(c)) {
    p('$.credential', 'required object');
    return scanPersonalData(doc, problems);
  }
  if (typeof c.standard !== 'string') p('$.credential.standard', 'required, e.g. "sigil/0.1"');
  else if (!/^sigil\/0\.[0-9]+$/.test(c.standard)) p('$.credential.standard', `unsupported "${c.standard}"; this validator knows sigil/0.x`);

  if (!TYPES.includes(c.type)) p('$.credential.type', `required, one of ${TYPES.join(', ')}`);

  if (!isObj(c.issuer)) p('$.credential.issuer', 'required object { id, name }');
  else {
    if (typeof c.issuer.id !== 'string' || !DOMAIN_RE.test(c.issuer.id)) p('$.credential.issuer.id', 'required, a lower-case domain name the venue controls (e.g. "cafe-victor.ro")');
    if (typeof c.issuer.name !== 'string' || c.issuer.name.length < 1 || c.issuer.name.length > 80) p('$.credential.issuer.name', 'required, 1–80 characters');
    if (c.issuer.url !== undefined && !HTTPS_RE.test(String(c.issuer.url))) p('$.credential.issuer.url', 'https URL');
    if (c.issuer.location !== undefined && (typeof c.issuer.location !== 'string' || c.issuer.location.length > 80)) p('$.credential.issuer.location', 'string, at most 80 characters (a city, not an address)');
    for (const k of Object.keys(c.issuer)) if (!['id', 'name', 'url', 'location'].includes(k)) p(`$.credential.issuer.${k}`, 'unknown field');
  }

  if (typeof c.issued_at !== 'string' || !DAY_RE.test(c.issued_at)) p('$.credential.issued_at', 'required, a calendar day "YYYY-MM-DD" (no time of day)');

  if (c.tier !== undefined) {
    if (!isObj(c.tier)) p('$.credential.tier', 'object { level, label }');
    else {
      if (!Number.isInteger(c.tier.level) || c.tier.level < 1) p('$.credential.tier.level', 'integer ≥ 1');
      if (typeof c.tier.label !== 'string' || c.tier.label.length < 1 || c.tier.label.length > 40) p('$.credential.tier.label', 'string, 1–40 characters');
    }
  } else if (c.type === 'tier') p('$.credential.tier', 'required when type is "tier"');

  if (c.edition !== undefined) {
    if (!isObj(c.edition)) p('$.credential.edition', 'object { serial, of? }');
    else {
      if (!Number.isInteger(c.edition.serial) || c.edition.serial < 1) p('$.credential.edition.serial', 'integer ≥ 1');
      if (c.edition.of !== undefined && (!Number.isInteger(c.edition.of) || c.edition.of < (c.edition.serial ?? 1))) p('$.credential.edition.of', 'integer ≥ serial');
    }
  } else if (c.type === 'limited_edition') p('$.credential.edition', 'required when type is "limited_edition"');

  if (c.physical !== undefined) {
    if (!isObj(c.physical)) p('$.credential.physical', 'object { kind, ref }');
    else {
      if (!PHYSICAL_KINDS.includes(c.physical.kind)) p('$.credential.physical.kind', `one of ${PHYSICAL_KINDS.join(', ')}`);
      if (typeof c.physical.ref !== 'string' || c.physical.ref.length < 1 || c.physical.ref.length > 64) p('$.credential.physical.ref', 'string, 1–64 characters, opaque item reference');
    }
  }

  if (c.platform !== undefined) {
    if (!isObj(c.platform) || typeof c.platform.name !== 'string' || c.platform.name.length < 1 || c.platform.name.length > 40) p('$.credential.platform', 'object { name (1–40), url? }');
    else if (c.platform.url !== undefined && !HTTPS_RE.test(String(c.platform.url))) p('$.credential.platform.url', 'https URL');
  }

  if (c.note !== undefined && (typeof c.note !== 'string' || c.note.length > 200)) p('$.credential.note', 'string, at most 200 characters');

  return scanPersonalData(doc, problems);
}

/** Walks every string in the document looking for things that identify a person. */
function scanPersonalData(doc, problems) {
  const walk = (v, path) => {
    if (typeof v === 'string') {
      const isDate = /^\d{4}-\d{2}-\d{2}/.test(v);
      if (EMAIL_RE.test(v)) problems.push({ path, message: 'looks like an email address — no personal data, anywhere' });
      else if (!isDate && PHONE_RE.test(v) && !HTTPS_RE.test(v)) problems.push({ path, message: 'looks like a phone number — no personal data, anywhere' });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(doc, '$');
  return problems;
}

export function validateProfile(doc) {
  const problems = [];
  const p = (path, msg) => problems.push({ path, message: msg });
  if (!isObj(doc)) return [{ path: '$', message: 'must be a JSON object' }];
  if (typeof doc.standard !== 'string' || !/^sigil\/0\.[0-9]+$/.test(doc.standard)) p('$.standard', 'required, "sigil/0.x"');
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!isObj(doc.holder) || !Array.isArray(doc.holder.wallets) || doc.holder.wallets.length === 0) p('$.holder.wallets', 'required, at least one wallet address');
  else doc.holder.wallets.forEach((w, i) => { if (!B58.test(String(w))) p(`$.holder.wallets[${i}]`, 'base58 Solana address'); });
  if (typeof doc.derived_at !== 'string' || Number.isNaN(Date.parse(doc.derived_at))) p('$.derived_at', 'required ISO date-time');
  if (!Array.isArray(doc.credentials)) p('$.credentials', 'required array');
  else doc.credentials.forEach((e, i) => {
    if (!isObj(e)) return p(`$.credentials[${i}]`, 'object');
    if (!B58.test(String(e.asset_id))) p(`$.credentials[${i}].asset_id`, 'base58 asset id');
    if (!B58.test(String(e.owner))) p(`$.credentials[${i}].owner`, 'base58 wallet address');
    if (!(e.authentic === true || e.authentic === false || e.authentic === null)) p(`$.credentials[${i}].authentic`, 'true, false or null');
    const inner = validateCredential({ name: e.name ?? 'x', image: e.image ?? 'https://x.example/x', credential: e.credential });
    for (const q of inner) if (q.path.startsWith('$.credential')) p(`$.credentials[${i}]${q.path.slice(1)}`, q.message);
  });
  return problems;
}

function run(files) {
  let ok = true;
  for (const f of files) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(f, 'utf8'));
    } catch (err) {
      console.log(`✗ ${f}: not JSON (${err.message})`);
      ok = false;
      continue;
    }
    const isProfile = isObj(doc) && Array.isArray(doc.credentials) && isObj(doc.holder);
    const problems = isProfile ? validateProfile(doc) : validateCredential(doc);
    const expectInvalid = /invalid/i.test(f);
    if (problems.length === 0) {
      console.log(`✓ ${f}: conforms (${isProfile ? 'collector profile' : 'venue credential'})`);
      if (expectInvalid) ok = false;
    } else {
      console.log(`✗ ${f}: ${problems.length} problem${problems.length === 1 ? '' : 's'}${expectInvalid ? ' (expected — this example shows what is refused)' : ''}`);
      for (const q of problems) console.log(`    ${q.path}: ${q.message}`);
      if (!expectInvalid) ok = false;
    }
  }
  return ok;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  let files = args;
  if (args.length === 0 || args[0] === '--examples') {
    const dir = join(dirname(fileURLToPath(import.meta.url)), 'examples');
    files = readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => join(dir, n));
  }
  process.exit(run(files) ? 0 : 1);
}
