const intro = document.getElementById('intro');
const app = document.getElementById('app');
const skipIntro = document.getElementById('skipIntro');
const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const searchStatus = document.getElementById('searchStatus');
const weatherSection = document.getElementById('weatherSection');
const emptyState = document.getElementById('emptyState');

let introTimer = null;
let map = null;
let placeMarker = null;
let radarLayer = null;
let forecastLayer = null;
let forecastCenterMarker = null;
let currentWeatherData = null;
let currentPlace = null;
let selectedHourIndex = null;
let forecastGridData = null;
let mapMode = 'forecast';

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
  0:['Bezchmurnie','sunny'],1:['Przeważnie pogodnie','partly'],2:['Częściowe zachmurzenie','partly'],3:['Pochmurno','cloudy'],
  45:['Mgła','fog'],48:['Mgła osadzająca szadź','fog'],51:['Lekka mżawka','drizzle'],53:['Mżawka','drizzle'],55:['Silna mżawka','rain'],
  56:['Marznąca mżawka','sleet'],57:['Silna marznąca mżawka','sleet'],61:['Lekki deszcz','drizzle'],63:['Deszcz','rain'],65:['Silny deszcz','rain-heavy'],
  66:['Marznący deszcz','sleet'],67:['Silny marznący deszcz','sleet'],71:['Lekki śnieg','snow'],73:['Śnieg','snow'],75:['Silny śnieg','snow-heavy'],
  77:['Ziarna śnieżne','snow'],80:['Przelotny deszcz','drizzle'],81:['Przelotny deszcz','rain'],82:['Silne opady przelotne','storm'],
  85:['Przelotny śnieg','snow'],86:['Silny przelotny śnieg','snow-heavy'],95:['Burza','storm'],96:['Burza z gradem','storm-hail'],99:['Silna burza z gradem','storm-hail']
};
function codeInfo(code){ return weatherCodes[code] || ['Warunki zmienne','cloudy']; }
function fmt(value, unit='', digits=0){
  if(value===null || value===undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}${unit}`;
}
function weatherIconHtml(type,size='normal'){
  return `<div class="wx-icon wx-state-${type} wx-${size}" aria-hidden="true">
    <span class="wx-sun"></span><span class="wx-cloud"></span><span class="wx-rain"></span>
    <span class="wx-snow">✦ ✦ ✦</span><span class="wx-fog"></span><span class="wx-bolt"></span>
  </div>`;
}
function windDirectionLabel(deg){
  if(deg===null || deg===undefined || Number.isNaN(Number(deg))) return '—';
  const dirs=['N','NE','E','SE','S','SW','W','NW'];
  return `${dirs[Math.round(Number(deg)/45)%8]} ↗`;
}
function riskClass(level){ return level==='NISKIE'?'risk-low':level==='UMIARKOWANE'?'risk-medium':'risk-high'; }
function stormRisk(cape,code){
  if([95,96,99].includes(Number(code))) return 'WYSOKIE';
  cape=Number(cape||0);
  if(cape>=1500) return 'WYSOKIE';
  if(cape>=500) return 'UMIARKOWANE';
  return 'NISKIE';
}
function rainRisk(pop){
  pop=Number(pop||0);
  if(pop>=70) return 'WYSOKIE';
  if(pop>=35) return 'UMIARKOWANE';
  return 'NISKIE';
}
function windRisk(gust){
  gust=Number(gust||0);
  if(gust>=70) return 'WYSOKIE';
  if(gust>=40) return 'UMIARKOWANE';
  return 'NISKIE';
}

async function findCity(name){
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name',name); url.searchParams.set('count','5'); url.searchParams.set('language','pl'); url.searchParams.set('format','json');
  const res=await fetch(url); if(!res.ok) throw new Error('Nie udało się wyszukać miejscowości.');
  const data=await res.json(); if(!data.results?.length) throw new Error('Nie znaleziono takiej miejscowości.');
  return data.results[0];
}

async function getWeather(lat,lon){
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',lat); url.searchParams.set('longitude',lon); url.searchParams.set('timezone','auto'); url.searchParams.set('forecast_days','3');
  url.searchParams.set('current',[
    'temperature_2m','apparent_temperature','relative_humidity_2m','surface_pressure','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','visibility','cloud_cover','cape'
  ].join(','));
  url.searchParams.set('hourly',[
    'temperature_2m','apparent_temperature','precipitation_probability','precipitation','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','relative_humidity_2m','surface_pressure',
    'visibility','cloud_cover','cape'
  ].join(','));
  const res=await fetch(url); if(!res.ok) throw new Error('Nie udało się pobrać prognozy.');
  return res.json();
}

function hourlyStartIndex(data){
  const times=data.hourly?.time||[];
  const currentTime=new Date(data.current?.time||Date.now()).getTime();
  const idx=times.findIndex(t=>new Date(t).getTime()>=currentTime);
  return Math.max(0,idx);
}

function renderCurrent(data){
  const c=data.current||{};
  const [text,icon]=codeInfo(c.weather_code);
  document.getElementById('currentTemp').textContent=fmt(c.temperature_2m);
  document.getElementById('feelsLike').textContent=fmt(c.apparent_temperature,'°C');
  document.getElementById('humidity').textContent=fmt(c.relative_humidity_2m,'%');
  document.getElementById('pressure').textContent=fmt(c.surface_pressure,' hPa');
  document.getElementById('visibility').textContent=fmt((c.visibility||0)/1000,' km',1);
  document.getElementById('windSpeed').textContent=fmt(c.wind_speed_10m,' km/h');
  document.getElementById('windGust').textContent=fmt(c.wind_gusts_10m,' km/h');
  document.getElementById('windDirectionText').textContent=windDirectionLabel(c.wind_direction_10m);
  document.getElementById('currentCape').textContent=fmt(c.cape,' J/kg');
  document.getElementById('weatherText').textContent=text;
  document.getElementById('weatherSymbol').innerHTML=weatherIconHtml(icon,'large');
}

function renderHourly(data){
  const h=data.hourly, start=hourlyStartIndex(data), cards=[];
  for(let i=start;i<Math.min(start+24,h.time.length);i++){
    const [txt,icon]=codeInfo(h.weather_code[i]);
    const time=new Date(h.time[i]).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
    cards.push(`<button class="hour-card" type="button" data-hour-index="${i}" title="${txt}">
      <div class="time">${time}</div>
      <div class="icon">${weatherIconHtml(icon,'small')}</div>
      <div class="temp">${fmt(h.temperature_2m[i],'°')}</div>
      <div class="hline rainline">💧 ${fmt(h.precipitation[i],' mm',1)}</div>
      <div class="hline">≋ ${fmt(h.wind_speed_10m[i],' km/h')}</div>
      <div class="hline gustline">≋ ${fmt(h.wind_gusts_10m[i],' km/h')}</div>
      <div class="hline popline">☔ ${fmt(h.precipitation_probability[i],'%')}</div>
    </button>`);
  }
  document.getElementById('hourlyCards').innerHTML=cards.join('');
  document.querySelectorAll('.hour-card').forEach(card=>card.addEventListener('click',()=>{
    document.querySelectorAll('.hour-card').forEach(c=>c.classList.remove('selected'));
    card.classList.add('selected');
    renderHourDetails(data,Number(card.dataset.hourIndex));
  }));
  const first=document.querySelector('.hour-card');
  if(first){ first.classList.add('selected'); renderHourDetails(data,Number(first.dataset.hourIndex)); }
}

function setRisk(id,value){
  const el=document.getElementById(id);
  el.textContent=value; el.className=riskClass(value);
}

function renderHourDetails(data,i){
  selectedHourIndex=i;
  const h=data.hourly, dt=new Date(h.time[i]), [txt,icon]=codeInfo(h.weather_code[i]);
  document.getElementById('detailDate').textContent=
    dt.toLocaleDateString('pl-PL',{weekday:'long',day:'2-digit',month:'long'})+' • '+dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  document.getElementById('detailWeatherIcon').innerHTML=weatherIconHtml(icon,'large');
  document.getElementById('detailWeatherText').textContent=txt;
  document.getElementById('detailTemp').textContent=fmt(h.temperature_2m[i],'°C');
  document.getElementById('detailFeels').textContent=fmt(h.apparent_temperature[i],'°C');
  document.getElementById('detailRain').textContent=fmt(h.precipitation[i],' mm',1);
  document.getElementById('detailWind').textContent=fmt(h.wind_speed_10m[i],' km/h');
  document.getElementById('detailWindDir').textContent=windDirectionLabel(h.wind_direction_10m[i]);
  document.getElementById('detailGust').textContent=fmt(h.wind_gusts_10m[i],' km/h');
  document.getElementById('detailCape').textContent=fmt(h.cape[i],' J/kg');
  document.getElementById('detailCloud').textContent=fmt(h.cloud_cover[i],'%');
  document.getElementById('detailPressure').textContent=fmt(h.surface_pressure[i],' hPa');
  document.getElementById('detailHumidity').textContent=fmt(h.relative_humidity_2m[i],'%');
  document.getElementById('detailVisibility').textContent=fmt((h.visibility[i]||0)/1000,' km',1);
  const sr=stormRisk(h.cape[i],h.weather_code[i]), rr=rainRisk(h.precipitation_probability[i]), wr=windRisk(h.wind_gusts_10m[i]);
  setRisk('stormRisk',sr); setRisk('rainRisk',rr); setRisk('windRisk',wr);
  document.getElementById('lightningCape').textContent=fmt(h.cape[i],' J/kg');
  document.getElementById('lightningRisk').textContent=sr;
  document.getElementById('lightningRisk').className=riskClass(sr);
  renderCapeBars(data,i);
  if(mapMode==='forecast' && forecastGridData?.length){
    renderForecastMapForHour(data,i);
  }
}

function renderCapeBars(data,activeIndex){
  const h=data.hourly,start=hourlyStartIndex(data),vals=[];
  for(let i=start;i<Math.min(start+24,h.time.length);i++) vals.push(Number(h.cape[i]||0));
  const max=Math.max(...vals,200);
  document.getElementById('capeBars').innerHTML=vals.map((v,j)=>{
    const idx=start+j, height=Math.max(4,Math.min(100,v/max*100));
    const time=new Date(h.time[idx]).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
    return `<i class="cape-bar ${idx===activeIndex?'active':''}" style="height:${height}%" data-tip="${time}: ${Math.round(v)} J/kg"></i>`;
  }).join('');
}

function renderAnalysis(data){
  const h=data.hourly,start=hourlyStartIndex(data),end=Math.min(start+24,h.time.length);
  const pops=h.precipitation_probability.slice(start,end).map(Number);
  const rains=h.precipitation.slice(start,end).map(Number);
  const gusts=h.wind_gusts_10m.slice(start,end).map(Number);
  const capes=h.cape.slice(start,end).map(Number);
  const maxPop=Math.max(...pops,0), rainSum=rains.reduce((a,b)=>a+b,0), maxGust=Math.max(...gusts,0), maxCape=Math.max(...capes,0);
  const parts=[];
  if(maxPop>=70) parts.push(`W ciągu 24 godzin prawdopodobieństwo opadów wzrasta do około ${Math.round(maxPop)}%.`);
  else if(maxPop>=35) parts.push(`Możliwe są opady, z prawdopodobieństwem do około ${Math.round(maxPop)}%.`);
  else parts.push('Ryzyko opadów w najbliższych 24 godzinach jest niewielkie.');
  parts.push(`Prognozowana suma opadów to około ${rainSum.toFixed(1)} mm.`);
  if(maxGust>=40) parts.push(`Porywy wiatru mogą osiągać około ${Math.round(maxGust)} km/h.`);
  if(maxCape>=500) parts.push(`CAPE dochodzi do około ${Math.round(maxCape)} J/kg, więc należy obserwować rozwój konwekcji i burz.`);
  else parts.push(`Potencjał konwekcyjny pozostaje niski (maks. CAPE około ${Math.round(maxCape)} J/kg).`);
  document.getElementById('analysisText').textContent=parts.join(' ');
  document.getElementById('modelTempPreview').textContent=fmt(data.current.temperature_2m,'°C');
  document.getElementById('modelRainPreview').textContent=fmt(rainSum,' mm',1);
  document.getElementById('modelWindPreview').textContent=fmt(maxGust,' km/h');
}


function precipitationColor(mm){
  mm=Number(mm||0);
  if(mm<0.05) return '#4d92c9';
  if(mm<0.3) return '#2aa6ff';
  if(mm<1) return '#19d5c5';
  if(mm<2) return '#9bdc3f';
  if(mm<4) return '#ffd43f';
  if(mm<8) return '#ff8b2e';
  return '#ff3a45';
}
function forecastCellOpacity(mm,cloud){
  mm=Number(mm||0);
  cloud=Number(cloud||0);
  if(mm>=0.05) return Math.min(.72,.28+mm*.07);
  return .10+Math.min(.22,cloud/400);
}

function buildForecastGrid(place){
  const lat=Number(place.latitude),lon=Number(place.longitude);
  const offsets=[-1.0,-0.5,0,0.5,1.0];
  const points=[];
  offsets.forEach(dLat=>offsets.forEach(dLon=>{
    points.push({lat:lat+dLat,lon:lon+dLon});
  }));
  return points;
}

async function loadForecastGrid(place,weather){
  const points=buildForecastGrid(place);
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',points.map(p=>p.lat.toFixed(4)).join(','));
  url.searchParams.set('longitude',points.map(p=>p.lon.toFixed(4)).join(','));
  url.searchParams.set('hourly',[
    'temperature_2m','precipitation','precipitation_probability','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','cloud_cover','cape'
  ].join(','));
  url.searchParams.set('forecast_days','3');

  // Ta sama strefa czasowa dla całej małej siatki wokół wybranego miasta.
  const tz=weather?.timezone||'auto';
  url.searchParams.set('timezone',tz);

  const res=await fetch(url);
  if(!res.ok) throw new Error('Nie udało się pobrać mapy prognozy.');
  const data=await res.json();
  const arr=Array.isArray(data)?data:[data];
  forecastGridData=arr.map((entry,idx)=>({point:points[idx],data:entry}));
  return forecastGridData;
}

function findGridHourIndex(entry,targetTime){
  const times=entry?.hourly?.time||[];
  let idx=times.indexOf(targetTime);
  if(idx>=0) return idx;

  const target=new Date(targetTime).getTime();
  let best=0,bestDiff=Infinity;
  times.forEach((t,i)=>{
    const d=Math.abs(new Date(t).getTime()-target);
    if(d<bestDiff){bestDiff=d;best=i;}
  });
  return best;
}

function clearForecastLayer(){
  if(forecastLayer){ forecastLayer.remove(); forecastLayer=null; }
  if(forecastCenterMarker){ forecastCenterMarker.remove(); forecastCenterMarker=null; }
}

function renderForecastMapForHour(data,i){
  if(!map || !forecastGridData?.length) return;
  if(mapMode!=='forecast') return;

  clearForecastLayer();
  if(radarLayer){ radarLayer.remove(); radarLayer=null; }

  const targetTime=data.hourly.time[i];
  const group=L.layerGroup();
  const centerLat=Number(currentPlace.latitude),centerLon=Number(currentPlace.longitude);

  forecastGridData.forEach(item=>{
    const h=item.data.hourly||{};
    const hi=findGridHourIndex(item.data,targetTime);

    const rain=Number(h.precipitation?.[hi]||0);
    const pop=Number(h.precipitation_probability?.[hi]||0);
    const temp=Number(h.temperature_2m?.[hi]);
    const wind=Number(h.wind_speed_10m?.[hi]||0);
    const gust=Number(h.wind_gusts_10m?.[hi]||0);
    const dir=Number(h.wind_direction_10m?.[hi]||0);
    const cloud=Number(h.cloud_cover?.[hi]||0);
    const cape=Number(h.cape?.[hi]||0);
    const code=Number(h.weather_code?.[hi]||0);
    const [desc]=codeInfo(code);

    const circle=L.circle([item.point.lat,item.point.lon],{
      radius:31000,
      stroke:false,
      fill:true,
      fillColor:precipitationColor(rain),
      fillOpacity:forecastCellOpacity(rain,cloud),
      className:'forecast-cell'
    });

    circle.bindPopup(`<div class="forecast-popup">
      <strong>${desc}</strong>
      <span>Temperatura: ${fmt(temp,'°C')}</span>
      <span class="rain">Opad: ${fmt(rain,' mm',1)} (${fmt(pop,'%')})</span>
      <span>Wiatr: ${fmt(wind,' km/h')} ${windDirectionLabel(dir)}</span>
      <span class="gust">Porywy: ${fmt(gust,' km/h')}</span>
      <span>Zachmurzenie: ${fmt(cloud,'%')}</span>
      <span>CAPE: ${fmt(cape,' J/kg')}</span>
    </div>`);
    circle.addTo(group);
  });

  forecastLayer=group.addTo(map);

  const [centerText,centerIcon]=codeInfo(data.hourly.weather_code[i]);
  const icon=L.divIcon({
    className:'forecast-center-icon',
    html:weatherIconHtml(centerIcon,'large'),
    iconSize:[96,76],
    iconAnchor:[48,38]
  });
  forecastCenterMarker=L.marker([centerLat,centerLon],{icon})
    .addTo(map)
    .bindPopup(`<strong>${currentPlace.name}</strong><br>${centerText}`);

  const dt=new Date(targetTime);
  document.getElementById('forecastMapLabel').innerHTML=
    `Prognoza modelowa dla <strong>${dt.toLocaleDateString('pl-PL',{weekday:'short',day:'2-digit',month:'2-digit'})} ${dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</strong>`;

  document.querySelector('.map-panel')?.classList.add('forecast-mode');
  document.getElementById('radarTime').textContent='Warstwa: prognoza Open‑Meteo';
}

async function switchMapMode(mode){
  mapMode=mode;
  document.querySelectorAll('.map-tab[data-layer]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.layer===mode);
  });

  if(mode==='forecast'){
    if(radarLayer){radarLayer.remove();radarLayer=null;}
    document.querySelector('.map-panel')?.classList.add('forecast-mode');
    if(currentWeatherData && selectedHourIndex!==null){
      renderForecastMapForHour(currentWeatherData,selectedHourIndex);
    }
  }else if(mode==='radar'){
    clearForecastLayer();
    document.querySelector('.map-panel')?.classList.remove('forecast-mode');
    document.getElementById('forecastMapLabel').textContent='Aktualna obserwacja radarowa';
    await loadRadar();
  }
}

async function initOrUpdateMap(place){
  if(!window.L) return;
  currentPlace=place;
  const lat=Number(place.latitude), lon=Number(place.longitude);
  if(!map){
    map=L.map('weatherMap',{zoomControl:true,attributionControl:true}).setView([lat,lon],7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'© OpenStreetMap contributors'
    }).addTo(map);
  }else{
    map.setView([lat,lon],7);
  }

  if(placeMarker){ placeMarker.remove(); placeMarker=null; }
  clearForecastLayer();
  if(radarLayer){ radarLayer.remove(); radarLayer=null; }

  setTimeout(()=>map.invalidateSize(),100);

  try{
    document.getElementById('forecastMapLabel').textContent='Pobieram prognozę przestrzenną dla okolicy…';
    await loadForecastGrid(place,currentWeatherData);
    if(selectedHourIndex!==null){
      renderForecastMapForHour(currentWeatherData,selectedHourIndex);
    }
  }catch(err){
    document.getElementById('forecastMapLabel').textContent='Nie udało się pobrać prognozy przestrzennej.';
  }
}

async function loadRadar(){
  if(!map) return;
  try{
    const res=await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if(!res.ok) throw new Error('Radar niedostępny');
    const data=await res.json();
    const frames=[...(data.radar?.past||[]),...(data.radar?.nowcast||[])];
    if(!frames.length) throw new Error('Brak klatek radaru');
    const frame=frames[frames.length-1];
    const host=data.host||'https://tilecache.rainviewer.com';
    if(radarLayer) radarLayer.remove();
    radarLayer=L.tileLayer(`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,{
      tileSize:256,opacity:.62,maxZoom:12,attribution:'Radar © RainViewer'
    }).addTo(map);
    document.getElementById('radarTime').textContent='Radar: '+new Date(frame.time*1000).toLocaleString('pl-PL');
  }catch(err){
    document.getElementById('radarTime').textContent='Radar chwilowo niedostępny';
  }
}

