// Oblio API client — issues the monthly subscription invoices.
// ---------------------------------------------------------------------------
// Why a hand-rolled client: Oblio's REST API is small (get a token, post an
// invoice) and a dependency for two calls is a dependency to keep patched
// forever.
//
// THE DRY-RUN IS THE POINT. This module issues fiscal documents with legal
// weight, sent to real clients under a real company's name. A bug here does
// not produce a stack trace — it produces a wrong invoice at an accountant's
// desk. So OBLIO_DRY_RUN defaults to ON: the payload is built and returned in
// full, and nothing leaves the server. Turning it off is a deliberate act,
// taken once the payload has been read by a human at least once.
//
// Env:
//   OBLIO_EMAIL     account email  (= client_id)
//   OBLIO_SECRET    API secret     (Oblio → Setări → Date cont → API)
//   OBLIO_CIF       OUR company's CIF — the issuer
//   OBLIO_SERIES    invoice series name, exactly as defined in Oblio (e.g. HP)
//   OBLIO_DRY_RUN   "0" to actually issue; anything else (or unset) = dry run
//   OBLIO_VAT_NAME  optional — the VAT rule's name in YOUR Oblio account
//                   ("Normala", "Neplatitor", "SDD"…). Oblio matches this
//                   against its own nomenclature, so it is a setting rather
//                   than something to guess: check it with your accountant.
//   OBLIO_UNIT      optional — unit of measure, default "buc"
//   OBLIO_PRICE_INCLUDES_VAT
//                   "1" (default) — the price IS what the client pays; any VAT
//                   is contained in it. "0" — the price is net and VAT is
//                   added on top (99 lei + 21% = 119.79 lei to pay).
//                   A company-wide decision, not a per-client one, which is
//                   why it lives here and not in the database.
//
// Reference: https://www.oblio.eu/api — endpoints and field names follow the
// public documentation. Run one dry-run and one real invoice against a test
// series before trusting it with a client.

const OBLIO_BASE = 'https://www.oblio.eu/api';

export interface OblioClient {
  name: string;
  cif: string;
  rc?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  email?: string;
}

export interface OblioInvoiceInput {
  client: OblioClient;
  /** Line item label, e.g. "Abonament HeroPad — Starter". */
  productName: string;
  /** Human period the line covers, e.g. "Septembrie 2026". */
  periodLabel: string;
  /** Final price per month, in `currency`. VAT is treated as included. */
  price: number;
  currency: string;
  vatPercentage: number;
  /** ISO date (YYYY-MM-DD). */
  issueDate: string;
  dueDate: string;
  /** Ask Oblio to email the PDF to the client. */
  sendEmail: boolean;
}

export interface OblioInvoiceResult {
  dryRun: boolean;
  seriesName: string | null;
  number: string | null;
  link: string | null;
  /** Exactly what was (or would be) sent. Shown in the admin panel. */
  payload: Record<string, unknown>;
}

export class OblioConfigError extends Error {}
export class OblioApiError extends Error {}

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

/** True when Oblio is configured well enough to attempt a real issue. */
export function oblioStatus(): {
  configured: boolean;
  dryRun: boolean;
  missing: string[];
  series: string | null;
  priceIncludesVat: boolean;
} {
  const missing = ['OBLIO_EMAIL', 'OBLIO_SECRET', 'OBLIO_CIF', 'OBLIO_SERIES'].filter(
    (k) => !env(k)
  );
  return {
    configured: missing.length === 0,
    // Fails SAFE: only an explicit "0" turns the dry run off.
    dryRun: (env('OBLIO_DRY_RUN') ?? '1') !== '0',
    missing,
    series: env('OBLIO_SERIES'),
    priceIncludesVat: (env('OBLIO_PRICE_INCLUDES_VAT') ?? '1') !== '0',
  };
}

