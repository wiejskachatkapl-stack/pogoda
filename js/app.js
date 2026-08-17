const intro = document.getElementById('intro');
const app = document.getElementById('app');
const skipIntro = document.getElementById('skipIntro');
const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const searchStatus = document.getElementById('searchStatus');
const weatherSection = document.getElementById('weatherSection');

let introTimer = null;

function enterApp() {
  if (!intro || intro.classList.contains('exit')) return;
  clearTimeout(introTimer);
  intro.classList.add('exit');
  setTimeout(() => {
    intro.classList.add('hidden');
    app.classList.remove('hidden');
  }, 720);
}

skipIntro.addEventListener('click', enterApp);
introTimer = setTimeout(enterApp, 5000);

const weatherCodes = {
  0: ['Bezchmurnie', 'sunny'],
  1: ['Przeważnie pogodnie', 'partly'],
  2: ['Częściowe zachmurzenie', 'partly'],
  3: ['Pochmurno', 'cloudy'],
  45: ['Mgła', 'fog'], 48: ['Mgła osadzająca szadź', 'fog'],
  51: ['Lekka mżawka', 'drizzle'], 53: ['Mżawka', 'drizzle'], 55: ['Silna mżawka', 'rain'],
  56: ['Marznąca mżawka', 'sleet'], 57: ['Silna marznąca mżawka', 'sleet'],
  61: ['Lekki deszcz', 'drizzle'], 63: ['Deszcz', 'rain'], 65: ['Silny deszcz', 'rain-heavy'],
  66: ['Marznący deszcz', 'sleet'], 67: ['Silny marznący deszcz', 'sleet'],
  71: ['Lekki śnieg', 'snow'], 73: ['Śnieg', 'snow'], 75: ['Silny śnieg', 'snow-heavy'],
  77: ['Ziarna śnieżne', 'snow'],
  80: ['Przelotny deszcz', 'drizzle'], 81: ['Przelotny deszcz', 'rain'], 82: ['Silne opady przelotne', 'storm'],
  85: ['Przelotny śnieg', 'snow'], 86: ['Silny przelotny śnieg', 'snow-heavy'],
  95: ['Burza', 'storm'], 96: ['Burza z gradem', 'storm-hail'], 99: ['Silna burza z gradem', 'storm-hail']
};

function codeInfo(code) {
  return weatherCodes[code] || ['Warunki zmienne', 'cloudy'];
}