function renderPlace(place){
  document.getElementById('sidePlaceName').textContent=place.name||'—';
  document.getElementById('sidePlaceRegion').textContent=[place.admin1,place.country].filter(Boolean).join(', ');
  document.getElementById('sideUpdated').textContent='Ostatnia aktualizacja: '+new Date().toLocaleString('pl-PL');
}

async function runSearch(city){
  searchStatus.className='status';
  searchStatus.textContent='Wyszukuję lokalizację i pobieram dane…';
  try{
    const place=await findCity(city);
    const weather=await getWeather(place.latitude,place.longitude);
    currentWeatherData=weather;
    currentPlace=place;
    forecastGridData=null;
    renderPlace(place); renderCurrent(weather); renderHourly(weather); renderAnalysis(weather);
    emptyState.classList.add('hidden'); weatherSection.classList.remove('hidden');
    searchStatus.textContent='Dane pobrane poprawnie.';
    await initOrUpdateMap(place);
  }catch(err){
    searchStatus.className='status error';
    searchStatus.textContent=err?.message||'Wystąpił błąd pobierania danych.';
  }
}

searchForm.addEventListener('submit',e=>{
  e.preventDefault();
  const city=cityInput.value.trim();
  if(city) runSearch(city);
});
document.getElementById('changeCityBtn').addEventListener('click',()=>{
  cityInput.focus(); window.scrollTo({top:0,behavior:'smooth'});
});
document.getElementById('fullscreenBtn').addEventListener('click',()=>{
  if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.querySelectorAll('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
  document.getElementById(btn.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});
}));

document.querySelectorAll('.map-tab[data-layer]').forEach(btn=>{
  btn.addEventListener('click',()=>switchMapMode(btn.dataset.layer));
});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
