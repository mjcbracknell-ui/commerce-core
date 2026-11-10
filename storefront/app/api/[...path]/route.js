import { getStoreDomain } from '../../../lib/tenant';

const API_BASE = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000'
).replace(/\/$/, '');

/**
 * Same-origin proxy for browser-side storefront calls. It forwards the request
 * host as x-store-domain so cart, checkout and order lookup stay tenant-scoped.
 * Customer account cookies stay on this origin and are forwarded to the API.
 */
async function proxy(request, { params }) {
  const segments = params.path || [];
  if (segments[0] !== 'storefront') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { search } = new URL(request.url);
  const target = `${API_BASE}/api/${segments.map(encodeURIComponent).join('/')}${search}`;
  const method = request.method;
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await request.text();
  const headers = {
    Accept: 'application/json',
    'x-store-domain': getStoreDomain(),
  };
  const cookie = request.headers.get('cookie');
  if (cookie) headers.cookie = cookie;
  if (body) headers['Content-Type'] = request.headers.get('content-type') || 'application/json';

  const upstream = await fetch(target, { method, headers, body, cache: 'no-store' });
  const payload = await upstream.arrayBuffer();
  const responseHeaders = new Headers({
    'content-type': upstream.headers.get('content-type') || 'application/json',
    'cache-control': 'no-store',
  });
  const setCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : upstream.headers.get('set-cookie')
        ? [upstream.headers.get('set-cookie')]
        : [];
  setCookies.forEach((value) => responseHeaders.append('set-cookie', value));

  return new Response(payload, { status: upstream.status, headers: responseHeaders });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
