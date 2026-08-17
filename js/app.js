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
  0: ['Bezchmurnie', '☀'],
  1: ['Przeważnie pogodnie', '🌤'],
  2: ['Częściowe zachmurzenie', '⛅'],
  3: ['Pochmurno', '☁'],
  45: ['Mgła', '🌫'], 48: ['Mgła osadzająca szadź', '🌫'],
  51: ['Lekka mżawka', '🌦'], 53: ['Mżawka', '🌦'], 55: ['Silna mżawka', '🌧'],
  56: ['Marznąca mżawka', '🌧'], 57: ['Silna marznąca mżawka', '🌧'],
  61: ['Lekki deszcz', '🌦'], 63: ['Deszcz', '🌧'], 65: ['Silny deszcz', '🌧'],
  66: ['Marznący deszcz', '🌧'], 67: ['Silny marznący deszcz', '🌧'],
  71: ['Lekki śnieg', '🌨'], 73: ['Śnieg', '🌨'], 75: ['Silny śnieg', '❄'],
  77: ['Ziarna śnieżne', '❄'],
  80: ['Przelotny deszcz', '🌦'], 81: ['Przelotny deszcz', '🌧'], 82: ['Silne opady przelotne', '⛈'],
  85: ['Przelotny śnieg', '🌨'], 86: ['Silny przelotny śnieg', '🌨'],
  95: ['Burza', '⛈'], 96: ['Burza z gradem', '⛈'], 99: ['Silna burza z gradem', '⛈']
};

function codeInfo(code) {
  return weatherCodes[code] || ['Warunki zmienne', '◌'];
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
    'precipitation','weather_code','wind_speed_10m'
  ].join(','));
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nie udało się pobrać prognozy.');
  return res.json();
}

function renderWeather(place, data) {
  document.getElementById('locationName').textContent =
    [place.name, place.admin1, place.country].filter(Boolean).join(', ');
  document.getElementById('coordinates').textContent =
    `${Number(place.latitude).toFixed(3)}°N  •  ${Number(place.longitude).toFixed(3)}°E`;

  const c = data.current || {};
  const [text, symbol] = codeInfo(c.weather_code);
  document.getElementById('weatherSymbol').textContent = symbol;
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
      <div class="hour-card" title="${wtext}">
        <div class="time">${hour}</div>
        <div class="icon">${wicon}</div>
        <strong>${fmt(data.hourly.temperature_2m[i], '°')}</strong>
        <small>opad ${fmt(data.hourly.precipitation_probability[i], '%')}</small>
      </div>`);
  }
  document.getElementById('hourlyCards').innerHTML = cards.join('');

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
