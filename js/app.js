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
  const q=data.quarter_hour?.minutely_15,container=document.getElementById('quarterHourCards'),range=document.getElementById('quarterHourRange');
  if(!q?.time?.length){range.textContent='brak danych';container.removeAttribute('data-source');container.innerHTML='<div class="quarter-hour-empty">Nie udało się pobrać danych 15-minutowych.</div>';return;}
  const hourKey=String(data.hourly.time[hourIndex]).slice(0,13),matches=[];for(let j=0;j<q.time.length;j++)if(String(q.time[j]).slice(0,13)===hourKey)matches.push(j);
  if(!matches.length){range.textContent='poza zakresem 15-min';container.innerHTML='<div class="quarter-hour-empty">Ta godzina jest poza zakresem szczegółowej prognozy 15-minutowej.</div>';return;}
  const selected=matches.slice(0,4),firstTime=new Date(q.time[selected[0]]),lastTime=new Date(q.time[selected[selected.length-1]]);range.textContent=firstTime.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})+'–'+lastTime.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});container.dataset.source=data.quarter_hour?._quarter_source||'Open-Meteo 15-min';
  container.innerHTML=selected.map(j=>{const dt=new Date(q.time[j]),targetMs=dt.getTime(),wind=q.wind_speed_10m?.[j]??interpolateHourlyValue(data.hourly,'wind_speed_10m',targetMs),precip=Number(q.precipitation?.[j]??0),cape=q.cape?.[j],lpi=q.lightning_potential_index?.[j],code=q.weather_code?.[j],stormProb=estimatedStormProbability(cape,lpi,code);
    return `<div class="quarter-card"><div class="q-time">${dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</div><div class="quarter-grid"><div class="quarter-metric rain native-data"><small>Suma opadu / 15 min</small><strong>${fmt(precip,' mm',2)}</strong></div><div class="quarter-metric"><small>Wiatr</small><strong>${fmt(wind,' km/h',1)}</strong></div><div class="quarter-metric storm"><small>Burza — prawdopodobieństwo szac.</small><strong class="${stormProb>=60?'high':stormProb>=30?'medium':'low'}">${stormProb}%</strong></div></div></div>`;}).join('');
  container.insertAdjacentHTML('beforeend','<div class="quarter-data-note">Prawdopodobieństwo burzy jest szacunkiem aplikacji na podstawie CAPE, LPI i kodu pogody; nie jest oficjalnym procentem IMGW.</div>');
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

const FORECAST_OFFSETS=[-1.2,-0.8,-0.4,0,0.4,0.8,1.2];

function buildForecastGrid(place){
  const lat=Number(place.latitude),lon=Number(place.longitude);
  const points=[];
  FORECAST_OFFSETS.forEach(dLat=>FORECAST_OFFSETS.forEach(dLon=>{
    points.push({lat:lat+dLat,lon:lon+dLon,dLat,dLon});
  }));
  forecastGridMeta={
    rows:FORECAST_OFFSETS.length,
    cols:FORECAST_OFFSETS.length,
    minLat:lat+FORECAST_OFFSETS[0],
    maxLat:lat+FORECAST_OFFSETS[FORECAST_OFFSETS.length-1],
    minLon:lon+FORECAST_OFFSETS[0],
    maxLon:lon+FORECAST_OFFSETS[FORECAST_OFFSETS.length-1]
  };
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
  url.searchParams.set('timezone',weather?.timezone||'auto');

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
    document.getElementById('forecastMapLabel').textContent='Pobieram dokładniejszą siatkę prognozy dla okolicy…';
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
      tileSize:256,opacity:.66,maxNativeZoom:7,maxZoom:18,keepBuffer:4,updateWhenZooming:false,attribution:'Radar © RainViewer'
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
  const label=document.getElementById('currentLocationLabel');
  if(label) label.textContent=[place.name,place.admin1,place.country].filter(Boolean).join(', ');
}


async function runPlace(place){
  searchStatus.className='status';searchStatus.textContent='Pobieram prognozę…';citySuggestions.classList.add('hidden');
  try{
    const weather=await getWeather(place.latitude,place.longitude);currentWeatherData=weather;currentPlace=place;forecastGridData=null;forecastGridMeta=null;forecastRasterValues=null;
    renderPlace(place);renderCurrent(weather);renderHourly(weather);renderAnalysis(weather);emptyState.classList.add('hidden');weatherSection.classList.remove('hidden');searchStatus.textContent='Podstawowa prognoza pobrana. Pobieram dane co 15 minut…';initOrUpdateMap(place).catch(()=>{});
    try{
      const quarter=await getQuarterHourWeather(place.latitude,place.longitude,weather.timezone||'auto');let dwd=null;try{dwd=await getLightning15Dwd(place.latitude,place.longitude,weather.timezone||'auto');}catch(_){}
      weather.quarter_hour=mergeQuarterHourData(quarter,dwd);currentWeatherData=weather;if(selectedHourIndex!==null)renderQuarterHourDetails(weather,selectedHourIndex);searchStatus.textContent='Dane pobrane poprawnie — sekcja 15-minutowa jest aktywna.';
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

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
