const intro = document.getElementById('intro');
const app = document.getElementById('app');
const skipIntro = document.getElementById('skipIntro');
const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const citySuggestions = document.getElementById('citySuggestions');
let suggestionTimer = null;
let suggestionResults = [];
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
let forecastGridMeta = null;
let forecastRasterValues = null;
let forecastInspectPopup = null;
let mapMode = 'forecast';
let mapRadiusCircle = null;
let baseMapLayer = null;
let baseMapFallbackLayer = null;
let mapTileErrorCount = 0;
let mapRefreshTimer = null;
let forecastGridRequestSeq = 0;
let suppressMapRefresh = false;

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


async function searchCities(name,count=8){
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name',name);url.searchParams.set('count',String(count));url.searchParams.set('language','pl');url.searchParams.set('format','json');
  const res=await fetch(url); if(!res.ok) throw new Error('Nie udało się wyszukać miejscowości.');
  const data=await res.json(); return data.results||[];
}
function placeLabel(place){return [place.name,place.admin1,place.admin2,place.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');}
function renderCitySuggestions(results){
  suggestionResults=results;
  if(!results.length){citySuggestions.classList.add('hidden');citySuggestions.innerHTML='';return;}
  citySuggestions.innerHTML=results.map((p,i)=>`<button type="button" class="city-suggestion" data-suggestion-index="${i}"><strong>${p.name||'—'}</strong><small>${[p.admin1,p.admin2,p.country].filter(Boolean).join(' • ')}</small></button>`).join('');
  citySuggestions.classList.remove('hidden');
  citySuggestions.querySelectorAll('.city-suggestion').forEach(btn=>btn.addEventListener('click',()=>{const p=suggestionResults[Number(btn.dataset.suggestionIndex)];citySuggestions.classList.add('hidden');cityInput.value=placeLabel(p);runPlace(p);}));
}
async function reverseLookupLocation(lat,lon){
  try{
    const url=new URL('https://nominatim.openstreetmap.org/reverse');url.searchParams.set('lat',lat);url.searchParams.set('lon',lon);url.searchParams.set('format','jsonv2');url.searchParams.set('zoom','10');url.searchParams.set('accept-language','pl');
    const res=await fetch(url,{headers:{'Accept':'application/json'}});if(!res.ok) throw new Error();const d=await res.json(),a=d.address||{};
    return {name:a.city||a.town||a.village||a.municipality||a.county||'Twoja lokalizacja',admin1:a.state||a.region||'',admin2:a.county||'',country:a.country||'',latitude:Number(lat),longitude:Number(lon)};
  }catch(_){return {name:'Twoja lokalizacja',admin1:'',admin2:'',country:'',latitude:Number(lat),longitude:Number(lon)};}
}
function requestAutomaticLocation(){
  if(!navigator.geolocation){searchStatus.textContent='Wpisz miejscowość — przeglądarka nie udostępnia lokalizacji.';return;}
  searchStatus.textContent='Pobieram Twoją lokalizację…';
  navigator.geolocation.getCurrentPosition(async pos=>{const place=await reverseLookupLocation(pos.coords.latitude,pos.coords.longitude);cityInput.value=placeLabel(place);runPlace(place);},()=>{searchStatus.textContent='Nie udało się pobrać lokalizacji. Wpisz miejscowość ręcznie.';},{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
}
async function findCity(name){
  const results=await searchCities(name,5);
  if(!results.length) throw new Error('Nie znaleziono takiej miejscowości.');
  return results[0];
}

async function getWeather(lat,lon){
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',lat); url.searchParams.set('longitude',lon); url.searchParams.set('timezone','auto'); url.searchParams.set('forecast_days','16');
  url.searchParams.set('current',[
    'temperature_2m','apparent_temperature','relative_humidity_2m','surface_pressure','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','visibility','cloud_cover','cape'
  ].join(','));
  url.searchParams.set('hourly',[
    'temperature_2m','apparent_temperature','precipitation_probability','precipitation','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','relative_humidity_2m','surface_pressure',
    'visibility','cloud_cover','cape'
  ].join(','));
  const res=await fetch(url);
  if(!res.ok){
    const text=await res.text().catch(()=> '');
    throw new Error(`Nie udało się pobrać prognozy (${res.status}). ${text}`.trim());
  }
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


function quarterIndicesForHourlyTimestamp(data,hourIndex){
  const q=data.quarter_hour?.minutely_15;
  const hourTime=data.hourly?.time?.[hourIndex];
  if(!q?.time?.length || !hourTime) return [];

  const endMs=new Date(hourTime).getTime();
  const startMs=endMs-60*60*1000;

  // Każdy punkt 15-min opisuje POPRZEDNIE 15 minut.
  // Dla godziny 15:00 potrzebujemy rekordów kończących się:
  // 14:15, 14:30, 14:45, 15:00.
  return q.time
    .map((t,i)=>({i,ms:new Date(t).getTime()}))
    .filter(x=>x.ms>startMs && x.ms<=endMs)
    .sort((a,b)=>a.ms-b.ms)
    .slice(-4)
    .map(x=>x.i);
}

function quarterSumForHourlyTimestamp(data,hourIndex){
  const q=data.quarter_hour?.minutely_15;
  const ids=quarterIndicesForHourlyTimestamp(data,hourIndex);
  if(!q || ids.length!==4) return null;

  const vals=ids.map(i=>Number(q.precipitation?.[i]));
  if(vals.some(v=>!Number.isFinite(v))) return null;
  return vals.reduce((a,b)=>a+b,0);
}

function effectiveHourlyPrecipitation(data,hourIndex){
  const qsum=quarterSumForHourlyTimestamp(data,hourIndex);
  if(qsum!==null) return qsum;
  return Number(data.hourly?.precipitation?.[hourIndex] ?? 0);
}

function formatIntervalEnd(endTime){
  const end=new Date(endTime);
  const start=new Date(end.getTime()-15*60*1000);
  const fmtTime=d=>d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  return `${fmtTime(start)}–${fmtTime(end)}`;
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
      <div class="hline rainline">💧 ${fmt(effectiveHourlyPrecipitation(data,i),' mm',1)}</div>
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



async function fetchQuarter15(url,variables){
  const req=new URL(url);
  req.searchParams.set('minutely_15',variables.join(','));
  const res=await fetch(req);
  if(!res.ok){
    const text=await res.text().catch(()=> '');
    const err=new Error(`15-min API ${res.status}: ${text}`.trim());
    err.status=res.status;
    throw err;
  }
  const data=await res.json();
  if(!data?.minutely_15?.time?.length){
    throw new Error('API nie zwróciło szeregu minutely_15.');
  }
  return data;
}

async function getQuarterHourWeather(lat,lon,timezone='auto'){
  // v1011: główny endpoint Open-Meteo jako źródło danych 15-min.
  // Najpierw próbujemy pełny zestaw. Gdy któryś parametr/model
  // nie jest dostępny, automatycznie schodzimy do zestawu podstawowego.
  const base=new URL('https://api.open-meteo.com/v1/forecast');
  base.searchParams.set('latitude',lat);
  base.searchParams.set('longitude',lon);
  base.searchParams.set('timezone',timezone||'auto');
  base.searchParams.set('forecast_minutely_15','192'); // 48 godzin

  const richVars=[
    'temperature_2m',
    'apparent_temperature',
    'precipitation',
    'rain',
    'snowfall',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'cape'
  ];

  const coreVars=[
    'temperature_2m',
    'precipitation',
    'rain',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
  ];

  try{
    const data=await fetchQuarter15(base.toString(),richVars);
    data._quarter_source='Open-Meteo 15-min (pełny)';
    return data;
  }catch(fullErr){
    const data=await fetchQuarter15(base.toString(),coreVars);
    data._quarter_source='Open-Meteo 15-min (podstawowy)';
    data._quarter_warning=fullErr?.message||'Pełny zestaw 15-min był niedostępny.';
    return data;
  }
}

async function getLightning15Dwd(lat,lon,timezone='auto'){
  // Opcjonalne źródło tylko dla CAPE/LPI.
  // Jego błąd nigdy nie blokuje sekcji 15-min.
  const url=new URL('https://api.open-meteo.com/v1/dwd-icon');
  url.searchParams.set('latitude',lat);
  url.searchParams.set('longitude',lon);
  url.searchParams.set('timezone',timezone||'auto');
  url.searchParams.set('forecast_minutely_15','192');
  url.searchParams.set('minutely_15',['cape','lightning_potential_index'].join(','));

  const res=await fetch(url);
  if(!res.ok) return null;
  const data=await res.json().catch(()=>null);
  return data?.minutely_15?.time?.length ? data : null;
}

function mergeQuarterHourData(base,dwd){
  if(!base?.minutely_15?.time?.length) return base;
  const q=base.minutely_15;
  const times=q.time||[];

  if(dwd?.minutely_15?.time?.length){
    const map=new Map();
    dwd.minutely_15.time.forEach((t,i)=>map.set(String(t),i));

    q.lightning_potential_index=times.map((t,i)=>{
      const di=map.get(String(t));
      return di===undefined ? (q.lightning_potential_index?.[i] ?? null)
                            : (dwd.minutely_15.lightning_potential_index?.[di] ?? null);
    });

    q.cape=times.map((t,i)=>{
      const di=map.get(String(t));
      const dwdCape=di===undefined ? null : dwd.minutely_15.cape?.[di];
      return dwdCape ?? q.cape?.[i] ?? null;
    });

    base._storm_source='DWD ICON-D2 CAPE/LPI';
  }else{
    base._storm_source='brak dodatkowego LPI';
  }
  return base;
}

function lerp(a,b,t){
  a=Number(a); b=Number(b);
  if(!Number.isFinite(a) && !Number.isFinite(b)) return null;
  if(!Number.isFinite(a)) return b;
  if(!Number.isFinite(b)) return a;
  return a+(b-a)*t;
}

function hourIndexForTime(hourly,targetMs){
  const times=hourly?.time||[];
  if(!times.length) return {i0:0,i1:0,t:0};

  let i0=0;
  for(let i=0;i<times.length;i++){
    if(new Date(times[i]).getTime()<=targetMs) i0=i;
    else break;
  }
  const i1=Math.min(i0+1,times.length-1);
  const t0=new Date(times[i0]).getTime();
  const t1=new Date(times[i1]).getTime();
  const t=t1===t0 ? 0 : Math.max(0,Math.min(1,(targetMs-t0)/(t1-t0)));
  return {i0,i1,t};
}

function interpolateHourlyValue(hourly,field,targetMs){
  const {i0,i1,t}=hourIndexForTime(hourly,targetMs);
  return lerp(hourly?.[field]?.[i0],hourly?.[field]?.[i1],t);
}

function interpolateWindDirection(hourly,targetMs){
  const {i0,i1,t}=hourIndexForTime(hourly,targetMs);
  const a=Number(hourly?.wind_direction_10m?.[i0]);
  const b=Number(hourly?.wind_direction_10m?.[i1]);
  if(!Number.isFinite(a)) return Number.isFinite(b)?b:null;
  if(!Number.isFinite(b)) return a;

  // interpolacja kąta najkrótszą drogą przez 0/360
  let diff=((b-a+540)%360)-180;
  return (a+diff*t+360)%360;
}

function lightningRisk15(cape,lpi,code){
  cape=Number(cape||0);
  lpi=Number(lpi||0);
  code=Number(code||0);
  if([95,96,99].includes(code) || lpi>=2.5 || cape>=1500) return {label:'WYSOKIE',className:'high'};
  if(lpi>=0.5 || cape>=500) return {label:'UMIARKOWANE',className:'medium'};
  return {label:'NISKIE',className:'low'};
}


function estimatedStormProbability(cape,lpi,weatherCode){
  const c=Number(cape||0),l=Number(lpi||0),code=Number(weatherCode||0);if([95,96,99].includes(code))return 90;let p=0;
  if(c>=2000)p+=55;else if(c>=1200)p+=42;else if(c>=700)p+=30;else if(c>=300)p+=18;else if(c>=100)p+=7;
  if(l>=3)p+=35;else if(l>=2)p+=25;else if(l>=1)p+=15;else if(l>=0.3)p+=7;return Math.min(95,Math.round(p));
}
function renderQuarterHourDetails(data,hourIndex){
  const q=data.quarter_hour?.minutely_15;
  const container=document.getElementById('quarterHourCards');
  const range=document.getElementById('quarterHourRange');

  if(!q?.time?.length){
    range.textContent='brak danych';
    container.removeAttribute('data-source');
    container.innerHTML='<div class="quarter-hour-empty">Nie udało się pobrać danych 15-minutowych.</div>';
    return;
  }

  const selected=quarterIndicesForHourlyTimestamp(data,hourIndex);

  if(selected.length!==4){
    range.textContent='brak pełnej godziny';
    container.innerHTML='<div class="quarter-hour-empty">Brak pełnych czterech przedziałów 15-minutowych dla tej godziny.</div>';
    return;
  }

  const hourEnd=new Date(data.hourly.time[hourIndex]);
  const hourStart=new Date(hourEnd.getTime()-60*60*1000);
  const ft=d=>d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  range.textContent=`${ft(hourStart)}–${ft(hourEnd)}`;

  container.dataset.source=data.quarter_hour?._quarter_source||'Open-Meteo 15-min';

  const sum=selected.reduce((acc,j)=>acc+Number(q.precipitation?.[j] ?? 0),0);

  container.innerHTML=selected.map(j=>{
    const dt=new Date(q.time[j]);
    const targetMs=dt.getTime();

    const wind=q.wind_speed_10m?.[j] ??
      interpolateHourlyValue(data.hourly,'wind_speed_10m',targetMs);

    const precip=Number(q.precipitation?.[j] ?? 0);
    const cape=q.cape?.[j];
    const lpi=q.lightning_potential_index?.[j];
    const code=q.weather_code?.[j];
    const stormProb=estimatedStormProbability(cape,lpi,code);

    const stormClass=
      stormProb>=60 ? 'q-storm-high' :
      stormProb>=30 ? 'q-storm-medium' :
      'q-storm-low';

    return `
      <article class="q15-card">
        <div class="q15-time">${formatIntervalEnd(q.time[j])}</div>

        <div class="q15-row">
          <div class="q15-icon q15-rain">💧</div>
          <div class="q15-copy">
            <span>Opad w tym przedziale</span>
            <strong class="q15-rain-value">${fmt(precip,' mm',2)}</strong>
          </div>
        </div>

        <div class="q15-row">
          <div class="q15-icon q15-wind">≋</div>
          <div class="q15-copy">
            <span>Wiatr</span>
            <strong>${fmt(wind,' km/h',1)}</strong>
          </div>
        </div>

        <div class="q15-row">
          <div class="q15-icon q15-storm">ϟ</div>
          <div class="q15-copy">
            <span>Burza — prawdopodobieństwo</span>
            <strong class="${stormClass}">${stormProb}%</strong>
          </div>
        </div>
      </article>`;
  }).join('');

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="q15-note"><strong>Suma opadu ${ft(hourStart)}–${ft(hourEnd)}: ${fmt(sum,' mm',2)}</strong>. `+
    `Ta sama suma jest używana w kaflu godzinowym dla ${ft(hourEnd)}. `+
    `Prawdopodobieństwo burzy jest szacunkiem aplikacji na podstawie CAPE, LPI i kodu pogody; nie jest oficjalnym procentem IMGW.</div>`
  );
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
  document.getElementById('detailRain').textContent=fmt(effectiveHourlyPrecipitation(data,i),' mm',2);
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
  renderQuarterHourDetails(data,i);
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


function kmDistance(lat1,lon1,lat2,lon2){
  const R=6371,toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function stormGrid50km(place){
  const lat=Number(place.latitude),lon=Number(place.longitude);
  const latD=50/111.32;
  const lonD=50/(111.32*Math.max(.25,Math.cos(lat*Math.PI/180)));
  const steps=[-1,-.5,0,.5,1];
  const pts=[];
  steps.forEach(y=>steps.forEach(x=>{
    const p={lat:lat+y*latD,lon:lon+x*lonD};
    const dist=kmDistance(lat,lon,p.lat,p.lon);
    if(dist<=51) pts.push({...p,dist});
  }));
  return pts;
}

async function getStormArea50km(place,timezone='auto'){
  const pts=stormGrid50km(place);
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',pts.map(p=>p.lat.toFixed(4)).join(','));
  url.searchParams.set('longitude',pts.map(p=>p.lon.toFixed(4)).join(','));
  url.searchParams.set('timezone',timezone||'auto');
  url.searchParams.set('forecast_minutely_15','8');
  url.searchParams.set('minutely_15',[
    'weather_code','cape','lightning_potential_index','precipitation'
  ].join(','));

  let res=await fetch(url);
  if(!res.ok){
    // Fallback bez LPI – reszta analizy nadal działa.
    const fallback=new URL('https://api.open-meteo.com/v1/forecast');
    fallback.searchParams.set('latitude',pts.map(p=>p.lat.toFixed(4)).join(','));
    fallback.searchParams.set('longitude',pts.map(p=>p.lon.toFixed(4)).join(','));
    fallback.searchParams.set('timezone',timezone||'auto');
    fallback.searchParams.set('forecast_minutely_15','8');
    fallback.searchParams.set('minutely_15',['weather_code','cape','precipitation'].join(','));
    res=await fetch(fallback);
  }
  if(!res.ok) throw new Error('Brak analizy burzowej 50 km');

  const raw=await res.json();
  const arr=Array.isArray(raw)?raw:[raw];

  let best={risk:0,cape:0,lpi:null,dist:0,time:null,precip:0};
  arr.forEach((entry,pi)=>{
    const q=entry.minutely_15||{};
    (q.time||[]).forEach((t,i)=>{
      const cape=Number(q.cape?.[i]||0);
      const lpi=q.lightning_potential_index?.[i];
      const code=q.weather_code?.[i];
      const risk=estimatedStormProbability(cape,lpi,code);
      if(risk>best.risk){
        best={
          risk,
          cape,
          lpi:lpi==null?null:Number(lpi),
          dist:Math.round(pts[pi]?.dist||0),
          time:t,
          precip:Number(q.precipitation?.[i]||0)
        };
      }
    });
  });
  return best;
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
  else parts.push(`Potencjał konwekcyjny w samym punkcie lokalizacji pozostaje niski (maks. CAPE około ${Math.round(maxCape)} J/kg).`);

  const area=data.storm_area_50km;
  if(area){
    const when=area.time?new Date(area.time).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'—';
    if(area.risk>=30){
      parts.push(`W promieniu 50 km najwyższe szacowane ryzyko burzy w najbliższych 2 godzinach wynosi około ${area.risk}% (około ${area.dist} km od lokalizacji, w pobliżu ${when}).`);
    }else{
      parts.push(`W promieniu 50 km nie widać obecnie wyraźnego sygnału burzowego; najwyższe szacowane ryzyko w najbliższych 2 godzinach to około ${area.risk}%.`);
    }
  }

  document.getElementById('analysisText').textContent=parts.join(' ');
  document.getElementById('modelTempPreview').textContent=fmt(data.current.temperature_2m,'°C');
  document.getElementById('modelRainPreview').textContent=fmt(rainSum,' mm',1);
  document.getElementById('modelWindPreview').textContent=fmt(maxGust,' km/h');
}


function precipitationRGBA(mm,pop){
  mm=Number(mm||0);
  pop=Number(pop||0);

  // Suche miejsca są całkowicie przezroczyste.
  if(mm < 0.05){
    if(pop < 35) return [0,0,0,0];
    return [35,157,255,Math.round(Math.min(42,10+pop*.28))];
  }

  let c;
  if(mm < 0.3) c=[32,186,255];
  else if(mm < 1) c=[25,215,196];
  else if(mm < 2) c=[134,220,67];
  else if(mm < 4) c=[241,223,57];
  else if(mm < 8) c=[255,156,47];
  else c=[255,53,71];

  const alpha=Math.round(Math.min(205,70+Math.log1p(mm)*72+pop*.35));
  return [...c,alpha];
}


function paddedMapBounds(bounds,padRatio=.28){
  const south=bounds.getSouth(), north=bounds.getNorth();
  const west=bounds.getWest(), east=bounds.getEast();
  const latPad=(north-south)*padRatio;
  const lonPad=(east-west)*padRatio;
  return {
    south:south-latPad,
    north:north+latPad,
    west:west-lonPad,
    east:east+lonPad
  };
}

function buildForecastGridForBounds(bounds){
  const b=paddedMapBounds(bounds,.30);
  const rows=7,cols=7,points=[];
  for(let r=0;r<rows;r++){
    const lat=b.south+(b.north-b.south)*(r/(rows-1));
    for(let c=0;c<cols;c++){
      const lon=b.west+(b.east-b.west)*(c/(cols-1));
      points.push({lat,lon});
    }
  }
  forecastGridMeta={
    rows,cols,
    minLat:b.south,maxLat:b.north,
    minLon:b.west,maxLon:b.east
  };
  return points;
}

async function loadForecastGrid(place,weather,boundsOverride=null){
  if(!map) return [];
  const bounds=boundsOverride||map.getBounds();
  const points=buildForecastGridForBounds(bounds);
  const requestSeq=++forecastGridRequestSeq;

  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',points.map(p=>p.lat.toFixed(4)).join(','));
  url.searchParams.set('longitude',points.map(p=>p.lon.toFixed(4)).join(','));
  url.searchParams.set('hourly',[
    'temperature_2m','precipitation','precipitation_probability','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','cloud_cover','cape'
  ].join(','));
  url.searchParams.set('forecast_days','3');
  url.searchParams.set('timezone',weather?.timezone||'auto');

  const res=await fetch(url);
  if(!res.ok) throw new Error('Nie udało się pobrać mapy prognozy.');
  const data=await res.json();

  // Ignorujemy starszą odpowiedź, jeżeli użytkownik zdążył przesunąć mapę.
  if(requestSeq!==forecastGridRequestSeq) return [];

  const arr=Array.isArray(data)?data:[data];
  forecastGridData=arr.map((entry,idx)=>({point:points[idx],data:entry}));
  return forecastGridData;
}

async function refreshForecastForVisibleMap(){
  if(!map || mapMode!=='forecast' || !currentWeatherData || selectedHourIndex===null) return;
  try{
    document.getElementById('forecastMapLabel').innerHTML=
      '<span>Aktualizuję prognozę dla widocznego obszaru…</span><span class="map-kind">OPADY</span>';
    const loaded=await loadForecastGrid(currentPlace,currentWeatherData,map.getBounds());
    if(loaded?.length) renderForecastMapForHour(currentWeatherData,selectedHourIndex);
  }catch(_){
    document.getElementById('forecastMapLabel').textContent='Nie udało się odświeżyć warstwy prognozy.';
  }
}

function scheduleForecastMapRefresh(){
  clearTimeout(mapRefreshTimer);
  mapRefreshTimer=setTimeout(refreshForecastForVisibleMap,350);
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
  if(forecastInspectPopup){ map?.closePopup(forecastInspectPopup); forecastInspectPopup=null; }
}

function bilerp(v00,v10,v01,v11,tx,ty){
  const a=v00*(1-tx)+v10*tx;
  const b=v01*(1-tx)+v11*tx;
  return a*(1-ty)+b*ty;
}

function collectGridValues(targetTime){
  const rows=forecastGridMeta.rows, cols=forecastGridMeta.cols;
  const rain=Array.from({length:rows},()=>Array(cols).fill(0));
  const pop=Array.from({length:rows},()=>Array(cols).fill(0));

  forecastGridData.forEach((item,idx)=>{
    const r=Math.floor(idx/cols);
    const c=idx%cols;
    const hi=findGridHourIndex(item.data,targetTime);
    rain[r][c]=Number(item.data.hourly?.precipitation?.[hi]||0);
    pop[r][c]=Number(item.data.hourly?.precipitation_probability?.[hi]||0);
  });

  return {rain,pop};
}

function sampleForecastField(lat,lon,values){
  const m=forecastGridMeta;
  if(!m || !values) return {rain:0,pop:0};

  const rowPos=(lat-m.minLat)/(m.maxLat-m.minLat)*(m.rows-1);
  const colPos=(lon-m.minLon)/(m.maxLon-m.minLon)*(m.cols-1);

  const rp=Math.max(0,Math.min(m.rows-1,rowPos));
  const cp=Math.max(0,Math.min(m.cols-1,colPos));
  const r0=Math.min(m.rows-2,Math.floor(rp));
  const c0=Math.min(m.cols-2,Math.floor(cp));
  const r1=r0+1,c1=c0+1;
  const ty=rp-r0,tx=cp-c0;

  return {
    rain:bilerp(values.rain[r0][c0],values.rain[r0][c1],values.rain[r1][c0],values.rain[r1][c1],tx,ty),
    pop:bilerp(values.pop[r0][c0],values.pop[r0][c1],values.pop[r1][c0],values.pop[r1][c1],tx,ty)
  };
}

function createForecastRaster(values){
  const W=360,H=360;
  const canvas=document.createElement('canvas');
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  const image=ctx.createImageData(W,H);
  const rows=forecastGridMeta.rows,cols=forecastGridMeta.cols;

  for(let y=0;y<H;y++){
    // canvas: góra = północ, tablica: większy indeks = północ
    const rowPos=(1-y/(H-1))*(rows-1);
    const r0=Math.min(rows-2,Math.floor(rowPos));
    const r1=r0+1;
    const ty=rowPos-r0;

    for(let x=0;x<W;x++){
      const colPos=(x/(W-1))*(cols-1);
      const c0=Math.min(cols-2,Math.floor(colPos));
      const c1=c0+1;
      const tx=colPos-c0;

      let rain=bilerp(
        values.rain[r0][c0],values.rain[r0][c1],
        values.rain[r1][c0],values.rain[r1][c1],tx,ty
      );
      let pop=bilerp(
        values.pop[r0][c0],values.pop[r0][c1],
        values.pop[r1][c0],values.pop[r1][c1],tx,ty
      );

      // delikatne wygaszenie bardzo słabych śladów
      if(rain<0.08 && pop<45) rain=0;

      let [r,g,b,a]=precipitationRGBA(rain,pop);

      // v1014: wygaszenie na wszystkich krawędziach siatki,
      // żeby warstwa nie kończyła się prostym prostokątem.
      const dx=Math.min(x/(W-1),(W-1-x)/(W-1));
      const dy=Math.min(y/(H-1),(H-1-y)/(H-1));
      const edge=Math.min(dx,dy);
      const fade=Math.max(0,Math.min(1,edge/0.16));
      a=Math.round(a*fade);

      const p=(y*W+x)*4;
      image.data[p]=r;image.data[p+1]=g;image.data[p+2]=b;image.data[p+3]=a;
    }
  }
  ctx.putImageData(image,0,0);
  return canvas.toDataURL('image/png');
}

function renderForecastMapForHour(data,i){
  if(!map || !forecastGridData?.length || !forecastGridMeta) return;
  if(mapMode!=='forecast') return;

  clearForecastLayer();
  if(radarLayer){ radarLayer.remove(); radarLayer=null; }

  const targetTime=data.hourly.time[i];
  forecastRasterValues=collectGridValues(targetTime);
  const rasterUrl=createForecastRaster(forecastRasterValues);

  const bounds=[
    [forecastGridMeta.minLat,forecastGridMeta.minLon],
    [forecastGridMeta.maxLat,forecastGridMeta.maxLon]
  ];

  forecastLayer=L.imageOverlay(rasterUrl,bounds,{
    opacity:.64,
    interactive:false,
    className:'forecast-raster'
  }).addTo(map);

  const centerLat=Number(currentPlace.latitude),centerLon=Number(currentPlace.longitude);
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
    `<span>Prognoza modelowa dla <strong>${dt.toLocaleDateString('pl-PL',{weekday:'short',day:'2-digit',month:'2-digit'})} ${dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</strong></span><span class="map-kind">OPADY</span>`;

  document.querySelector('.map-panel')?.classList.add('forecast-mode');
  document.getElementById('radarTime').textContent='Warstwa: płynna prognoza opadów Open‑Meteo';

  if(!map._meteoInspectBound){
    map.on('click',e=>{
      if(mapMode!=='forecast' || !forecastRasterValues) return;
      const s=sampleForecastField(e.latlng.lat,e.latlng.lng,forecastRasterValues);
      forecastInspectPopup=L.popup()
        .setLatLng(e.latlng)
        .setContent(`<div class="map-inspect-popup">
          <strong>Prognoza dla tego miejsca</strong>
          <span class="rain">Opad: ${fmt(s.rain,' mm',1)}</span>
          <span>Prawdopodobieństwo: ${fmt(s.pop,'%')}</span>
        </div>`)
        .openOn(map);
    });
    map._meteoInspectBound=true;
  }
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
    if(!baseMapLayer && !baseMapFallbackLayer) attachBaseMapWithFallback();
    map.invalidateSize(false);
    await loadRadar();
    map.invalidateSize(false);
  }
}



function clearMapTileWarning(){
  document.querySelector('#weatherMap .map-tile-warning')?.remove();
}

function showMapTileWarning(text){
  clearMapTileWarning();
  const el=document.createElement('div');
  el.className='map-tile-warning';
  el.textContent=text;
  document.getElementById('weatherMap')?.appendChild(el);
}

function removeBaseLayers(){
  if(baseMapLayer && map?.hasLayer(baseMapLayer)) map.removeLayer(baseMapLayer);
  if(baseMapFallbackLayer && map?.hasLayer(baseMapFallbackLayer)) map.removeLayer(baseMapFallbackLayer);
  baseMapLayer=null;
  baseMapFallbackLayer=null;
  mapTileErrorCount=0;
}

function createPrimaryBaseLayer(){
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    minZoom:3,
    maxNativeZoom:19,
    maxZoom:19,
    tileSize:256,
    zoomOffset:0,
    updateWhenIdle:false,
    updateWhenZooming:true,
    keepBuffer:4,
    attribution:'© OpenStreetMap contributors'
  });
}

function createFallbackBaseLayer(){
  return L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',{
    subdomains:'abc',
    minZoom:3,
    maxNativeZoom:20,
    maxZoom:20,
    tileSize:256,
    zoomOffset:0,
    updateWhenIdle:false,
    updateWhenZooming:true,
    keepBuffer:4,
    attribution:'© OpenStreetMap contributors'
  });
}

function attachBaseMapWithFallback(){
  if(!map) return;

  removeBaseLayers();
  clearMapTileWarning();

  let fallbackStarted=false;
  let primaryLoaded=false;
  let tileErrors=0;

  baseMapLayer=createPrimaryBaseLayer();

  baseMapLayer.on('tileload',()=>{
    primaryLoaded=true;
    tileErrors=0;
    clearMapTileWarning();
  });

  baseMapLayer.on('tileerror',()=>{
    tileErrors++;
    if(tileErrors>=3 && !fallbackStarted && !primaryLoaded){
      fallbackStarted=true;

      if(map.hasLayer(baseMapLayer)) map.removeLayer(baseMapLayer);
      baseMapFallbackLayer=createFallbackBaseLayer();

      let fallbackErrors=0;
      baseMapFallbackLayer.on('tileload',()=>{
        clearMapTileWarning();
      });
      baseMapFallbackLayer.on('tileerror',()=>{
        fallbackErrors++;
        if(fallbackErrors>=3){
          showMapTileWarning('Mapa bazowa nie może pobrać kafelków. Sprawdź połączenie lub blokowanie treści w przeglądarce.');
        }
      });

      baseMapFallbackLayer.addTo(map);
    }
  });

  baseMapLayer.addTo(map);

  // Jeśli serwer nie zwróci ani błędu, ani kafelka, po chwili przełącz awaryjnie.
  setTimeout(()=>{
    if(!primaryLoaded && !fallbackStarted && map){
      fallbackStarted=true;
      if(baseMapLayer && map.hasLayer(baseMapLayer)) map.removeLayer(baseMapLayer);
      baseMapFallbackLayer=createFallbackBaseLayer();
      baseMapFallbackLayer.on('tileload',clearMapTileWarning);
      baseMapFallbackLayer.addTo(map);
    }
  },1800);
}

function boundsForRadiusKm(lat,lon,km=50){
  const latDelta=km/111.32;
  const lonDelta=km/(111.32*Math.max(.25,Math.cos(lat*Math.PI/180)));
  return L.latLngBounds(
    [lat-latDelta,lon-lonDelta],
    [lat+latDelta,lon+lonDelta]
  );
}

function fitMapTo50km(lat,lon){
  if(!map) return;

  if(mapRadiusCircle){
    map.removeLayer(mapRadiusCircle);
    mapRadiusCircle=null;
  }

  mapRadiusCircle=L.circle([lat,lon],{
    radius:50000,
    color:'#35b9ff',
    weight:1.2,
    dashArray:'5 5',
    fill:false,
    interactive:false
  }).addTo(map);

  const bounds=boundsForRadiusKm(lat,lon,50);
  map.fitBounds(bounds,{
    padding:[18,18],
    animate:false,
    maxZoom:10
  });
}

async function initOrUpdateMap(place){
  if(!window.L) return;

  currentPlace=place;
  const lat=Number(place.latitude);
  const lon=Number(place.longitude);
  const container=document.getElementById('weatherMap');
  if(!container) return;

  weatherSection?.classList.remove('hidden');
  container.style.display='block';

  if(!map){
    map=L.map('weatherMap',{
      zoomControl:true,
      attributionControl:true,
      minZoom:3,
      maxZoom:18,
      preferCanvas:false,
      zoomAnimation:true
    });

    // KRYTYCZNE: ustawiamy widok zanim dokładamy kafelki.
    map.setView([lat,lon],8,{animate:false});
    attachBaseMapWithFallback();

    map.on('moveend zoomend',()=>{
      if(suppressMapRefresh) return;
      if(mapMode==='forecast') scheduleForecastMapRefresh();
    });
  }else{
    map.setView([lat,lon],8,{animate:false});
    if(!baseMapLayer && !baseMapFallbackLayer){
      attachBaseMapWithFallback();
    }
  }

  suppressMapRefresh=true;

  clearForecastLayer();
  if(radarLayer){
    map.removeLayer(radarLayer);
    radarLayer=null;
  }
  if(placeMarker){
    map.removeLayer(placeMarker);
    placeMarker=null;
  }

  placeMarker=L.marker([lat,lon])
    .addTo(map)
    .bindPopup(`<strong>${place.name}</strong>`);

  // Najpierw wymuszamy realny rozmiar, potem zakres 50 km.
  requestAnimationFrame(()=>{
    map.invalidateSize(false);
    fitMapTo50km(lat,lon);
  });

  setTimeout(()=>{
    map.invalidateSize(false);
    fitMapTo50km(lat,lon);
    suppressMapRefresh=false;
  },250);

  try{
    document.getElementById('forecastMapLabel').textContent='Pobieram prognozę dla obszaru mapy…';
    await new Promise(resolve=>setTimeout(resolve,320));

    await loadForecastGrid(place,currentWeatherData,map.getBounds());

    if(selectedHourIndex!==null){
      renderForecastMapForHour(currentWeatherData,selectedHourIndex);
    }

    map.invalidateSize(false);
  }catch(_){
    document.getElementById('forecastMapLabel').textContent='Mapa bazowa działa; warstwa prognozy jest chwilowo niedostępna.';
  }
}

async function loadRadar(){
  if(!map) return;
  map.invalidateSize(false);
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
      tileSize:256,
      opacity:.68,
      minZoom:3,
      maxNativeZoom:7,
      maxZoom:18,
      keepBuffer:6,
      updateWhenZooming:true,
      updateWhenIdle:false,
      crossOrigin:true,
      attribution:'Radar © RainViewer'
    }).addTo(map);
    document.getElementById('radarTime').textContent='Radar: '+new Date(frame.time*1000).toLocaleString('pl-PL');
    map.invalidateSize(false);
    radarLayer.redraw?.();
  }catch(err){
    document.getElementById('radarTime').textContent='Radar chwilowo niedostępny';
  }
}

function renderPlace(place){
  document.getElementById('sidePlaceName').textContent=place.name||'—';
  document.getElementById('sidePlaceRegion').textContent=[place.admin1,place.country].filter(Boolean).join(', ');
  document.getElementById('sideUpdated').textContent='Ostatnia aktualizacja: '+new Date().toLocaleString('pl-PL');
  const label=document.getElementById('currentLocationLabel');
  if(label) label.textContent=[place.name,place.admin1,place.country].filter(Boolean).join(', ');
}



function getDailyDates(data){
  const times=data.hourly?.time||[];
  const seen=new Set();
  const out=[];
  times.forEach(t=>{
    const key=String(t).slice(0,10);
    if(!seen.has(key)){seen.add(key);out.push(key);}
  });
  return out;
}

function indicesForDate(data,dateKey){
  const times=data.hourly?.time||[];
  const ids=[];
  times.forEach((t,i)=>{
    if(String(t).slice(0,10)===dateKey) ids.push(i);
  });
  return ids;
}

function aggregateDay(data,dateKey){
  const h=data.hourly;
  const ids=indicesForDate(data,dateKey);
  if(!ids.length) return null;

  const temps=ids.map(i=>Number(h.temperature_2m?.[i])).filter(Number.isFinite);
  const pops=ids.map(i=>Number(h.precipitation_probability?.[i]||0));
  const rains=ids.map(i=>effectiveHourlyPrecipitation(data,i));
  const gusts=ids.map(i=>Number(h.wind_gusts_10m?.[i]||0));
  const winds=ids.map(i=>Number(h.wind_speed_10m?.[i]||0));
  const capes=ids.map(i=>Number(h.cape?.[i]||0));
  const codes=ids.map(i=>Number(h.weather_code?.[i]||0));

  const stormProbs=ids.map((i,idx)=>estimatedStormProbability(capes[idx],null,codes[idx]));

  return {
    ids,
    minTemp:temps.length?Math.min(...temps):null,
    maxTemp:temps.length?Math.max(...temps):null,
    maxPop:Math.max(...pops,0),
    rainSum:rains.reduce((a,b)=>a+Number(b||0),0),
    maxGust:Math.max(...gusts,0),
    avgWind:winds.length?winds.reduce((a,b)=>a+b,0)/winds.length:0,
    maxCape:Math.max(...capes,0),
    maxStorm:Math.max(...stormProbs,0),
    codes
  };
}

function describeStorm(prob){
  if(prob>=70) return 'wysokie';
  if(prob>=40) return 'umiarkowane';
  if(prob>=15) return 'niskie, ale zauważalne';
  return 'niskie';
}

function describeRainProbability(pop){
  if(pop>=80) return 'bardzo wysokie';
  if(pop>=60) return 'wysokie';
  if(pop>=35) return 'umiarkowane';
  if(pop>=15) return 'niewielkie';
  return 'małe';
}

function periodIndices(data,dateKey,startHour,endHour){
  const h=data.hourly;
  const ids=[];
  h.time.forEach((t,i)=>{
    if(String(t).slice(0,10)!==dateKey) return;
    const hour=Number(String(t).slice(11,13));
    if(startHour<=endHour){
      if(hour>=startHour && hour<endHour) ids.push(i);
    }else{
      if(hour>=startHour || hour<endHour) ids.push(i);
    }
  });
  return ids;
}

function summarizePeriod(data,ids,label){
  if(!ids.length) return `<h3>${label}</h3><p>Brak danych.</p>`;
  const h=data.hourly;
  const temps=ids.map(i=>Number(h.temperature_2m?.[i])).filter(Number.isFinite);
  const pops=ids.map(i=>Number(h.precipitation_probability?.[i]||0));
  const gusts=ids.map(i=>Number(h.wind_gusts_10m?.[i]||0));
  const codes=ids.map(i=>Number(h.weather_code?.[i]||0));
  const capes=ids.map(i=>Number(h.cape?.[i]||0));
  const rains=ids.map(i=>effectiveHourlyPrecipitation(data,i));
  const storm=Math.max(...ids.map((i,k)=>estimatedStormProbability(capes[k],null,codes[k])),0);
  const minT=temps.length?Math.min(...temps):null;
  const maxT=temps.length?Math.max(...temps):null;
  const pop=Math.max(...pops,0);
  const rain=rains.reduce((a,b)=>a+Number(b||0),0);
  const gust=Math.max(...gusts,0);

  return `<h3>${label}</h3><p>
    Temperatura ${fmt(minT,'°C')}–${fmt(maxT,'°C')}. 
    Prawdopodobieństwo opadu do ${Math.round(pop)}%, suma około ${rain.toFixed(1)} mm. 
    Porywy do ${Math.round(gust)} km/h. 
    Ryzyko burz około ${Math.round(storm)}%.
  </p>`;
}

function buildDailyNarrative(data,dateKey){
  const day=aggregateDay(data,dateKey);
  if(!day) return 'Brak danych dla wybranego dnia.';

  const ids=day.ids;
  const h=data.hourly;
  let firstRain=null,lastRain=null,strongestRain=null,strongestPop=-1;
  let strongestWind=null,maxGust=-1;
  let strongestStorm=null,maxStorm=-1;

  ids.forEach(i=>{
    const pop=Number(h.precipitation_probability?.[i]||0);
    if(pop>=30){
      if(firstRain===null) firstRain=i;
      lastRain=i;
    }
    if(pop>strongestPop){strongestPop=pop;strongestRain=i;}

    const gust=Number(h.wind_gusts_10m?.[i]||0);
    if(gust>maxGust){maxGust=gust;strongestWind=i;}

    const storm=estimatedStormProbability(h.cape?.[i],null,h.weather_code?.[i]);
    if(storm>maxStorm){maxStorm=storm;strongestStorm=i;}
  });

  const timeOf=i=>i==null?'—':new Date(h.time[i]).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});

  let text=`<strong>Temperatura:</strong> od ${fmt(day.minTemp,'°C')} do ${fmt(day.maxTemp,'°C')}. `;
  text+=`<strong>Opady:</strong> łączna prognozowana suma około ${day.rainSum.toFixed(1)} mm, `;
  text+=`najwyższe prawdopodobieństwo opadu ${Math.round(day.maxPop)}% około ${timeOf(strongestRain)}. `;

  if(firstRain!==null){
    text+=`Najbardziej prawdopodobny okres opadów to mniej więcej ${timeOf(firstRain)}–${timeOf(lastRain)}. `;
  }else{
    text+=`Modele nie wskazują wyraźnego okresu opadów. `;
  }

  text+=`<strong>Wiatr:</strong> średnio około ${Math.round(day.avgWind)} km/h, porywy do ${Math.round(day.maxGust)} km/h około ${timeOf(strongestWind)}. `;
  text+=`<strong>Burze:</strong> ryzyko ${describeStorm(day.maxStorm)}, maksymalnie około ${Math.round(day.maxStorm)}%`;
  if(strongestStorm!==null) text+=` w pobliżu ${timeOf(strongestStorm)}`;
  text+=`.`;

  return text;
}

function fillDailyForecastDateOptions(data,preferredDate){
  const select=document.getElementById('dailyForecastDate');
  const dates=getDailyDates(data);
  select.innerHTML=dates.map(d=>{
    const dt=new Date(d+'T12:00:00');
    const label=dt.toLocaleDateString('pl-PL',{weekday:'long',day:'2-digit',month:'long'});
    return `<option value="${d}">${label}</option>`;
  }).join('');
  if(preferredDate && dates.includes(preferredDate)) select.value=preferredDate;
}

function renderDailyForecast(dateKey){
  const data=currentWeatherData;
  if(!data) return;
  const day=aggregateDay(data,dateKey);
  if(!day) return;

  const titleDate=new Date(dateKey+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'2-digit',month:'long'});
  document.getElementById('dailyForecastTitle').textContent=`Prognoza na ${titleDate}`;
  document.getElementById('dailyForecastLocation').textContent=currentPlace ? placeLabel(currentPlace) : '—';
  document.getElementById('dailyTempRange').textContent=`${fmt(day.minTemp,'°C')}–${fmt(day.maxTemp,'°C')}`;
  document.getElementById('dailyRainSum').textContent=`${day.rainSum.toFixed(1)} mm`;
  document.getElementById('dailyRainProbability').textContent=`${Math.round(day.maxPop)}%`;
  document.getElementById('dailyMaxGust').textContent=`${Math.round(day.maxGust)} km/h`;
  document.getElementById('dailyStormRisk').textContent=`${Math.round(day.maxStorm)}%`;
  document.getElementById('dailyForecastText').innerHTML=buildDailyNarrative(data,dateKey);

  document.getElementById('dailyMorning').innerHTML=summarizePeriod(data,periodIndices(data,dateKey,6,10),'Rano 06:00–10:00');
  document.getElementById('dailyNoon').innerHTML=summarizePeriod(data,periodIndices(data,dateKey,10,14),'Południe 10:00–14:00');
  document.getElementById('dailyAfternoon').innerHTML=summarizePeriod(data,periodIndices(data,dateKey,14,18),'Popołudnie 14:00–18:00');
  document.getElementById('dailyEvening').innerHTML=summarizePeriod(data,periodIndices(data,dateKey,18,22),'Wieczór 18:00–22:00');
  document.getElementById('dailyNight').innerHTML=summarizePeriod(data,periodIndices(data,dateKey,22,24),'Noc 22:00–24:00');
}

function openDailyForecast(){
  if(!currentWeatherData) return;
  const preferred=selectedHourIndex!==null
    ? String(currentWeatherData.hourly.time[selectedHourIndex]).slice(0,10)
    : String(currentWeatherData.hourly.time[0]).slice(0,10);

  fillDailyForecastDateOptions(currentWeatherData,preferred);
  renderDailyForecast(document.getElementById('dailyForecastDate').value);

  const modal=document.getElementById('dailyForecastModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
}

function closeDailyForecast(){
  const modal=document.getElementById('dailyForecastModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}



function weatherIconFromCode(code){
  code=Number(code);
  if(code===0) return '☀️';
  if(code===1 || code===2) return '🌤️';
  if(code===3) return '☁️';
  if(code===45 || code===48) return '🌫️';
  if([51,53,55,56,57].includes(code)) return '🌦️';
  if([61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if([71,73,75,77,85,86].includes(code)) return '🌨️';
  if([95,96,99].includes(code)) return '⛈️';
  return '🌤️';
}

function dominantWeatherCode(data,ids){
  if(!ids.length) return 0;
  const codes=ids.map(i=>Number(data.hourly.weather_code?.[i]||0));
  const severe=codes.find(c=>[95,96,99].includes(c));
  if(severe!==undefined) return severe;
  const rainy=codes.find(c=>[63,65,80,81,82].includes(c));
  if(rainy!==undefined) return rainy;
  const cloudy=codes.find(c=>c===3);
  if(cloudy!==undefined) return cloudy;
  return codes[Math.floor(codes.length/2)]||0;
}

function dayQuality(day){
  if(day.maxStorm>=55 || day.maxGust>=65) return {dot:'🔴',label:'trudna',score:0};
  if(day.rainSum>=5 || day.maxPop>=70 || day.maxGust>=50) return {dot:'🟠',label:'opady',score:1};
  if(day.rainSum>=1 || day.maxPop>=35 || day.maxGust>=35) return {dot:'🟡',label:'zmienna',score:2};
  return {dot:'🟢',label:'dobra',score:3};
}

function dailyCardData(data,dateKey,dayOffset){
  const day=aggregateDay(data,dateKey);
  if(!day) return null;
  const code=dominantWeatherCode(data,day.ids);
  const q=dayQuality(day);
  const confidence=Math.max(35,Math.round(96-dayOffset*3.7));
  return {...day,dateKey,code,quality:q,confidence};
}

function descriptiveDayText(data,card){
  const d=card;
  const rain=d.maxPop>=70?'Opady są bardzo prawdopodobne':
             d.maxPop>=40?'Możliwe są okresowe opady':
             d.maxPop>=20?'Niewykluczone są lokalne, słabe opady':
             'Większa część dnia powinna być bez istotnych opadów';
  const wind=d.maxGust>=60?'Wiatr może być silny, miejscami z bardzo mocnymi porywami':
             d.maxGust>=40?'Okresami możliwe są silniejsze porywy wiatru':
             'Wiatr nie powinien być szczególnie silny';
  const storm=d.maxStorm>=60?'Ryzyko burz jest wysokie':
              d.maxStorm>=30?'Istnieje umiarkowane ryzyko burz':
              d.maxStorm>=10?'Ryzyko burz jest niewielkie':
              'Ryzyko burz jest bardzo małe';
  return `${rain}. Prognozowana suma opadu około ${d.rainSum.toFixed(1)} mm. `+
         `Temperatura od ${fmt(d.minTemp,'°C')} do ${fmt(d.maxTemp,'°C')}. `+
         `${wind}; maksymalne porywy około ${Math.round(d.maxGust)} km/h. `+
         `${storm} — szacunkowo do ${Math.round(d.maxStorm)}%.`;
}

function ensureMultiForecastButtons(){
  if(document.getElementById('multiForecastLaunchers')) return;

  const hourlyPanel=document.querySelector('.hourly-panel');
  if(!hourlyPanel) return;

  const wrap=document.createElement('div');
  wrap.id='multiForecastLaunchers';
  wrap.className='multi-forecast-launchers';
  wrap.innerHTML=`
    <button id="open7DayForecastBtn" class="multi-forecast-launch" type="button">
      <span class="launch-icon">▦</span><span>PROGNOZA 7 DNI</span>
    </button>
    <button id="open16DayForecastBtn" class="multi-forecast-launch" type="button">
      <span class="launch-icon">▥</span><span>PROGNOZA 16 DNI</span>
    </button>`;
  hourlyPanel.insertAdjacentElement('afterend',wrap);

  document.getElementById('open7DayForecastBtn').addEventListener('click',()=>openMultiDayForecast(7));
  document.getElementById('open16DayForecastBtn').addEventListener('click',()=>openMultiDayForecast(16));
}

function openMultiDayForecast(days){
  if(!currentWeatherData) return;
  const data=currentWeatherData;
  const dates=getDailyDates(data).slice(0,days);
  const cards=dates.map((date,i)=>dailyCardData(data,date,i)).filter(Boolean);

  document.getElementById('multiDayForecastTitle').textContent=`Prognoza ${days}-dniowa`;
  document.getElementById('multiDayForecastPlace').textContent=currentPlace?placeLabel(currentPlace):'—';

  const cardBox=document.getElementById('multiDayCards');
  cardBox.className='multi-day-cards'+(days===16?' days-16':'');
  cardBox.innerHTML=cards.map((d,i)=>{
    const dt=new Date(d.dateKey+'T12:00:00');
    const dayName=dt.toLocaleDateString('pl-PL',{weekday:'short'});
    const date=dt.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'});
    return `
      <article class="forecast-day-card" data-day="${d.dateKey}">
        <span class="quality-dot" title="${d.quality.label}">${d.quality.dot}</span>
        <div class="day-name">${dayName}</div>
        <div class="day-date">${date}</div>
        <div class="day-icon">${weatherIconFromCode(d.code)}</div>
        <div class="day-temp">${Math.round(d.maxTemp)}° <small>/ ${Math.round(d.minTemp)}°</small></div>
        <div class="day-lines">
          <div><span>💧 Opad</span><strong>${d.rainSum.toFixed(1)} mm</strong></div>
          <div><span>☔ Szansa</span><strong>${Math.round(d.maxPop)}%</strong></div>
          <div><span>≋ Porywy</span><strong>${Math.round(d.maxGust)} km/h</strong></div>
          <div><span>ϟ Burze</span><strong>${Math.round(d.maxStorm)}%</strong></div>
        </div>
        <div class="confidence">pewność orientacyjna ${d.confidence}%</div>
      </article>`;
  }).join('');

  const ranked=[...cards].sort((a,b)=>{
    if(b.quality.score!==a.quality.score) return b.quality.score-a.quality.score;
    return (a.rainSum+a.maxStorm/20+a.maxGust/50)-(b.rainSum+b.maxStorm/20+b.maxGust/50);
  });
  const best=ranked[0], worst=ranked[ranked.length-1];
  const niceDate=d=>new Date(d.dateKey+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'2-digit',month:'2-digit'});

  document.getElementById('multiDayHighlights').innerHTML=`
    <div class="day-highlight">⭐ Najlepsze warunki: <strong>${best?niceDate(best):'—'}</strong></div>
    <div class="day-highlight">⚠️ Najtrudniejsze warunki: <strong>${worst?niceDate(worst):'—'}</strong></div>`;

  const detail=document.getElementById('multiDayDayDetail');
  detail.classList.add('hidden');
  detail.innerHTML='';

  cardBox.querySelectorAll('.forecast-day-card').forEach(el=>{
    el.addEventListener('click',()=>{
      cardBox.querySelectorAll('.forecast-day-card').forEach(x=>x.classList.remove('selected'));
      el.classList.add('selected');
      const d=cards.find(x=>x.dateKey===el.dataset.day);
      if(!d) return;
      const label=niceDate(d);
      detail.innerHTML=`<h3>${weatherIconFromCode(d.code)} ${label}</h3><p>${descriptiveDayText(data,d)}</p>`;
      detail.classList.remove('hidden');
    });
  });

  const modal=document.getElementById('multiDayForecastModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
}

function closeMultiDayForecast(){
  const modal=document.getElementById('multiDayForecastModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}



const MODEL_SPECS=[
  {
    key:'aifs',
    name:'ECMWF AIFS',
    subtitle:'AIFS Single v2 • MODEL GŁÓWNY',
    endpoint:'https://api.open-meteo.com/v1/ecmwf',
    model:'aifs_single',
    accent:'AIFS'
  },
  {
    key:'ecmwf',
    name:'ECMWF IFS',
    subtitle:'IFS HRES',
    endpoint:'https://api.open-meteo.com/v1/ecmwf',
    model:'ifs025',
    accent:'ECMWF'
  },
  {
    key:'icon',
    name:'ICON',
    subtitle:'DWD ICON',
    endpoint:'https://api.open-meteo.com/v1/dwd-icon',
    model:null,
    accent:'DWD'
  },
  {
    key:'gfs',
    name:'GFS',
    subtitle:'NOAA GFS',
    endpoint:'https://api.open-meteo.com/v1/gfs',
    model:null,
    accent:'NOAA'
  }
]

let modelComparisonData=null;

async function fetchSpecificModel(spec,place,timezone='auto'){
  const url=new URL(spec.endpoint);
  if(spec.model) url.searchParams.set('models',spec.model);
  url.searchParams.set('latitude',place.latitude);
  url.searchParams.set('longitude',place.longitude);
  url.searchParams.set('timezone',timezone||'auto');
  url.searchParams.set('forecast_days','3');
  url.searchParams.set('hourly',[
    'temperature_2m',
    'apparent_temperature',
    'precipitation',
    'precipitation_probability',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
  ].join(','));

  let res=await fetch(url);

  // Nie wszystkie wyspecjalizowane endpointy muszą zwracać precipitation_probability.
  if(!res.ok){
    const fallback=new URL(spec.endpoint);
    if(spec.model) fallback.searchParams.set('models',spec.model);
    fallback.searchParams.set('latitude',place.latitude);
    fallback.searchParams.set('longitude',place.longitude);
    fallback.searchParams.set('timezone',timezone||'auto');
    fallback.searchParams.set('forecast_days','3');
    fallback.searchParams.set('hourly',[
      'temperature_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m'
    ].join(','));
    res=await fetch(fallback);
  }

  if(!res.ok) throw new Error(`${spec.name}: ${res.status}`);
  const data=await res.json();
  return {spec,data};
}

function modelHourIndex(modelData,targetTime){
  const times=modelData?.hourly?.time||[];
  if(!times.length) return null;
  const exact=times.indexOf(targetTime);
  if(exact>=0) return exact;

  const target=new Date(targetTime).getTime();
  let best=0,diff=Infinity;
  times.forEach((t,i)=>{
    const d=Math.abs(new Date(t).getTime()-target);
    if(d<diff){diff=d;best=i;}
  });
  return best;
}

function selectedModelTime(){
  const select=document.getElementById('modelsHourSelect');
  return select?.value || currentWeatherData?.hourly?.time?.[selectedHourIndex||0] || null;
}

function modelPoint(entry,targetTime){
  if(!entry?.data) return null;
  const h=entry.data.hourly;
  const i=modelHourIndex(entry.data,targetTime);
  if(i===null) return null;

  return {
    i,
    time:h.time[i],
    temp:Number(h.temperature_2m?.[i]),
    feels:Number(h.apparent_temperature?.[i]),
    rain:Number(h.precipitation?.[i]||0),
    pop:h.precipitation_probability?.[i]==null?null:Number(h.precipitation_probability[i]),
    code:Number(h.weather_code?.[i]||0),
    wind:Number(h.wind_speed_10m?.[i]||0),
    dir:Number(h.wind_direction_10m?.[i]||0),
    gust:Number(h.wind_gusts_10m?.[i]||0)
  };
}

function modelAgreementForTime(targetTime){
  const pts=(modelComparisonData||[]).map(x=>modelPoint(x,targetTime)).filter(Boolean);
  if(pts.length<2) return {score:0,label:'BRAK DANYCH',text:'Za mało modeli odpowiedziało.'};

  const spread=arr=>Math.max(...arr)-Math.min(...arr);
  const tempSpread=spread(pts.map(p=>p.temp));
  const rainSpread=spread(pts.map(p=>p.rain));
  const gustSpread=spread(pts.map(p=>p.gust));

  let score=100;
  score-=Math.min(35,tempSpread*8);
  score-=Math.min(35,rainSpread*12);
  score-=Math.min(30,gustSpread*1.4);
  score=Math.max(0,Math.round(score));

  let label,text;
  if(score>=80){
    label='WYSOKA';
    text='Modele pokazują bardzo podobny przebieg temperatury, opadu i wiatru.';
  }else if(score>=55){
    label='UMIARKOWANA';
    text='Modele są częściowo zgodne, ale występują zauważalne różnice w szczegółach.';
  }else{
    label='NISKA';
    text='Modele wyraźnie się różnią. Prognozę dla tej godziny należy traktować jako niepewną.';
  }

  return {score,label,text,tempSpread,rainSpread,gustSpread};
}

function renderModelCards(targetTime){
  const cards=document.getElementById('modelsCards');
  cards.innerHTML=MODEL_SPECS.map(spec=>{
    const entry=(modelComparisonData||[]).find(x=>x.spec.key===spec.key);
    if(!entry){
      return `<article class="model-compare-card"><div class="model-name"><strong>${spec.name}</strong><span>${spec.subtitle}</span></div><div class="model-error">Brak danych z modelu.</div></article>`;
    }

    const p=modelPoint(entry,targetTime);
    if(!p){
      return `<article class="model-compare-card"><div class="model-name"><strong>${spec.name}</strong><span>${spec.subtitle}</span></div><div class="model-error">Brak danych dla tej godziny.</div></article>`;
    }

    const [desc,iconType]=codeInfo(p.code);
    return `<article class="model-compare-card">
      <div class="model-name"><strong>${spec.name}</strong><span>${spec.subtitle}</span></div>
      <div class="model-main">
        <div class="model-icon">${weatherIconHtml(iconType,'large')}</div>
        <div><div class="model-temp">${fmt(p.temp,'°C',1)}</div><div class="model-desc">${desc}</div></div>
      </div>
      <div class="model-stats">
        <div class="model-stat"><small>Odczuwalna</small><strong>${fmt(p.feels,'°C',1)}</strong></div>
        <div class="model-stat rain"><small>Opad</small><strong>${fmt(p.rain,' mm',2)}</strong></div>
        <div class="model-stat"><small>Wiatr</small><strong>${fmt(p.wind,' km/h',1)}</strong></div>
        <div class="model-stat gust"><small>Porywy</small><strong>${fmt(p.gust,' km/h',1)}</strong></div>
        <div class="model-stat"><small>Kierunek</small><strong>${windDirectionLabel(p.dir)}</strong></div>
        <div class="model-stat"><small>Szansa opadu</small><strong>${p.pop==null?'—':fmt(p.pop,'%')}</strong></div>
      </div>
    </article>`;
  }).join('');

  const a=modelAgreementForTime(targetTime);
  document.getElementById('modelsAgreementValue').textContent=`${a.label} ${a.score}%`;
  document.getElementById('modelsAgreementText').textContent=a.text;
}

function renderModelsTimeline(){
  if(!modelComparisonData?.length) return;
  const first=modelComparisonData.find(x=>x.data)?.data;
  if(!first) return;

  const start=modelHourIndex(first,currentWeatherData?.hourly?.time?.[hourlyStartIndex(currentWeatherData)] || first.hourly.time[0]) || 0;
  const times=first.hourly.time.slice(start,start+24);

  const header=`<tr><th>Model</th>${times.map(t=>`<th>${new Date(t).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</th>`).join('')}</tr>`;

  const rows=MODEL_SPECS.map(spec=>{
    const entry=modelComparisonData.find(x=>x.spec.key===spec.key);
    if(!entry) return `<tr><td>${spec.name}</td>${times.map(()=>'<td>—</td>').join('')}</tr>`;

    return `<tr><td>${spec.name}</td>${times.map(t=>{
      const p=modelPoint(entry,t);
      if(!p) return '<td>—</td>';
      return `<td title="Opad ${p.rain.toFixed(2)} mm • porywy ${Math.round(p.gust)} km/h">${Math.round(p.temp)}°<br>💧${p.rain.toFixed(1)}<br>≋${Math.round(p.gust)}</td>`;
    }).join('')}</tr>`;
  }).join('');

  document.getElementById('modelsTimeline').innerHTML=`<table class="models-timeline-table">${header}${rows}</table>`;
}

function fillModelsHourSelect(){
  const select=document.getElementById('modelsHourSelect');
  const h=currentWeatherData?.hourly;
  if(!select || !h?.time?.length) return;

  const start=hourlyStartIndex(currentWeatherData);
  const times=h.time.slice(start,start+48);
  select.innerHTML=times.map(t=>{
    const dt=new Date(t);
    return `<option value="${t}">${dt.toLocaleDateString('pl-PL',{weekday:'short',day:'2-digit',month:'2-digit'})} ${dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</option>`;
  }).join('');

  if(selectedHourIndex!==null && h.time[selectedHourIndex]){
    select.value=h.time[selectedHourIndex];
  }
}

async function openModelsModal(){
  if(!currentPlace || !currentWeatherData) return;

  document.getElementById('modelsPlace').textContent=placeLabel(currentPlace);
  document.getElementById('modelsCards').innerHTML='<div class="model-error">Pobieram ECMWF, ICON i GFS…</div>';
  document.getElementById('modelsAgreementValue').textContent='—';
  document.getElementById('modelsAgreementText').textContent='Pobieram dane z modeli…';
  document.getElementById('modelsTimeline').innerHTML='';

  fillModelsHourSelect();

  const modal=document.getElementById('modelsModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');

  const settled=await Promise.allSettled(
    MODEL_SPECS.map(spec=>fetchSpecificModel(spec,currentPlace,currentWeatherData.timezone||'auto'))
  );

  modelComparisonData=settled
    .filter(x=>x.status==='fulfilled')
    .map(x=>x.value);

  renderModelCards(selectedModelTime());
  renderModelsTimeline();
}

function closeModelsModal(){
  const modal=document.getElementById('modelsModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}


async function runPlace(place){
  searchStatus.className='status';searchStatus.textContent='Pobieram prognozę…';citySuggestions.classList.add('hidden');
  try{
    const weather=await getWeather(place.latitude,place.longitude);currentWeatherData=weather;currentPlace=place;forecastGridData=null;forecastGridMeta=null;forecastRasterValues=null;
    renderPlace(place);
    renderCurrent(weather);
    renderHourly(weather);
    renderAnalysis(weather);
    emptyState.classList.add('hidden');
    weatherSection.classList.remove('hidden');
    searchStatus.textContent='Prognoza główna: ECMWF AIFS Single v2. Pobieram dane 15-min i analizę burz w promieniu 50 km…';
    initOrUpdateMap(place).catch(()=>{});

    getStormArea50km(place,weather.timezone||'auto')
      .then(area=>{
        weather.storm_area_50km=area;
        currentWeatherData=weather;
        renderAnalysis(weather);
      })
      .catch(()=>{});
    try{
      const quarter=await getQuarterHourWeather(place.latitude,place.longitude,weather.timezone||'auto');let dwd=null;try{dwd=await getLightning15Dwd(place.latitude,place.longitude,weather.timezone||'auto');}catch(_){}
      weather.quarter_hour=mergeQuarterHourData(quarter,dwd);
      currentWeatherData=weather;

      const keepSelected=selectedHourIndex;
      renderHourly(weather);

      if(keepSelected!==null){
        const selectedCard=document.querySelector(`.hour-card[data-hour-index="${keepSelected}"]`);
        if(selectedCard){
          document.querySelectorAll('.hour-card').forEach(c=>c.classList.remove('selected'));
          selectedCard.classList.add('selected');
          renderHourDetails(weather,keepSelected);
        }
      }

      searchStatus.textContent='Dane pobrane poprawnie — opad godzinowy jest zgodny z sumą 4 × 15 min.';
    }catch(_){weather.quarter_hour=null;currentWeatherData=weather;if(selectedHourIndex!==null)renderQuarterHourDetails(weather,selectedHourIndex);searchStatus.textContent='Prognoza pobrana. Dane 15-minutowe są chwilowo niedostępne, ale reszta aplikacji działa.';}
  }catch(err){searchStatus.className='status error';searchStatus.textContent=err?.message||'Wystąpił błąd pobierania danych.';}
}
async function runSearch(city){
  searchStatus.className='status';searchStatus.textContent='Wyszukuję lokalizację…';
  try{const place=await findCity(city);cityInput.value=placeLabel(place);await runPlace(place);}catch(err){searchStatus.className='status error';searchStatus.textContent=err?.message||'Wystąpił błąd wyszukiwania.';}
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


cityInput.addEventListener('input',()=>{clearTimeout(suggestionTimer);const q=cityInput.value.trim();if(q.length<2){renderCitySuggestions([]);return;}suggestionTimer=setTimeout(async()=>{try{renderCitySuggestions(await searchCities(q,8));}catch(_){renderCitySuggestions([]);}},220);});
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))citySuggestions.classList.add('hidden');});
window.addEventListener('load',()=>setTimeout(requestAutomaticLocation,700));


document.getElementById('clearLocationBtn')?.addEventListener('click',()=>{
  cityInput.value='';
  document.getElementById('currentLocationLabel').textContent='Wybierz lub wyszukaj miejscowość';
  cityInput.focus();
});


document.getElementById('openDailyForecastBtn')?.addEventListener('click',openDailyForecast);
document.getElementById('closeDailyForecastBtn')?.addEventListener('click',closeDailyForecast);
document.getElementById('dailyForecastDate')?.addEventListener('change',e=>renderDailyForecast(e.target.value));
document.getElementById('dailyForecastModal')?.addEventListener('click',e=>{
  if(e.target.id==='dailyForecastModal') closeDailyForecast();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !document.getElementById('dailyForecastModal')?.classList.contains('hidden')){
    closeDailyForecast();
  }
});


ensureMultiForecastButtons();

document.getElementById('closeMultiDayForecastBtn')?.addEventListener('click',closeMultiDayForecast);
document.getElementById('multiDayForecastModal')?.addEventListener('click',e=>{
  if(e.target.id==='multiDayForecastModal') closeMultiDayForecast();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !document.getElementById('multiDayForecastModal')?.classList.contains('hidden')){
    closeMultiDayForecast();
  }
});


function hookModelsMenu(){
  const buttons=[...document.querySelectorAll('.nav-item')];
  const btn=buttons.find(b=>b.textContent.toLowerCase().includes('modele pogodowe'));
  if(btn){
    btn.classList.remove('disabled');
    btn.addEventListener('click',e=>{
      e.preventDefault();
      openModelsModal();
    });
  }
}
hookModelsMenu();

document.getElementById('closeModelsModalBtn')?.addEventListener('click',closeModelsModal);
document.getElementById('modelsModal')?.addEventListener('click',e=>{
  if(e.target.id==='modelsModal') closeModelsModal();
});
document.getElementById('modelsHourSelect')?.addEventListener('change',e=>{
  renderModelCards(e.target.value);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !document.getElementById('modelsModal')?.classList.contains('hidden')){
    closeModelsModal();
  }
});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
