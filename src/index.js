const OPENWEATHER_LIGHTNING_URL = 'https://demo.openweathermap.org/lightning/1.0/data';

function corsHeaders(origin, allowedOrigin) {
  const allow = allowedOrigin && allowedOrigin !== '*' ? allowedOrigin : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const cors = corsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'meteo-lightning-worker',
        lightning_key_configured: Boolean(env.OPENWEATHER_API_KEY),
      }, 200, cors);
    }

    if (url.pathname !== '/lightning') {
      return json({
        error: 'Not found',
        endpoints: ['/health', '/lightning?lat=...&lon=...&radius=50&minutes=30'],
      }, 404, cors);
    }

    if (!env.OPENWEATHER_API_KEY) {
      return json({
        error: 'OPENWEATHER_API_KEY is not configured in Worker secrets.',
      }, 500, cors);
    }

    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const radius = clamp(Number(url.searchParams.get('radius') || 50), 1, 50);
    const minutes = clamp(Number(url.searchParams.get('minutes') || 30), 5, 60);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return json({ error: 'Invalid lat/lon.' }, 400, cors);
    }

    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60_000);

    const api = new URL(OPENWEATHER_LIGHTNING_URL);
    api.searchParams.set('lat', lat.toFixed(6));
    api.searchParams.set('lon', lon.toFixed(6));
    api.searchParams.set('radius', radius.toFixed(1));
    api.searchParams.set('start_date', start.toISOString());
    api.searchParams.set('end_date', end.toISOString());
    api.searchParams.set('apikey', env.OPENWEATHER_API_KEY);

    let upstream;
    try {
      upstream = await fetch(api.toString(), {
        headers: { 'Accept': 'application/json' },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
    } catch (error) {
      return json({
        error: 'OpenWeather request failed.',
        detail: String(error?.message || error),
      }, 502, cors);
    }

    const rawText = await upstream.text();
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = { message: rawText.slice(0, 500) };
    }

    if (!upstream.ok) {
      return json({
        error: 'OpenWeather Lightning API returned an error.',
        upstream_status: upstream.status,
        upstream: body,
        hint: upstream.status === 403
          ? 'The API key probably does not have access to the Lightning API product.'
          : undefined,
      }, upstream.status, cors);
    }

    const lightnings = Array.isArray(body?.lightnings) ? body.lightnings : [];

    const strikes = lightnings.map((s) => ({
      id: s.id ?? null,
      datetime: s.datetime ?? s.date ?? null,
      lat: Number(s.lat),
      lon: Number(s.lon),
      quality: s.quality ?? 'undefined',
      error: s.error == null ? null : Number(s.error),
    })).filter((s) =>
      Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.datetime
    );

    return json({
      ok: true,
      center: { lat, lon },
      radius_km: radius,
      window_minutes: minutes,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      fetched_at: new Date().toISOString(),
      count: strikes.length,
      strikes,
    }, 200, cors);
  },
};
