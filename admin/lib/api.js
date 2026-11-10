export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

let refreshing = null;

export function getActiveStoreId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('cc_store_id');
}

export function setActiveStoreId(storeId) {
  if (typeof window === 'undefined') return;
  if (storeId) window.localStorage.setItem('cc_store_id', storeId);
  else window.localStorage.removeItem('cc_store_id');
}

async function refreshSession() {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          refreshing = null;
        }, 500);
      });
  }
  return refreshing;
}

function buildOptions({ method = 'GET', body, headers = {} } = {}) {
  const storeId = getActiveStoreId();
  const options = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(storeId ? { 'X-Store-Id': storeId } : {}),
      ...headers,
    },
  };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  return options;
}

export async function api(path, config = {}) {
  let response = await fetch(`${API_BASE}${path}`, buildOptions(config));

  // Never auto-redirect on auth endpoints: the login page calls /me to detect an
  // existing session, and redirecting there would reload the page in a loop.
  const isAuthRoute = path.startsWith('/api/auth/');
  if (response.status === 401 && !isAuthRoute) {
    const refreshed = await refreshSession();
    if (refreshed) response = await fetch(`${API_BASE}${path}`, buildOptions(config));
  }

  if (
    response.status === 401 &&
    !isAuthRoute &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login')
  ) {
    window.location.href = '/login';
    throw new Error('Your session expired. Please sign in again.');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

export function formatMoney(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value) || 0);
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}