// Tokens last an hour; caching one avoids an extra round trip per invoice and
// keeps us far from any rate limit during a monthly batch.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const email = env('OBLIO_EMAIL');
  const secret = env('OBLIO_SECRET');
  if (!email || !secret) {
    throw new OblioConfigError('OBLIO_EMAIL / OBLIO_SECRET are not set.');
  }

  // form-urlencoded, not JSON: this is the shape hoh-backend has used against
  // Oblio in production since May 2026 (see hoh-backend/src/services/
  // oblioService.ts). Same company, same account — no reason to rediscover
  // what already works.
  const res = await fetch(`${OBLIO_BASE}/authorize/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: email, client_secret: secret }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new OblioApiError(`Oblio auth failed with HTTP ${res.status}.`);
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new OblioApiError('Oblio auth returned no access_token.');
  }
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/** Drops the cached token — used when Oblio answers 401 mid-batch. */
export function resetOblioToken(): void {
  cachedToken = null;
}

function buildPayload(input: OblioInvoiceInput): Record<string, unknown> {
  const status = oblioStatus();
  return {
    cif: env('OBLIO_CIF') ?? '',
    client: {
      name: input.client.name,
      cif: input.client.cif,
      rc: input.client.rc ?? '',
      address: input.client.address ?? '',
      city: input.client.city ?? '',
      state: input.client.state ?? '',
      country: input.client.country ?? 'Romania',
      email: input.client.email ?? '',
      // Keep the client in Oblio's address book so the next month is a
      // one-liner and the accountant sees one client, not twelve duplicates.
      save: 1,
    },
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    seriesName: status.series ?? '',
    language: 'RO',
    precision: 2,
    currency: input.currency,
    products: [
      {
        name: input.productName,
        description: input.periodLabel,
        price: input.price,
        measuringUnit: env('OBLIO_UNIT') ?? 'buc',
        currency: input.currency,
        quantity: 1,
        productType: 'Serviciu',
        // 'Normala' + 0% is what hoh-backend sends for the same non-VAT
        // company and what Oblio has accepted on ~70 invoices since May 2026.
        // The account's VAT-exempt status flows through on Oblio's side.
        vatName: env('OBLIO_VAT_NAME') ?? 'Normala',
        vatPercentage: input.vatPercentage,
        // Whether the public prices (99/199/299 lei) are the total a café
        // pays, or a net figure with VAT added on top. Defaults to included,
        // because that is what a founding partner shaking hands on "99 lei a
        // month" heard — flipping it later without changing their contract
        // would be a price rise nobody agreed to.
        vatIncluded: status.priceIncludesVat ? 1 : 0,
      },
    ],
    mentions: input.periodLabel,
    sendEmail: input.sendEmail ? 1 : 0,
    useStock: 0,
    // e-Factura: Oblio generates the XML and submits it to ANAF SPV through
    // the fiscal mandate already set up with the accountant for SVU Journey
    // SRL. Our clients are Romanian companies, so this is always on — the
    // "e-factura cu ce o facem?" question is answered by this one flag.
    einvoice: (input.client.country ?? 'Romania').toLowerCase() === 'romania' ? 1 : 0,
  };
}

/**
 * Issues one invoice. In dry-run mode it returns the exact payload without
 * contacting Oblio — same shape, `dryRun: true`, no document created.
 */
export async function issueInvoice(
  input: OblioInvoiceInput
): Promise<OblioInvoiceResult> {
  const status = oblioStatus();
  const payload = buildPayload(input);

  if (status.dryRun || !status.configured) {
    return { dryRun: true, seriesName: null, number: null, link: null, payload };
  }

  const token = await getToken();
  const res = await fetch(`${OBLIO_BASE}/docs/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) {
    // Token expired early on Oblio's side — retry exactly once with a fresh
    // one. No loop: a second 401 is a credential problem, not a stale token.
    resetOblioToken();
    const retryToken = await getToken();
    const retry = await fetch(`${OBLIO_BASE}/docs/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${retryToken}`,
      },
      body: JSON.stringify(payload),
    });
    return parseInvoiceResponse(retry, payload);
  }

  return parseInvoiceResponse(res, payload);
}

async function parseInvoiceResponse(
  res: Response,
  payload: Record<string, unknown>
): Promise<OblioInvoiceResult> {
  const text = await res.text();
  let body: {
    status?: number;
    statusMessage?: string;
    data?: { seriesName?: string; number?: string; link?: string };
  };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new OblioApiError(
      `Oblio returned a non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!res.ok || (body.status !== undefined && body.status !== 200)) {
    throw new OblioApiError(
      body.statusMessage ?? `Oblio refused the invoice (HTTP ${res.status}).`
    );
  }

  return {
    dryRun: false,
    seriesName: body.data?.seriesName ?? null,
    number: body.data?.number ?? null,
    link: body.data?.link ?? null,
    payload,
  };
}