function fmt(value, unit = '', digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(digits)}${unit}`;
}

async function findCity(name) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'pl');
  url.searchParams.set('format', 'json');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nie udało się wyszukać miejscowości.');
  const data = await res.json();
  if (!data.results?.length) throw new Error('Nie znaleziono takiej miejscowości.');
  return data.results[0];
}

async function getWeather(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('current', [
    'temperature_2m','apparent_temperature','relative_humidity_2m',
    'surface_pressure','weather_code','wind_speed_10m'
  ].join(','));
  url.searchParams.set('hourly', [
    'temperature_2m','apparent_temperature','precipitation_probability',
    'precipitation','weather_code','wind_speed_10m','wind_gusts_10m'
  ].join(','));
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nie udało się pobrać prognozy.');
  return res.json();
}


function weatherIconHtml(type, size = 'normal') {
  return `<div class="wx-icon wx-${type} wx-${size}" aria-hidden="true">
    <span class="wx-sun"></span>
    <span class="wx-cloud"></span>
    <span class="wx-cloud wx-cloud-small"></span>
    <span class="wx-rain"></span>
    <span class="wx-snow">✦ ✦ ✦</span>
    <span class="wx-fog"></span>
    <span class="wx-bolt"></span>
    <span class="wx-hail">• • •</span>
  </div>`;
}

function ensureHourDetails() {
  let modal = document.getElementById('hourDetails');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'hourDetails';
  modal.className = 'hour-details-backdrop hidden';
  modal.innerHTML = `
    <section class="hour-details" role="dialog" aria-modal="true" aria-labelledby="hourDetailsTitle">
      <button class="hour-details-close" type="button" aria-label="Zamknij">×</button>
      <div class="hour-details-head">
        <div id="hourDetailsIcon"></div>
        <div>
          <span class="eyebrow">SZCZEGÓŁY GODZINY</span>
          <h3 id="hourDetailsTitle">—</h3>
          <p id="hourDetailsWeather">—</p>
        </div>
      </div>

      <div class="hour-detail-temp">
        <strong id="detailTemp">—</strong><span>°C</span>
        <small>odczuwalna <b id="detailFeels">—</b></small>
      </div>

      <div class="hour-detail-grid">
        <div class="detail-tile precipitation">
          <span class="detail-symbol">💧</span>
          <div><small>Opad w tej godzinie</small><strong id="detailRain">—</strong></div>
        </div>
        <div class="detail-tile probability">
          <span class="detail-symbol">%</span>
          <div><small>Prawdopodobieństwo opadu</small><strong id="detailPop">—</strong></div>
        </div>
        <div class="detail-tile wind">
          <span class="detail-symbol">➜</span>
          <div><small>Wiatr</small><strong id="detailWind">—</strong></div>
        </div>
        <div class="detail-tile gust">
          <span class="detail-symbol">≋</span>
          <div><small>Porywy wiatru</small><strong id="detailGust">—</strong></div>
        </div>
      </div>

      <div class="wind-scale">
        <div class="wind-scale-label"><span>Siła porywów</span><strong id="gustDescription">—</strong></div>
        <div class="wind-scale-track"><span id="gustBar"></span></div>
      </div>
    </section>`;

  document.body.appendChild(modal);
  const close = () => modal.classList.add('hidden');
  modal.querySelector('.hour-details-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return modal;
}

function gustLabel(speed) {
  if (speed < 20) return 'słabe';
  if (speed < 40) return 'umiarkowane';
  if (speed < 60) return 'silne';
  if (speed < 80) return 'bardzo silne';
  return 'niebezpiecznie silne';
}

function showHourDetails(data, i) {
  const modal = ensureHourDetails();
  const [text, iconType] = codeInfo(data.hourly.weather_code[i]);
  const dt = new Date(data.hourly.time[i]);

  document.getElementById('hourDetailsIcon').innerHTML = weatherIconHtml(iconType, 'large');
  document.getElementById('hourDetailsTitle').textContent =
    dt.toLocaleDateString('pl-PL', {weekday:'long', day:'2-digit', month:'long'}) +
    ' • ' + dt.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'});
  document.getElementById('hourDetailsWeather').textContent = text;
  document.getElementById('detailTemp').textContent = fmt(data.hourly.temperature_2m[i]);
  document.getElementById('detailFeels').textContent = fmt(data.hourly.apparent_temperature[i], '°C');
  document.getElementById('detailRain').textContent = fmt(data.hourly.precipitation[i], ' mm', 1);
  document.getElementById('detailPop').textContent = fmt(data.hourly.precipitation_probability[i], '%');
  document.getElementById('detailWind').textContent = fmt(data.hourly.wind_speed_10m[i], ' km/h');
  document.getElementById('detailGust').textContent = fmt(data.hourly.wind_gusts_10m[i], ' km/h');

  const gust = Number(data.hourly.wind_gusts_10m[i] || 0);
  document.getElementById('gustDescription').textContent = gustLabel(gust);
  document.getElementById('gustBar').style.width = `${Math.min(100, gust / 1.1)}%`;
  modal.classList.remove('hidden');
}

function renderWeather(place, data) {
  document.getElementById('locationName').textContent =
    [place.name, place.admin1, place.country].filter(Boolean).join(', ');
  document.getElementById('coordinates').textContent =
    `${Number(place.latitude).toFixed(3)}°N  •  ${Number(place.longitude).toFixed(3)}°E`;

  const c = data.current || {};
  const [text, symbol] = codeInfo(c.weather_code);
  document.getElementById('weatherSymbol').innerHTML = weatherIconHtml(symbol, 'large');
  document.getElementById('weatherText').textContent = text;
  document.getElementById('currentTemp').textContent = fmt(c.temperature_2m);
  document.getElementById('feelsLike').textContent = fmt(c.apparent_temperature, '°C');
  document.getElementById('windSpeed').textContent = fmt(c.wind_speed_10m, ' km/h');
  document.getElementById('humidity').textContent = fmt(c.relative_humidity_2m, '%');
  document.getElementById('pressure').textContent = fmt(c.surface_pressure, ' hPa');
  document.getElementById('currentTime').textContent =
    c.time ? new Date(c.time).toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'}) : '—';

  const times = data.hourly?.time || [];
  const start = Math.max(0, times.findIndex(t => new Date(t).getTime() >= new Date(c.time || Date.now()).getTime()));
  const cards = [];
  for (let i = start; i < Math.min(start + 24, times.length); i++) {
    const [wtext, wicon] = codeInfo(data.hourly.weather_code[i]);
    const hour = new Date(times[i]).toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'});
    cards.push(`
      <button class="hour-card" type="button" data-hour-index="${i}" title="Kliknij, aby zobaczyć szczegóły: ${wtext}">
        <div class="time">${hour}</div>
        <div class="icon">${weatherIconHtml(wicon, 'small')}</div>
        <strong>${fmt(data.hourly.temperature_2m[i], '°')}</strong>
        <small>opad ${fmt(data.hourly.precipitation_probability[i], '%')}</small>
      </button>`);
  }
  document.getElementById('hourlyCards').innerHTML = cards.join('');
  document.querySelectorAll('.hour-card[data-hour-index]').forEach(card => {
    card.addEventListener('click', () => showHourDetails(data, Number(card.dataset.hourIndex)));
  });

  const next12 = [];
  for (let i = start; i < Math.min(start + 12, times.length); i++) {
    next12.push({
      pop: data.hourly.precipitation_probability[i] ?? 0,
      rain: data.hourly.precipitation[i] ?? 0,
      wind: data.hourly.wind_speed_10m[i] ?? 0,
      temp: data.hourly.temperature_2m[i]
    });
  }
  const maxPop = Math.max(...next12.map(x => x.pop), 0);
  const rainSum = next12.reduce((a,b) => a + b.rain, 0);
  const maxWind = Math.max(...next12.map(x => x.wind), 0);
  const temps = next12.map(x => x.temp).filter(Number.isFinite);
  const minT = temps.length ? Math.min(...temps) : null;
  const maxT = temps.length ? Math.max(...temps) : null;

  let parts = [];
  if (maxPop >= 70) parts.push(`W najbliższych 12 godzinach prawdopodobieństwo opadów wzrasta miejscami do ${Math.round(maxPop)}%.`);
  else if (maxPop >= 35) parts.push(`Możliwe są opady; najwyższe prawdopodobieństwo wynosi około ${Math.round(maxPop)}%.`);
  else parts.push('W najbliższych 12 godzinach ryzyko opadów jest niewielkie.');

  if (rainSum >= 5) parts.push(`Suma prognozowanych opadów w tym okresie to około ${rainSum.toFixed(1)} mm.`);
  if (maxWind >= 40) parts.push(`Wiatr może być wyraźnie odczuwalny — prognoza wskazuje do około ${Math.round(maxWind)} km/h.`);
  if (minT !== null && maxT !== null) parts.push(`Temperatura w analizowanym okresie mieści się mniej więcej między ${Math.round(minT)} a ${Math.round(maxT)}°C.`);

  document.getElementById('analysisText').textContent =
    parts.join(' ') + ' To analiza jednego zestawu danych; porównanie modeli zostanie dodane w następnych wersjach.';
  document.getElementById('confidenceValue').textContent = '—';

  weatherSection.classList.remove('hidden');
  weatherSection.scrollIntoView({behavior:'smooth', block:'start'});
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();
  if (!city) return;
  searchStatus.className = 'status';
  searchStatus.textContent = 'Wyszukuję lokalizację i pobieram prognozę…';

  try {
    const place = await findCity(city);
    const weather = await getWeather(place.latitude, place.longitude);
    renderWeather(place, weather);
    searchStatus.textContent = 'Dane pobrane poprawnie.';
  } catch (err) {
    searchStatus.className = 'status error';
    searchStatus.textContent = err?.message || 'Wystąpił błąd pobierania danych.';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
