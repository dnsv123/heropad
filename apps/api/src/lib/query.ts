/**
 * Express query values are not strings.
 *
 * `req.query.x` is `string | string[] | ParsedQs | ParsedQs[]`, so a request
 * like `?wallet[a]=1` makes `String(req.query.wallet)` produce the literal
 * text "[object Object]" — which then gets compared, logged, or written to an
 * audit row as if it were a real value. This narrows to an actual string and
 * treats anything else as absent.
 */
export function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
