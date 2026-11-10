/** URL/handle safe slug, Shopify-compatible (lowercase, hyphen separated). */
export function slugify(input, fallback = 'item') {
  const slug = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

/** Find a handle that is not taken yet, appending -2, -3, ... */
export function uniqueHandle(base, taken) {
  const set = taken instanceof Set ? taken : new Set(taken);
  let handle = base;
  let n = 2;
  while (set.has(handle)) {
    handle = `${base}-${n}`;
    n += 1;
  }
  return handle;
}

export function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export function domainMatches(licensedDomain, requestDomain) {
  const licensed = normalizeDomain(licensedDomain);
  const requested = normalizeDomain(requestDomain);
  if (!licensed || !requested) return false;
  if (licensed === requested) return true;
  if (licensed.startsWith('*.')) {
    const suffix = licensed.slice(2);
    return requested.endsWith(`.${suffix}`) || requested === suffix;
  }
  return false;
}
