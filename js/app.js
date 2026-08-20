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
let imgwWarningsData={meteo:[],hydro:[]};
let warningsScope='local';
let warningsType='all';

let currentWeatherData = null;
let currentPlace = null;
let selectedHourIndex = null;
let forecastGridData = null;
let forecastGridMeta = null;
let forecastRasterValues = null;
let forecastInspectPopup = null;
let mapMode = 'forecast';
let rcbAlertsData=[];
let weatherAnimationTimer=null;
let weatherAnimationRadarFrames=null;
let weatherAnimationRadarHost=null;
let weatherAnimationRunning=false;
const AUTO_REFRESH_INTERVAL_MS=10*60*1000;
let autoRefreshTimer=null;
let autoRefreshCountdownTimer=null;
let autoRefreshNextAt=null;
let autoRefreshInProgress=false;
let lastSuccessfulRefreshAt=null;


let mapRadiusCircle = null;
let baseMapLayer = null;
let baseMapFallbackLayer = null;
let mapTileErrorCount = 0;
let mapRefreshTimer = null;
let stormCloudLayer = null;
let stormForecastHourOffset = 0;
let stormModeActive = false;

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
  url.searchParams.set('latitude',lat);
  url.searchParams.set('longitude',lon);
  url.searchParams.set('timezone','auto');
  url.searchParams.set('forecast_days','16');
  url.searchParams.set('models','ecmwf_ifs');
  url.searchParams.set('current',[
    'temperature_2m','apparent_temperature','relative_humidity_2m','surface_pressure','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','visibility','cloud_cover','cape',
    'precipitation','rain','showers'
  ].join(','));
  url.searchParams.set('hourly',[
    'temperature_2m','apparent_temperature','precipitation_probability','precipitation','rain','showers','weather_code',
    'wind_speed_10m','wind_direction_10m','wind_gusts_10m','relative_humidity_2m','surface_pressure',
    'visibility','cloud_cover','cape'
  ].join(','));
  const res=await fetch(url,{cache:'no-store'});
  if(!res.ok){
    const text=await res.text().catch(()=> '');
    throw new Error(`Nie udało się pobrać prognozy ECMWF IFS (${res.status}). ${text}`.trim());
  }
  const data=await res.json();
  data._mainModel='ECMWF IFS HRES 9 km';
  return data;
}

function hourlyStartIndex(data){
  const times=data.hourly?.time||[];
  if(!times.length) return 0;

  const currentTime=new Date(data.current?.time||Date.now()).getTime();
  let best=0;

  for(let i=0;i<times.length;i++){
    const t=new Date(times[i]).getTime();
    if(t<=currentTime) best=i;
    else break;
  }

  return Math.max(0,best);
}


const RAINVIEWER_UNIVERSAL_BLUE=[
  [15,0x88,0xdd,0xee],[16,0x6c,0xd1,0xeb],[17,0x51,0xc5,0xe8],[18,0x36,0xba,0xe5],
  [19,0x1b,0xae,0xe2],[20,0x00,0xa3,0xe0],[21,0x00,0x9a,0xd5],[22,0x00,0x91,0xca],
  [23,0x00,0x88,0xbf],[24,0x00,0x7f,0xb4],[25,0x00,0x77,0xaa],[26,0x00,0x70,0xa3],
  [27,0x00,0x69,0x9c],[28,0x00,0x62,0x95],[29,0x00,0x5b,0x8e],[30,0x00,0x55,0x88],
  [31,0x00,0x51,0x80],[32,0x00,0x4e,0x78],[33,0x00,0x4a,0x70],[34,0x00,0x47,0x68],
  [35,0xff,0xee,0x00],[36,0xff,0xe0,0x00],[37,0xff,0xd2,0x00],[38,0xff,0xc5,0x00],
  [39,0xff,0xb7,0x00],[40,0xff,0xaa,0x00],[41,0xff,0x9f,0x00],[42,0xff,0x95,0x00],
  [43,0xff,0x8b,0x00],[44,0xff,0x81,0x00],[45,0xff,0x44,0x00],[46,0xf2,0x36,0x00],
  [47,0xe6,0x28,0x00],[48,0xd9,0x1b,0x00],[49,0xcd,0x0d,0x00],[50,0xc1,0x00,0x00],
  [51,0xa8,0x00,0x00],[52,0x8f,0x00,0x00],[53,0x76,0x00,0x00],[54,0x5d,0x00,0x00],
  [55,0xff,0xaa,0xff],[56,0xff,0x9f,0xff],[57,0xff,0x95,0xff],[58,0xff,0x8b,0xff],
  [59,0xff,0x81,0xff],[60,0xff,0x77,0xff],[61,0xff,0x6c,0xff],[62,0xff,0x62,0xff],
  [63,0xff,0x58,0xff],[64,0xff,0x4e,0xff],[65,0xff,0xff,0xff]
];

function nearestDbzFromRadarPixel(r,g,b,a){
  if(a<80) return null;
  let best=null,bestD=Infinity;
  for(const [dbz,pr,pg,pb] of RAINVIEWER_UNIVERSAL_BLUE){
    const d=(r-pr)**2+(g-pg)**2+(b-pb)**2;
    if(d<bestD){bestD=d;best=dbz;}
  }
  // Przy dużej odległości od oficjalnej palety traktujemy piksel jako brak danych.
  return bestD<12000?best:null;
}

function dbzToRainRate(dbz){
  if(dbz==null || dbz<15) return 0;
  const z=Math.pow(10,dbz/10);
  return Math.pow(z/200,1/1.6);
}

function radarIntensityLabel(rate){
  if(rate<0.1) return ['none','brak opadu'];
  if(rate<2.5) return ['light','słaby opad'];
  if(rate<7.5) return ['moderate','umiarkowany opad'];
  if(rate<25) return ['heavy','silny opad'];
  return ['extreme','bardzo silny / ulewny opad'];
}

function modelCurrentPrecipitation(data){
  const c=data?.current||{};
  const v=Number(c.precipitation);
  return Number.isFinite(v)?v:0;
}

function updateRadarNowUi(rate,dbz,frameTime,data){
  const box=document.getElementById('radarNowObservation');
  const value=document.getElementById('radarNowValue');
  const detail=document.getElementById('radarNowDetail');
  const model=document.getElementById('radarModelCurrent');
  if(!box||!value||!detail)return;

  const [cls,label]=radarIntensityLabel(rate);
  box.className='radar-now-observation '+cls;

  if(rate<=0){
    value.textContent='Radar nie wykrywa opadu nad lokalizacją';
  }else{
    value.textContent=`${rate.toFixed(rate<10?1:0)} mm/h – ${label}`;
  }

  detail.textContent=
    `Radar ${frameTime?new Date(frameTime).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'—'}`+
    (dbz!=null?` • około ${Math.round(dbz)} dBZ`:'')+
    ' • obserwacja, nie prognoza';

  if(model){
    model.textContent=`${modelCurrentPrecipitation(data).toFixed(2)} mm / 15 min`;
  }
}

function lonToTileX(lon,z){
  return ((Number(lon)+180)/360)*Math.pow(2,z);
}

function latToTileY(lat,z){
  const latRad=Number(lat)*Math.PI/180;
  const n=Math.pow(2,z);
  return (1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n;
}

function loadImageFromBlob(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob);
    const img=new Image();

    img.onload=()=>{
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(new Error('Nie można odczytać obrazu radaru.'));
    };

    img.src=url;
  });
}

async function sampleRadarNow(place,data){
  const box=document.getElementById('radarNowObservation');
  if(box) box.className='radar-now-observation waiting';

  try{
    const metaRes=await fetch(
      'https://api.rainviewer.com/public/weather-maps.json',
      {cache:'no-store'}
    );
    if(!metaRes.ok) throw new Error('Radar niedostępny');

    const meta=await metaRes.json();
    const frames=meta.radar?.past||[];
    if(!frames.length) throw new Error('Brak klatek radaru');

    const frame=frames[frames.length-1];
    const host=meta.host||'https://tilecache.rainviewer.com';

    // RainViewer: standardowe kafelki Web Mercator x/y.
    const z=7;
    const xFloat=lonToTileX(place.longitude,z);
    const yFloat=latToTileY(place.latitude,z);
    const tileX=Math.floor(xFloat);
    const tileY=Math.floor(yFloat);

    const px=Math.max(0,Math.min(255,Math.floor((xFloat-tileX)*256)));
    const py=Math.max(0,Math.min(255,Math.floor((yFloat-tileY)*256)));

    const imgUrl=
      `${host}${frame.path}/256/${z}/${tileX}/${tileY}/2/1_1.png`;

    const imageResponse=await fetch(imgUrl,{
      cache:'no-store',
      mode:'cors'
    });
    if(!imageResponse.ok){
      throw new Error('Nie można pobrać kafelka radaru.');
    }

    const blob=await imageResponse.blob();
    const img=await loadImageFromBlob(blob);

    const canvas=document.createElement('canvas');
    canvas.width=256;
    canvas.height=256;

    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx) throw new Error('Brak obsługi Canvas.');

    ctx.drawImage(img,0,0,256,256);

    // 7x7 pikseli wokół dokładnej pozycji.
    let maxDbz=null;
    let validPixels=0;

    for(let y=py-3;y<=py+3;y++){
      for(let x=px-3;x<=px+3;x++){
        if(x<0||x>255||y<0||y>255) continue;

        const rgba=ctx.getImageData(x,y,1,1).data;
        const dbz=nearestDbzFromRadarPixel(
          rgba[0],rgba[1],rgba[2],rgba[3]
        );

        if(dbz!=null){
          validPixels++;
          if(maxDbz==null||dbz>maxDbz) maxDbz=dbz;
        }
      }
    }

    const rate=dbzToRainRate(maxDbz);

    data._radarNow={
      rate,
      dbz:maxDbz,
      time:frame.time*1000,
      tile:{z,x:tileX,y:tileY,px,py},
      validPixels
    };

    updateRadarNowUi(
      rate,
      maxDbz,
      frame.time*1000,
      data
    );
    updateVisualDashboard(data);

    return data._radarNow;
  }catch(err){
    const value=document.getElementById('radarNowValue');
    const detail=document.getElementById('radarNowDetail');
    const model=document.getElementById('radarModelCurrent');

    if(value){
      value.textContent='Radar chwilowo nie może zostać odczytany';
    }

    if(detail){
      detail.textContent=
        'Prognoza modelowa działa niezależnie. Ponowna próba nastąpi automatycznie lub po naciśnięciu przycisku.';
    }

    if(model){
      model.textContent=
        `${modelCurrentPrecipitation(data).toFixed(2)} mm / 15 min`;
    }

    return null;
  }
}



function setFactorState(id,level){
  const el=document.getElementById(id);
  if(!el) return;
  el.classList.remove('level-good','level-watch','level-warning','level-danger');
  el.classList.add(
    level>=3?'level-danger':
    level===2?'level-warning':
    level===1?'level-watch':'level-good'
  );
}

function nextHoursIndices(data,count=6){
  const start=hourlyStartIndex(data);
  return Array.from(
    {length:Math.min(count,(data.hourly?.time||[]).length-start)},
    (_,n)=>start+n
  );
}

function visualStormLevel(data,ids){
  const h=data.hourly||{};
  const cape=Math.max(0,...ids.map(i=>Number(h.cape?.[i]||0)));
  const codes=ids.map(i=>Number(h.weather_code?.[i]||0));
  if(codes.some(c=>[96,99].includes(c)) || cape>=1800) return {level:3,value:'wysokie',text:`CAPE ${Math.round(cape)} J/kg`};
  if(codes.some(c=>c===95) || cape>=1000) return {level:2,value:'podwyższone',text:`CAPE ${Math.round(cape)} J/kg`};
  if(cape>=500) return {level:1,value:'obserwuj',text:`CAPE ${Math.round(cape)} J/kg`};
  return {level:0,value:'niskie',text:`CAPE ${Math.round(cape)} J/kg`};
}

function updateVisualDashboard(data){
  if(!data?.hourly) return;

  const h=data.hourly;
  const ids=nextHoursIndices(data,6);
  if(!ids.length) return;

  const headline=document.getElementById('weatherStoryHeadline');
  const story=document.getElementById('weatherStoryText');
  const storyIcon=document.getElementById('weatherStoryIcon');

  const rainVals=ids.map(i=>Number(effectiveHourlyPrecipitation(data,i)||0));
  const rainSum=rainVals.reduce((a,b)=>a+b,0);
  const maxRain=Math.max(0,...rainVals);
  const gust=Math.max(0,...ids.map(i=>Number(h.wind_gusts_10m?.[i]||0)));
  const storm=visualStormLevel(data,ids);

  const start=hourlyStartIndex(data);
  const nowTemp=Number(data.current?.temperature_2m ?? h.temperature_2m?.[start]);
  const i3=Math.min(start+3,(h.temperature_2m?.length||1)-1);
  const temp3=Number(h.temperature_2m?.[i3] ?? nowTemp);
  const delta=temp3-nowTemp;

  const radarRate=Number(data._radarNow?.rate||0);
  const weatherCode=Number(data.current?.weather_code||0);
  const currentDescription=codeInfo(weatherCode)?.[0]||'Aktualna pogoda';

  let mainIcon='☀️';
  let mainHeadline=currentDescription;
  let mainText=`W najbliższych 6 h: opad ${rainSum.toFixed(1)} mm, porywy do ${Math.round(gust)} km/h.`;

  if(radarRate>=7.5){
    mainIcon='🌧️';
    mainHeadline='Silny opad jest teraz nad lokalizacją';
    mainText=`Radar wskazuje około ${radarRate.toFixed(1)} mm/h. Obserwuj radar i ostrzeżenia.`;
  }else if(radarRate>=0.1){
    mainIcon='🌦️';
    mainHeadline='Radar wykrywa opad nad lokalizacją';
    mainText=`Natężenie radarowe około ${radarRate.toFixed(1)} mm/h.`;
  }else if(storm.level>=2){
    mainIcon='⛈️';
    mainHeadline='Wzrasta ryzyko burz w najbliższych godzinach';
    mainText=`${storm.text}. Porywy mogą dochodzić do ${Math.round(gust)} km/h.`;
  }else if(gust>=70){
    mainIcon='💨';
    mainHeadline='Najważniejszym czynnikiem będzie silny wiatr';
    mainText=`Prognozowane porywy do około ${Math.round(gust)} km/h w najbliższych 6 godzinach.`;
  }else if(maxRain>=2 || rainSum>=5){
    mainIcon='🌧️';
    mainHeadline='W najbliższych godzinach możliwy jest wyraźny opad';
    mainText=`Łącznie około ${rainSum.toFixed(1)} mm w kolejnych 6 godzinach.`;
  }

  if(storyIcon) storyIcon.textContent=mainIcon;
  if(headline) headline.textContent=mainHeadline;
  if(story) story.textContent=mainText;

  // OPAD
  const rainValue=document.getElementById('factorRainValue');
  const rainText=document.getElementById('factorRainText');
  let rainLevel=0;
  if(radarRate>=7.5 || maxRain>=7.5) rainLevel=3;
  else if(radarRate>=2.5 || maxRain>=2.5 || rainSum>=10) rainLevel=2;
  else if(radarRate>=.1 || rainSum>=.5) rainLevel=1;

  if(rainValue){
    rainValue.textContent=radarRate>=.1
      ? `${radarRate.toFixed(radarRate<10?1:0)} mm/h`
      : `${rainSum.toFixed(1)} mm`;
  }
  if(rainText){
    rainText.textContent=radarRate>=.1
      ? 'radar teraz'
      : rainSum<.1?'brak w 6h':'suma w 6h';
  }
  setFactorState('factorRain',rainLevel);

  // BURZE
  const stormValue=document.getElementById('factorStormValue');
  const stormText=document.getElementById('factorStormText');
  if(stormValue) stormValue.textContent=storm.value;
  if(stormText) stormText.textContent=storm.text;
  setFactorState('factorStorm',storm.level);

  // WIATR
  const windValue=document.getElementById('factorWindValue');
  const windText=document.getElementById('factorWindText');
  const windLevel=gust>=90?3:gust>=70?2:gust>=50?1:0;
  if(windValue) windValue.textContent=`${Math.round(gust)} km/h`;
  if(windText) windText.textContent='maks. w 6h';
  setFactorState('factorWind',windLevel);

  // TREND
  const trendValue=document.getElementById('factorTrendValue');
  const trendText=document.getElementById('factorTrendText');
  if(trendValue){
    trendValue.textContent=
      Math.abs(delta)<.3?'stabilnie':`${delta>0?'+':''}${delta.toFixed(1)}°C`;
  }
  if(trendText) trendText.textContent='zmiana do +3h';
  setFactorState('factorTrend',0);
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
  const radarModel=document.getElementById('radarModelCurrent');
  if(radarModel) radarModel.textContent=`${modelCurrentPrecipitation(data).toFixed(2)} mm / 15 min`;
  updateVisualDashboard(data);
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
  renderLightningWarning(data);
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


function clearStormCloudLayer(){
  if(stormCloudLayer && map){
    map.removeLayer(stormCloudLayer);
  }
  stormCloudLayer=null;
}

function stormCellRisk(point){
  const cape=Number(point.cape||0);
  const rain=Number(point.precipitation||0);
  const cloud=Number(point.cloud_cover||0);
  const code=Number(point.weather_code||0);
  const gust=Number(point.wind_gusts_10m||0);

  let score=0;
  if(cape>=1800) score+=50;
  else if(cape>=1000) score+=38;
  else if(cape>=600) score+=28;
  else if(cape>=300) score+=18;
  else if(cape>=100) score+=7;

  if(rain>=5) score+=28;
  else if(rain>=2) score+=20;
  else if(rain>=0.5) score+=10;

  if(cloud>=90) score+=10;
  else if(cloud>=75) score+=6;

  if([95,96,99].includes(code)) score+=35;
  else if([80,81,82].includes(code)) score+=12;

  if(gust>=70) score+=12;
  else if(gust>=50) score+=7;

  return Math.min(100,Math.round(score));
}

function stormCellLevel(score){
  if(score>=60) return 'high';
  if(score>=30) return 'medium';
  return 'low';
}

function bearingArrowRotation(deg){
  return Number.isFinite(Number(deg)) ? Number(deg)-90 : 0;
}

function gridPointForForecastEntry(entry,hourIdx){
  const h=entry?.data?.hourly;
  if(!h?.time?.length) return null;
  const i=Math.max(0,Math.min(hourIdx,h.time.length-1));
  return {
    lat:entry.point.lat,
    lon:entry.point.lon,
    time:h.time[i],
    precipitation:Number(h.precipitation?.[i]||0),
    cloud_cover:Number(h.cloud_cover?.[i]||0),
    weather_code:Number(h.weather_code?.[i]||0),
    wind_speed_10m:Number(h.wind_speed_10m?.[i]||0),
    wind_direction_10m:Number(h.wind_direction_10m?.[i]||0),
    wind_gusts_10m:Number(h.wind_gusts_10m?.[i]||0),
    cape:Number(h.cape?.[i]||0),
  };
}

function selectedForecastGridHourIndex(offsetHours=0){
  if(!forecastGridData?.length || !currentWeatherData?.hourly?.time?.length) return null;

  const baseTime=currentWeatherData.hourly.time[selectedHourIndex ?? hourlyStartIndex(currentWeatherData)];
  const targetMs=new Date(baseTime).getTime()+offsetHours*3600000;

  const times=forecastGridData[0]?.data?.hourly?.time||[];
  if(!times.length) return null;

  let best=0,bestDiff=Infinity;
  times.forEach((t,i)=>{
    const d=Math.abs(new Date(t).getTime()-targetMs);
    if(d<bestDiff){bestDiff=d;best=i;}
  });
  return best;
}

function renderStormClouds(offsetHours=0){
  if(!map || !forecastGridData?.length) return;

  clearForecastLayer();
  clearStormCloudLayer();

  stormModeActive=true;
  stormForecastHourOffset=offsetHours;
  mapMode='storm';

  const hourIdx=selectedForecastGridHourIndex(offsetHours);
  if(hourIdx===null) return;

  const candidates=forecastGridData
    .map(entry=>gridPointForForecastEntry(entry,hourIdx))
    .filter(Boolean)
    .map(p=>({...p,risk:stormCellRisk(p)}))
    .filter(p=>p.risk>=18)
    .sort((a,b)=>b.risk-a.risk)
    .slice(0,18);

  const group=L.layerGroup();

  candidates.forEach(p=>{
    const level=stormCellLevel(p.risk);
    const rot=bearingArrowRotation(p.wind_direction_10m);

    const icon=L.divIcon({
      className:'',
      html:`
        <div class="storm-cell-marker ${level}">
          ⛈
          <div class="storm-cell-arrow" style="transform:rotate(${rot}deg)"></div>
        </div>`,
      iconSize:[60,60],
      iconAnchor:[17,17]
    });

    L.marker([p.lat,p.lon],{icon})
      .bindPopup(`
        <div class="storm-cell-popup">
          <strong>⛈ Komórka konwekcyjna</strong><br>
          Ryzyko: ${p.risk}%<br>
          CAPE: ${Math.round(p.cape)} J/kg<br>
          Opad: ${p.precipitation.toFixed(1)} mm/h<br>
          Zachmurzenie: ${Math.round(p.cloud_cover)}%<br>
          Wiatr: ${Math.round(p.wind_speed_10m)} km/h<br>
          Porywy: ${Math.round(p.wind_gusts_10m)} km/h<br>
          Kierunek przemieszczania: ${windDirectionLabel(p.wind_direction_10m)}
        </div>`)
      .addTo(group);
  });

  stormCloudLayer=group.addTo(map);

  const legend=document.getElementById('stormMapLegend');
  legend?.classList.remove('hidden');

  const label=document.getElementById('forecastMapLabel');
  if(label){
    const text=offsetHours===0
      ? 'Chmury burzowe / komórki konwekcyjne — teraz'
      : `Prognoza komórek burzowych +${offsetHours}h`;
    label.innerHTML=`<span>${text}</span><span class="map-kind">BURZE</span>`;
  }

  document.querySelectorAll('.storm-control-btn').forEach(b=>b.classList.remove('active'));
  const activeId=offsetHours===0?'stormCloudsNowBtn':
                 offsetHours===1?'stormForecast1Btn':
                 offsetHours===2?'stormForecast2Btn':'stormForecast3Btn';
  document.getElementById(activeId)?.classList.add('active');
  document.getElementById('stormMapLegend')?.classList.remove('hidden');
}

async function ensureStormForecastGrid(){
  if(!map || !currentPlace || !currentWeatherData) return false;
  if(forecastGridData?.length) return true;
  try{
    await loadForecastGrid(currentPlace,currentWeatherData,map.getBounds());
    return Boolean(forecastGridData?.length);
  }catch(_){
    return false;
  }
}

async function activateStormMap(offsetHours=0){
  const ok=await ensureStormForecastGrid();
  if(!ok){
    document.getElementById('forecastMapLabel').textContent='Nie udało się pobrać danych do mapy burzowej.';
    return;
  }
  renderStormClouds(offsetHours);
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
  mapRefreshTimer=setTimeout(async()=>{
    if(mapMode==='storm'){
      try{
        await loadForecastGrid(currentPlace,currentWeatherData,map.getBounds());
        renderStormClouds(stormForecastHourOffset);
      }catch(_){}
    }else{
      refreshForecastForVisibleMap();
    }
  },350);
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
  stopWeatherAnimation();
  mapMode=mode;
  document.querySelectorAll('.map-tab[data-layer]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.layer===mode);
  });

  if(mode==='forecast'){
    clearStormCloudLayer();
    document.getElementById('stormMapLegend')?.classList.add('hidden');
    document.querySelectorAll('.storm-control-btn').forEach(b=>b.classList.remove('active'));
    if(radarLayer){radarLayer.remove();radarLayer=null;}
    document.querySelector('.map-panel')?.classList.add('forecast-mode');
    if(currentWeatherData && selectedHourIndex!==null){
      renderForecastMapForHour(currentWeatherData,selectedHourIndex);
    }
  }else if(mode==='radar'){
    clearStormCloudLayer();
    document.getElementById('stormMapLegend')?.classList.add('hidden');
    document.querySelectorAll('.storm-control-btn').forEach(b=>b.classList.remove('active'));
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
      if(mapMode==='forecast' || mapMode==='storm') scheduleForecastMapRefresh();
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


function stopWeatherAnimation(){
  weatherAnimationRunning=false;
  clearTimeout(weatherAnimationTimer);
  const b=document.getElementById('weatherAnimationPlay');
  if(b)b.textContent='▶ ANIMACJA';
}
async function prepareWeatherAnimation(){
  const [radarOk,gridOk]=await Promise.allSettled([
    fetch('https://api.rainviewer.com/public/weather-maps.json',{cache:'no-store'}).then(r=>{
      if(!r.ok)throw new Error();
      return r.json();
    }),
    (forecastGridData?.length?Promise.resolve(forecastGridData):loadForecastGrid(currentPlace,currentWeatherData,map.getBounds()))
  ]);
  if(radarOk.status==='fulfilled'){
    const d=radarOk.value;
    weatherAnimationRadarFrames=d.radar?.past||[];
    weatherAnimationRadarHost=d.host||'https://tilecache.rainviewer.com';
  }else{
    weatherAnimationRadarFrames=[];
  }
  return Boolean(weatherAnimationRadarFrames?.length || forecastGridData?.length);
}
function nearestRadarAnimationFrame(targetMs){
  const frames=weatherAnimationRadarFrames||[];
  if(!frames.length)return null;
  return frames.reduce((best,f)=>{
    const d=Math.abs(f.time*1000-targetMs);
    return !best||d<best.d?{f,d}:best;
  },null)?.f||null;
}
function collectGridValuesInterpolated(targetMs){
  const rows=forecastGridMeta.rows,cols=forecastGridMeta.cols;
  const rain=Array.from({length:rows},()=>Array(cols).fill(0));
  const pop=Array.from({length:rows},()=>Array(cols).fill(0));
  forecastGridData.forEach((item,idx)=>{
    const r=Math.floor(idx/cols),c=idx%cols,times=item.data.hourly?.time||[];
    const ms=times.map(t=>new Date(t).getTime());
    let i1=ms.findIndex(x=>x>=targetMs);
    if(i1<0)i1=ms.length-1;
    const i0=Math.max(0,i1-1);
    const a=ms[i0],b=ms[i1],f=b>a?Math.max(0,Math.min(1,(targetMs-a)/(b-a))):0;
    const lerp=(x,y)=>Number(x||0)+(Number(y||0)-Number(x||0))*f;
    rain[r][c]=lerp(item.data.hourly?.precipitation?.[i0],item.data.hourly?.precipitation?.[i1]);
    pop[r][c]=lerp(item.data.hourly?.precipitation_probability?.[i0],item.data.hourly?.precipitation_probability?.[i1]);
  });
  return {rain,pop};
}
function renderAnimationForecast(targetMs,offsetMin){
  if(!forecastGridData?.length||!forecastGridMeta)return;
  if(radarLayer){radarLayer.remove();radarLayer=null}
  clearForecastLayer();
  forecastRasterValues=collectGridValuesInterpolated(targetMs);
  const url=createForecastRaster(forecastRasterValues);
  const bounds=[[forecastGridMeta.minLat,forecastGridMeta.minLon],[forecastGridMeta.maxLat,forecastGridMeta.maxLon]];
  forecastLayer=L.imageOverlay(url,bounds,{opacity:.66,interactive:false,className:'forecast-raster'}).addTo(map);
  document.querySelector('.map-panel')?.classList.remove('map-animation-past');
  document.querySelector('.map-panel')?.classList.add('map-animation-future');
  const dt=new Date(targetMs);
  document.getElementById('forecastMapLabel').innerHTML=`<span>Prognoza animowana <strong>${dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</strong></span><span class="map-kind">MODEL +${offsetMin} min</span>`;
  document.getElementById('radarTime').textContent='Przyszłość: interpolowana prognoza modelowa';
}
function renderAnimationRadar(targetMs,offsetMin){
  const f=nearestRadarAnimationFrame(targetMs);
  if(!f||!map)return;
  clearForecastLayer();
  if(radarLayer)radarLayer.remove();
  radarLayer=L.tileLayer(`${weatherAnimationRadarHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{
    tileSize:256,opacity:.70,minZoom:3,maxNativeZoom:7,maxZoom:18,keepBuffer:6,
    updateWhenZooming:true,updateWhenIdle:false,attribution:'Radar © RainViewer'
  }).addTo(map);
  document.querySelector('.map-panel')?.classList.add('map-animation-past');
  document.querySelector('.map-panel')?.classList.remove('map-animation-future');
  const dt=new Date(f.time*1000);
  document.getElementById('forecastMapLabel').innerHTML=`<span>Radar historyczny <strong>${dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</strong></span><span class="map-kind">RADAR ${offsetMin} min</span>`;
  document.getElementById('radarTime').textContent='Przeszłość: rzeczywista obserwacja radarowa';
}
async function renderWeatherAnimationPosition(offsetMin){
  if(!map||!currentPlace||!currentWeatherData)return;
  mapMode='animation';
  clearStormCloudLayer();
  document.getElementById('stormMapLegend')?.classList.add('hidden');
  const targetMs=Date.now()+Number(offsetMin)*60000;
  if(Number(offsetMin)<=0)renderAnimationRadar(targetMs,offsetMin);
  else renderAnimationForecast(targetMs,offsetMin);
  const lab=document.getElementById('weatherAnimationTime');
  if(lab)lab.textContent=offsetMin===0?'TERAZ':`${offsetMin>0?'+':''}${offsetMin} min`;
}
async function playWeatherAnimation(){
  if(weatherAnimationRunning){stopWeatherAnimation();return}
  const ok=await prepareWeatherAnimation();
  if(!ok)return;
  weatherAnimationRunning=true;
  const b=document.getElementById('weatherAnimationPlay');if(b)b.textContent='❚❚ PAUZA';
  const slider=document.getElementById('weatherAnimationSlider');
  let v=-60;
  const step=async()=>{
    if(!weatherAnimationRunning)return;
    slider.value=String(v);
    await renderWeatherAnimationPosition(v);
    v+=10;
    if(v>120)v=-60;
    weatherAnimationTimer=setTimeout(step,700);
  };
  step();
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
    if(currentPlace&&currentWeatherData) sampleRadarNow(currentPlace,currentWeatherData).catch(()=>{});
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
    key:'ecmwf',
    name:'ECMWF IFS',
    subtitle:'IFS HRES 9 km • MODEL GŁÓWNY',
    endpoint:'https://api.open-meteo.com/v1/forecast',
    model:'ecmwf_ifs',
    accent:'ECMWF'
  },
  {
    key:'aifs',
    name:'ECMWF AIFS',
    subtitle:'AIFS 0.25° Single • MODEL AI',
    endpoint:'https://api.open-meteo.com/v1/forecast',
    model:'ecmwf_aifs025_single',
    accent:'AIFS'
  },
  {
    key:'icon',
    name:'ICON',
    subtitle:'DWD ICON Seamless',
    endpoint:'https://api.open-meteo.com/v1/forecast',
    model:'icon_seamless',
    accent:'DWD'
  },
  {
    key:'gfs',
    name:'GFS',
    subtitle:'NOAA GFS Seamless',
    endpoint:'https://api.open-meteo.com/v1/forecast',
    model:'gfs_seamless',
    accent:'NOAA'
  }
]

let modelComparisonData=null;

async function fetchSpecificModel(spec,place,timezone='auto'){
  const makeUrl=(vars)=>{
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',place.latitude);
    url.searchParams.set('longitude',place.longitude);
    url.searchParams.set('timezone',timezone||'auto');
    url.searchParams.set('forecast_days','3');
    url.searchParams.set('models',spec.model);
    url.searchParams.set('hourly',vars.join(','));
    return url;
  };

  const coreVars=[
    'temperature_2m',
    'apparent_temperature',
    'precipitation',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
  ];

  // Najpierw pełny zestaw. Jeżeli dany model nie obsługuje POP,
  // ponawiamy bez precipitation_probability.
  let res=await fetch(makeUrl([...coreVars,'precipitation_probability']));

  if(!res.ok){
    res=await fetch(makeUrl(coreVars));
  }

  if(!res.ok){
    const text=await res.text().catch(()=> '');
    throw new Error(`${spec.name}: ${res.status} ${text}`.trim());
  }

  const data=await res.json();

  if(!data?.hourly?.time?.length){
    throw new Error(`${spec.name}: API nie zwróciło danych godzinowych.`);
  }

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
  const pts=(modelComparisonData||[])
    .map(x=>modelPoint(x,targetTime))
    .filter(Boolean);

  const count=pts.length;
  const total=MODEL_SPECS.length;

  if(count<2){
    return {
      score:0,
      label:'BRAK DANYCH',
      text:'Za mało modeli odpowiedziało, aby policzyć zgodność.',
      count,total
    };
  }

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
    text='Dostępne modele pokazują bardzo podobny przebieg temperatury, opadu i wiatru.';
  }else if(score>=55){
    label='UMIARKOWANA';
    text='Dostępne modele są częściowo zgodne, ale występują zauważalne różnice.';
  }else{
    label='NISKA';
    text='Dostępne modele wyraźnie się różnią. Prognozę należy traktować jako mniej pewną.';
  }

  if(count<total){
    text+=` Porównanie jest niepełne — odpowiedziało ${count} z ${total} modeli.`;
  }

  return {score,label,text,tempSpread,rainSpread,gustSpread,count,total};
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
  document.getElementById('modelsAgreementValue').textContent=
    a.count>=2 ? `${a.label} ${a.score}%` : a.label;

  const availability=document.getElementById('modelsAvailability');
  if(availability){
    availability.textContent=`${a.count}/${a.total} modeli dostępnych`;
    availability.className='models-availability '+(a.count===a.total?'complete':'partial');
  }

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
  document.getElementById('modelsCards').innerHTML='<div class="model-error">Pobieram ECMWF AIFS, ECMWF IFS, ICON i GFS…</div>';
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



function lightningWarningFromData(data){
  const area=data?.storm_area_50km;
  const h=data?.hourly;
  let maxCape=0;

  if(h?.cape?.length){
    maxCape=Math.max(...h.cape.slice(0,12).map(v=>Number(v||0)));
  }

  const risk=Math.max(
    Number(area?.risk||0),
    maxCape>=1500?70:
    maxCape>=900?50:
    maxCape>=500?30:
    maxCape>=250?15:0
  );

  if(risk>=70){
    return {
      level:'severe',
      title:'OSTRZEŻENIE: wysokie ryzyko burz',
      text:`W promieniu 50 km wykryto silny sygnał konwekcyjny. Szacowane ryzyko około ${Math.round(risk)}%. Obserwuj mapę LIVE i oficjalne ostrzeżenia.`
    };
  }
  if(risk>=45){
    return {
      level:'high',
      title:'Podwyższone ryzyko burz',
      text:`Możliwy rozwój burz w pobliżu. Szacowane ryzyko około ${Math.round(risk)}%. Sprawdź mapę LIVE.`
    };
  }
  if(risk>=20){
    return {
      level:'medium',
      title:'Możliwe burze w regionie',
      text:`Sygnał konwekcyjny jest umiarkowany. Szacowane ryzyko około ${Math.round(risk)}%.`
    };
  }
  return {
    level:'low',
    title:'Brak aktywnego ostrzeżenia burzowego',
    text:`W promieniu 50 km nie widać obecnie silnego sygnału modelowego. Najwyższe szacowane ryzyko: ${Math.round(risk)}%.`
  };
}

function renderLightningWarning(data){
  const box=document.getElementById('lightningWarningBox');
  if(!box) return;

  const w=lightningWarningFromData(data);
  box.className='lightning-warning-box level-'+w.level;
  document.getElementById('lightningWarningTitle').textContent=w.title;
  document.getElementById('lightningWarningText').textContent=w.text;
}







function applyResponsiveMapFix(){
  if(!map) return;
  setTimeout(()=>{
    map.invalidateSize(false);
  },80);
}






function regional50kmPoints(place){
  const lat=Number(place.latitude),lon=Number(place.longitude);
  const latD=50/111.32;
  const lonD=50/(111.32*Math.max(.25,Math.cos(lat*Math.PI/180)));
  return [
    [lat,lon],
    [lat+latD,lon],[lat-latD,lon],
    [lat,lon+lonD],[lat,lon-lonD],
    [lat+latD*.70,lon+lonD*.70],[lat+latD*.70,lon-lonD*.70],
    [lat-latD*.70,lon+lonD*.70],[lat-latD*.70,lon-lonD*.70],
  ];
}
async function getRegionalHazards50km(place,timezone='auto'){
  const pts=regional50kmPoints(place);
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',pts.map(p=>p[0].toFixed(4)).join(','));
  u.searchParams.set('longitude',pts.map(p=>p[1].toFixed(4)).join(','));
  u.searchParams.set('timezone',timezone||'auto');
  u.searchParams.set('forecast_days','3');
  u.searchParams.set('models','ecmwf_ifs');
  u.searchParams.set('hourly',[
    'temperature_2m','precipitation','precipitation_probability',
    'weather_code','wind_gusts_10m','cape'
  ].join(','));
  const res=await fetch(u);
  if(!res.ok) throw new Error('Brak regionalnej analizy 50 km');
  const data=await res.json();
  return Array.isArray(data)?data:[data];
}
function regionalDayExtremes(dateKey){
  const rows=currentWeatherData?.region50km;
  if(!Array.isArray(rows)||!rows.length) return null;
  const out={maxTemp:-Infinity,minTemp:Infinity,maxRain:0,rainSumMax:0,maxPop:0,maxGust:0,maxCape:0,codes:[]};
  rows.forEach(d=>{
    const ids=[];
    (d.hourly?.time||[]).forEach((t,i)=>{if(String(t).slice(0,10)===dateKey)ids.push(i)});
    let sum=0;
    ids.forEach(i=>{
      const h=d.hourly||{};
      const temp=Number(h.temperature_2m?.[i]);
      if(Number.isFinite(temp)){out.maxTemp=Math.max(out.maxTemp,temp);out.minTemp=Math.min(out.minTemp,temp)}
      const rain=Number(h.precipitation?.[i]||0);sum+=rain;out.maxRain=Math.max(out.maxRain,rain);
      out.maxPop=Math.max(out.maxPop,Number(h.precipitation_probability?.[i]||0));
      out.maxGust=Math.max(out.maxGust,Number(h.wind_gusts_10m?.[i]||0));
      out.maxCape=Math.max(out.maxCape,Number(h.cape?.[i]||0));
      out.codes.push(Number(h.weather_code?.[i]||0));
    });
    out.rainSumMax=Math.max(out.rainSumMax,sum);
  });
  if(out.maxTemp===-Infinity)return null;
  return out;
}

function rcbWeatherKeywords(text){
  const t=normalizePolishText(text);
  return ['burz','wiatr','opad','deszcz','grad','wichur','traba','tromb','snieg','ulew','pogoda'].some(k=>t.includes(k));
}
function rcbAppliesToCurrentPlace(text){
  const t=normalizePolishText(text);
  if(t.includes('cala polska')||t.includes('caly kraj')||t.includes('terenie calego kraju'))return true;
  const terms=[currentPlace?.name,currentPlace?.admin2,currentPlace?.admin1]
    .map(normalizePolishText).filter(x=>x&&x.length>=4);
  return terms.some(term=>t.includes(term));
}
function parseRcbDateFromText(text){
  const now=new Date();
  let m=String(text).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
  m=String(text).match(/\((\d{1,2})[./](\d{1,2})\)/);
  if(m)return new Date(now.getFullYear(),Number(m[2])-1,Number(m[1]));
  return null;
}
function rcbDateIsCurrent(d){
  if(!d)return false;
  const today=new Date();today.setHours(0,0,0,0);
  const delta=(d.getTime()-today.getTime())/86400000;
  return delta>=-1 && delta<=1;
}
async function fetchRcbAlerts(){
  rcbAlertsData=[];
  try{
    const res=await fetch('https://www.gov.pl/web/rcb/komunikaty',{cache:'no-store'});
    if(!res.ok)throw new Error('RCB HTTP '+res.status);
    const html=await res.text();
    const doc=new DOMParser().parseFromString(html,'text/html');
    const links=[...doc.querySelectorAll('a[href*="/web/rcb/"]')]
      .filter(a=>/alert\s*rcb/i.test(a.textContent||'') && rcbWeatherKeywords(a.textContent||''));
    const seen=new Set(), candidates=[];
    for(const a of links){
      const href=new URL(a.getAttribute('href'), 'https://www.gov.pl').href;
      if(seen.has(href))continue;seen.add(href);
      let node=a,cardText=a.textContent||'';
      for(let k=0;k<5&&node?.parentElement;k++){
        node=node.parentElement;
        const tx=(node.textContent||'').trim();
        if(tx.length>cardText.length && tx.length<2200)cardText=tx;
      }
      const date=parseRcbDateFromText(cardText+' '+a.textContent);
      if(!rcbDateIsCurrent(date))continue;
      candidates.push({title:(a.textContent||'Alert RCB').trim(),href,date,preview:cardText});
      if(candidates.length>=6)break;
    }
    const detailed=await Promise.all(candidates.map(async c=>{
      try{
        const r=await fetch(c.href,{cache:'no-store'});
        if(!r.ok)return c;
        const h=await r.text();
        const d=new DOMParser().parseFromString(h,'text/html');
        const txt=(d.querySelector('main')?.textContent||d.body?.textContent||c.preview).replace(/\s+/g,' ').trim();
        return {...c,text:txt};
      }catch(_){return c}
    }));
    rcbAlertsData=detailed.filter(c=>rcbAppliesToCurrentPlace(c.text||c.preview||c.title));
  }catch(_){
    // Gov.pl może blokować odczyt cross-origin w części przeglądarek.
    rcbAlertsData=[];
  }
  return rcbAlertsData;
}
function renderRcbAlerts(){
  const box=document.getElementById('rcbWarningsList');if(!box)return;
  if(!rcbAlertsData.length){
    box.innerHTML='<div class="official-warning-empty">Brak świeżego Alertu RCB dopasowanego do tego regionu lub serwis RCB nie pozwolił na automatyczny odczyt.</div>';
    return;
  }
  box.innerHTML=rcbAlertsData.map(a=>`
    <article class="rcb-alert-card">
      <strong>⚠ ALERT RCB • ${escapeHtml(a.title)}</strong>
      <div class="rcb-meta">${a.date?a.date.toLocaleDateString('pl-PL'):'dzisiaj'} • Rządowe Centrum Bezpieczeństwa</div>
      <p>${escapeHtml((a.text||a.preview||'').slice(0,700))}</p>
      <a href="${escapeHtml(a.href)}" target="_blank" rel="noopener noreferrer">Otwórz oficjalny komunikat ↗</a>
    </article>`).join('');
}

function normalizePolishText(value){
  return String(value||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/^wojewodztwo\s+/,'').trim();
}
function currentVoivodeship(){return normalizePolishText(currentPlace?.admin1||'')}
function parseImgwDate(value){
  if(!value || String(value).startsWith('9999-')) return null;
  const d=new Date(String(value).replace(' ','T'));
  return Number.isNaN(d.getTime())?null:d;
}
function warningVoivodeships(w){
  const areas=Array.isArray(w.obszary)?w.obszary:[];
  return areas.map(a=>normalizePolishText(a.wojewodztwo)).filter(Boolean);
}
function warningMatchesLocal(w){
  const voiv=currentVoivodeship();
  if(!voiv) return true;
  return warningVoivodeships(w).some(v=>v===voiv||v.includes(voiv)||voiv.includes(v));
}
function startOfToday(){
  const d=new Date();d.setHours(0,0,0,0);return d;
}
function warningHorizonEnd(){
  const d=startOfToday();d.setDate(d.getDate()+3);return d;
}
function warningIsFresh(w){
  const now=Date.now();
  const from=parseImgwDate(w.data_od)?.getTime()??now;
  const to=parseImgwDate(w.data_do)?.getTime()??Infinity;
  const published=parseImgwDate(w.opublikowano)?.getTime()??from;
  if(!(to>=now && from<warningHorizonEnd().getTime())) return false;

  // Stare bezterminowe komunikaty (np. susza z kwietnia/maja) nie trafiają
  // do centrum bieżących ostrzeżeń. Pokazujemy komunikaty wydane do 72 h temu
  // albo te, które zaczynają obowiązywać dopiero w horyzoncie 3 dni.
  return published>=now-72*3600_000 || from>=startOfToday().getTime();
}
async function fetchImgwEndpoint(url){
  const res=await fetch(url,{cache:'no-store'});
  if(res.status===404) return [];
  if(!res.ok) throw new Error(`IMGW HTTP ${res.status}`);
  const data=await res.json();return Array.isArray(data)?data:[];
}
async function fetchImgwWarnings(){
  const [m,h]=await Promise.allSettled([
    fetchImgwEndpoint('https://danepubliczne.imgw.pl/api/data/warningsmeteo'),
    fetchImgwEndpoint('https://danepubliczne.imgw.pl/api/data/warningshydro')
  ]);
  imgwWarningsData={
    meteo:m.status==='fulfilled'?m.value.filter(w=>warningIsFresh(w)&&warningMatchesLocal(w)):[],
    hydro:h.status==='fulfilled'?h.value.filter(w=>warningIsFresh(w)&&warningMatchesLocal(w)):[]
  };
  return {meteoError:m.status==='rejected'?m.reason:null,hydroError:h.status==='rejected'?h.reason:null};
}
function freshOfficialWarnings(){
  return [...imgwWarningsData.meteo.map(w=>({...w,_type:'meteo'})),
          ...imgwWarningsData.hydro.map(w=>({...w,_type:'hydro'}))]
    .sort((a,b)=>(parseInt(b.stopień)||0)-(parseInt(a.stopień)||0));
}
function escapeHtml(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function dayIndicesForDate(data,dateKey){
  const out=[];(data?.hourly?.time||[]).forEach((t,i)=>{
    if(String(t).slice(0,10)===dateKey) out.push(i);
  });return out;
}
function nextThreeDateKeys(){
  const today=startOfToday(),keys=[];
  for(let n=0;n<3;n++){
    const d=new Date(today);d.setDate(d.getDate()+n);
    keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  return keys;
}
function hazard(level,icon,title,text){return {level,icon,title,text}}
function analyseDayHazards(data,dateKey){
  const ids=dayIndicesForDate(data,dateKey);
  if(!ids.length) return {hazards:[],level:0,summary:'Brak pełnych danych dla tego dnia.'};
  const h=data.hourly;
  const nums=key=>ids.map(i=>Number(h[key]?.[i])).filter(Number.isFinite);
  const mx=(a,d=0)=>a.length?Math.max(...a):d, mn=(a,d=0)=>a.length?Math.min(...a):d;
  const temps=nums('temperature_2m'),gusts=nums('wind_gusts_10m'),pop=nums('precipitation_probability'),cape=nums('cape');
  const rain=ids.map(i=>Number(effectiveHourlyPrecipitation(data,i)||0));
  const codes=ids.map(i=>Number(h.weather_code?.[i]||0));
  let maxTemp=mx(temps),minTemp=mn(temps),maxGust=mx(gusts),maxPop=mx(pop),maxCape=mx(cape);
  let rainSum=rain.reduce((a,b)=>a+b,0),maxRain=mx(rain);
  const region=regionalDayExtremes(dateKey);
  if(region){
    maxTemp=Math.max(maxTemp,region.maxTemp);
    minTemp=Math.min(minTemp,region.minTemp);
    maxGust=Math.max(maxGust,region.maxGust);
    maxPop=Math.max(maxPop,region.maxPop);
    maxCape=Math.max(maxCape,region.maxCape);
    rainSum=Math.max(rainSum,region.rainSumMax);
    maxRain=Math.max(maxRain,region.maxRain);
    codes.push(...region.codes);
  }
  const hazards=[];
  const hail=codes.some(c=>c===96||c===99), thunder=codes.some(c=>[95,96,99].includes(c));

  if(hail) hazards.push(hazard(3,'⛈️','Silne burze / możliwy grad','Możliwe gwałtowne porywy, lokalne podtopienia i szkody od gradu.'));
  else if(thunder || (maxCape>=1000&&maxPop>=45))
    hazards.push(hazard(maxCape>=1800?3:2,'⛈️','Ryzyko burz',`CAPE do ${Math.round(maxCape)} J/kg, prawdopodobieństwo opadu do ${Math.round(maxPop)}%. Możliwe wyładowania i gwałtowne porywy.`));
  else if(maxCape>=600&&maxPop>=30)
    hazards.push(hazard(1,'🌩️','Możliwy rozwój burz',`Podwyższona chwiejność atmosfery (CAPE do ${Math.round(maxCape)} J/kg).`));

  if(maxRain>=10||rainSum>=30) hazards.push(hazard(3,'🌧️','Bardzo silne opady',`Suma około ${rainSum.toFixed(1)} mm, chwilami do ${maxRain.toFixed(1)} mm/h. Możliwe podtopienia i aquaplaning.`));
  else if(maxRain>=5||rainSum>=15) hazards.push(hazard(2,'🌧️','Silne opady',`Suma około ${rainSum.toFixed(1)} mm. Możliwe zastoiska wody i ograniczenie widoczności.`));
  else if(rainSum>=7) hazards.push(hazard(1,'🌦️','Intensywniejszy deszcz',`Suma opadu około ${rainSum.toFixed(1)} mm.`));

  if(maxGust>=90) hazards.push(hazard(3,'💨','Bardzo silny wiatr / wichura',`Porywy około ${Math.round(maxGust)} km/h. Możliwe łamanie drzew, uszkodzenia i przerwy w dostawie energii.`));
  else if(maxGust>=70) hazards.push(hazard(2,'💨','Silny wiatr',`Porywy do około ${Math.round(maxGust)} km/h. Uważaj na gałęzie i lekkie przedmioty.`));
  else if(maxGust>=50) hazards.push(hazard(1,'💨','Silniejsze porywy',`Porywy do około ${Math.round(maxGust)} km/h.`));

  if(maxTemp>=35) hazards.push(hazard(3,'🌡️','Silny upał',`Temperatura do około ${Math.round(maxTemp)}°C.`));
  else if(maxTemp>=30) hazards.push(hazard(1,'🌡️','Upał',`Temperatura maksymalna około ${Math.round(maxTemp)}°C.`));
  if(minTemp<=-5) hazards.push(hazard(2,'🥶','Silny mróz',`Temperatura może spaść do około ${Math.round(minTemp)}°C.`));
  else if(minTemp<0) hazards.push(hazard(1,'❄️','Przymrozek',`Temperatura minimalna około ${Math.round(minTemp)}°C.`));
  if(codes.some(c=>[71,73,75,77,85,86].includes(c))) hazards.push(hazard(1,'🌨️','Śnieg / śliskość','Możliwe utrudnienia drogowe i ograniczenie widoczności.'));

  const level=Math.max(0,...hazards.map(x=>x.level));
  return {hazards,level,summary:`${Math.round(minTemp)}–${Math.round(maxTemp)}°C • opad ${rainSum.toFixed(1)} mm • porywy do ${Math.round(maxGust)} km/h`};
}
function dayLevelClass(l){return l>=3?'danger':l===2?'warning':l===1?'watch':'safe'}
function dayLevelLabel(l){return l>=3?'WYSOKIE':l===2?'PODWYŻSZONE':l===1?'OBSERWUJ':'SPOKOJNIE'}
function localOfficialWarningsForDate(key){
  const a=new Date(key+'T00:00:00').getTime(),b=new Date(key+'T23:59:59').getTime();
  return freshOfficialWarnings().filter(w=>{
    const f=parseImgwDate(w.data_od)?.getTime()??-Infinity,t=parseImgwDate(w.data_do)?.getTime()??Infinity;
    return t>=a&&f<=b;
  });
}
function impactFromOfficialWarning(w){
  const t=normalizePolishText(`${w.zdarzenie||''} ${w.przebieg||''}`),x=[];
  if(t.includes('burz')) x.push('wyładowania, gwałtowne porywy i lokalne podtopienia');
  if(t.includes('grad')) x.push('możliwe szkody od gradu');
  if(t.includes('wiatr')||t.includes('wichur')) x.push('łamanie gałęzi, drzewa na drogach i uszkodzenia');
  if(t.includes('opad')||t.includes('deszcz')) x.push('podtopienia, aquaplaning i ograniczenie widoczności');
  if(t.includes('trab')||t.includes('tromb')) x.push('bardzo gwałtowne zjawiska konwekcyjne');
  if(t.includes('snie')||t.includes('oblodz')) x.push('śliskość i utrudnienia komunikacyjne');
  return x.length?x.join('; '):'zachowaj ostrożność i śledź komunikaty IMGW';
}
function renderThreeDayWarnings(){
  const box=document.getElementById('warningsThreeDays');if(!box||!currentWeatherData)return;
  box.innerHTML=nextThreeDateKeys().map((key,idx)=>{
    const dt=new Date(key+'T12:00:00'),label=idx===0?'Dzisiaj':dt.toLocaleDateString('pl-PL',{weekday:'long'});
    const app=analyseDayHazards(currentWeatherData,key),off=localOfficialWarningsForDate(key);
    const offLvl=Math.max(0,...off.map(w=>parseInt(w.stopień)||2)),level=Math.max(app.level,off.length?Math.max(2,offLvl):0);
    const oh=off.map(w=>`<div class="warning-hazard"><div class="warning-hazard-icon">⚠️</div><div><strong>IMGW: ${escapeHtml(w.zdarzenie||'ostrzeżenie')}</strong><span>${escapeHtml(impactFromOfficialWarning(w))}</span></div></div>`).join('');
    const ah=app.hazards.map(q=>`<div class="warning-hazard"><div class="warning-hazard-icon">${q.icon}</div><div><strong>${escapeHtml(q.title)}</strong><span>${escapeHtml(q.text)}</span></div></div>`).join('');
    return `<article class="warning-day-card level-${dayLevelClass(level)}">
      <div class="warning-day-head"><div><strong>${label}</strong><span>${dt.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'})}</span></div><div class="warning-day-level">${dayLevelLabel(level)}</div></div>
      <div class="warning-day-items">${oh}${ah}${!oh&&!ah?'<div class="warning-day-empty">✓ Brak istotnych zagrożeń</div>':''}</div>
      <div class="warning-day-summary">${escapeHtml(app.summary)}</div></article>`;
  }).join('');
}
function renderOfficialFreshWarnings(){
  const list=document.getElementById('warningsOfficialList');if(!list)return;
  const rows=freshOfficialWarnings();
  if(!rows.length){list.innerHTML='<div class="official-warning-empty">✓ IMGW nie publikuje obecnie świeżego ostrzeżenia dla tego regionu.</div>';return}
  list.innerHTML=rows.map(w=>{
    const lvl=parseInt(w.stopień)||1,f=parseImgwDate(w.data_od),t=parseImgwDate(w.data_do),fd=d=>d?d.toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
    return `<article class="official-warning-card level-${lvl}"><strong>IMGW • ${escapeHtml(w.zdarzenie||'Ostrzeżenie')} • ${lvl}. stopień</strong>
    <div class="official-meta">${fd(f)} – ${fd(t)} • prawdopodobieństwo ${escapeHtml(w.prawdopodobienstwo||'—')}%</div>
    <p>${escapeHtml(w.przebieg||'Brak szczegółowego opisu.')} <b>Możliwe skutki:</b> ${escapeHtml(impactFromOfficialWarning(w))}.</p></article>`;
  }).join('');
}
function overallWarningState(){
  const off=freshOfficialWarnings();
  let lvl=rcbAlertsData.length?3:(off.length?Math.max(2,...off.map(w=>parseInt(w.stopień)||1)):0);
  if(currentWeatherData) nextThreeDateKeys().forEach(k=>lvl=Math.max(lvl,analyseDayHazards(currentWeatherData,k).level));
  if(lvl>=3)return{level:3,cls:'danger',icon:'⚠',title:'Wysokie zagrożenie pogodowe',text:'W najbliższych 72 godzinach występuje lub jest prognozowane niebezpieczne zjawisko. Sprawdź szczegóły poniżej.'};
  if(lvl===2)return{level:2,cls:'warning',icon:'!',title:'Podwyższone zagrożenie pogodowe',text:'W najbliższych 72 godzinach możliwe są niebezpieczne zjawiska. Sprawdź możliwe skutki.'};
  if(lvl===1)return{level:1,cls:'watch',icon:'◉',title:'Warunki wymagają obserwacji',text:'Nie ma silnego ostrzeżenia, ale prognoza wskazuje zjawiska, które warto monitorować.'};
  return{level:0,cls:'safe',icon:'✓',title:'Brak istotnych zagrożeń',text:'Na dziś i dwa kolejne dni nie wykryto istotnego zagrożenia dla wybranego regionu.'};
}
function renderWarnings(){
  renderThreeDayWarnings();renderRcbAlerts();renderOfficialFreshWarnings();
  const s=overallWarningState(),hero=document.getElementById('warningsHero');
  if(hero){hero.className='warnings-hero '+s.cls;hero.querySelector('.warnings-hero-icon').textContent=s.icon}
  document.getElementById('warningsHeroTitle').textContent=s.title;
  document.getElementById('warningsHeroText').textContent=s.text;
  const badge=document.getElementById('warningsNavBadge'),off=freshOfficialWarnings();
  if(badge){const c=off.length||(s.level>=2?1:0);badge.textContent=String(c);badge.classList.toggle('hidden',c===0)}
  const st=document.getElementById('warningsStatus');
  if(st){st.className='warnings-status ok';st.textContent='Pokazuję wyłącznie świeże ostrzeżenia dotyczące bieżącego dnia i kolejnych 2 dni.'}
  return s;
}
function warningSignature(){
  const off=freshOfficialWarnings().map(w=>`${w.numer||''}:${w.stopień||''}:${w.data_od||''}`).join('|'),s=overallWarningState();
  const rcb=rcbAlertsData.map(a=>a.href).join('|');
  return `${new Date().toISOString().slice(0,10)}|${currentVoivodeship()}|${s.level}|${off}|${rcb}`;
}
function maybeAutoOpenWarnings(){
  const s=overallWarningState();
  if(s.level<2&&freshOfficialWarnings().length===0&&rcbAlertsData.length===0)return;
  const sig=warningSignature();
  if(sessionStorage.getItem('meteo_warning_popup_signature')===sig)return;
  sessionStorage.setItem('meteo_warning_popup_signature',sig);
  openWarningsModal(false);
}
async function refreshWarnings(autoPopup=false){
  const st=document.getElementById('warningsStatus');
  if(st){st.className='warnings-status';st.textContent='Pobieram świeże ostrzeżenia IMGW…'}
  try{
    const [e]=await Promise.all([fetchImgwWarnings(),fetchRcbAlerts()]);
    renderWarnings();
    if(e.meteoError||e.hydroError){st.className='warnings-status error';st.textContent='Nie wszystkie kanały IMGW odpowiedziały. Pokazuję dostępne świeże dane oraz prognozę zagrożeń aplikacji.'}
    if(autoPopup)maybeAutoOpenWarnings();
  }catch(err){
    renderWarnings();
    if(st){st.className='warnings-status error';st.textContent='IMGW chwilowo niedostępne. Pokazuję prognozę zagrożeń aplikacji na 72 godziny.'}
    if(autoPopup)maybeAutoOpenWarnings();
  }
}
async function openWarningsModal(refresh=true){
  document.getElementById('warningsLocationLabel').textContent=currentPlace?placeLabel(currentPlace):'Aktualna lokalizacja';
  const m=document.getElementById('warningsModal');m?.classList.remove('hidden');m?.setAttribute('aria-hidden','false');
  if(refresh)await refreshWarnings(false);else renderWarnings();
}
function closeWarningsModal(){
  const m=document.getElementById('warningsModal');m?.classList.add('hidden');m?.setAttribute('aria-hidden','true');
}
function hookWarningsMenu(){
  const c=[...document.querySelectorAll('.nav-item, nav button, nav a, .sidebar button, .sidebar a')];
  const b=c.find(el=>el.textContent.includes('Ostrzeżenia'));if(!b)return;
  b.classList.remove('disabled');b.removeAttribute('disabled');
  b.addEventListener('click',e=>{e.preventDefault();openWarningsModal(true)});
}


function formatClock(date){
  if(!date) return '—';
  return date.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
}

function updateAutoRefreshUi(state='idle'){
  const bar=document.getElementById('autoRefreshStatus');
  const last=document.getElementById('autoRefreshLast');
  const next=document.getElementById('autoRefreshNext');

  if(bar){
    bar.classList.remove('refreshing','error');
    if(state==='refreshing') bar.classList.add('refreshing');
    if(state==='error') bar.classList.add('error');
  }

  if(last){
    last.textContent='Ostatnia aktualizacja: '+formatClock(lastSuccessfulRefreshAt);
  }

  if(next){
    if(!autoRefreshNextAt){
      next.textContent='Następna: —';
    }else{
      const remain=Math.max(0,autoRefreshNextAt-Date.now());
      const min=Math.floor(remain/60000);
      const sec=Math.floor((remain%60000)/1000);
      next.textContent=`Następna za ${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }
  }
}

function scheduleNextAutoRefresh(){
  clearTimeout(autoRefreshTimer);
  clearInterval(autoRefreshCountdownTimer);

  if(!currentPlace){
    autoRefreshNextAt=null;
    updateAutoRefreshUi();
    return;
  }

  autoRefreshNextAt=Date.now()+AUTO_REFRESH_INTERVAL_MS;
  updateAutoRefreshUi();

  autoRefreshCountdownTimer=setInterval(()=>updateAutoRefreshUi(),1000);

  autoRefreshTimer=setTimeout(async()=>{
    await refreshCurrentWeatherData(true);
  },AUTO_REFRESH_INTERVAL_MS);
}

async function refreshActiveMapAfterDataUpdate(){
  if(!map || !currentPlace || !currentWeatherData) return;

  try{
    if(mapMode==='radar'){
      await loadRadar();
      return;
    }

    if(mapMode==='storm'){
      await loadForecastGrid(currentPlace,currentWeatherData,map.getBounds());
      renderStormClouds(stormForecastHourOffset);
      return;
    }

    if(mapMode==='animation'){
      await prepareWeatherAnimation();
      const slider=document.getElementById('weatherAnimationSlider');
      const offset=Number(slider?.value||0);
      await renderWeatherAnimationPosition(offset);
      return;
    }

    if(mapMode==='forecast'){
      await loadForecastGrid(currentPlace,currentWeatherData,map.getBounds());
      if(selectedHourIndex!==null){
        renderForecastMapForHour(currentWeatherData,selectedHourIndex);
      }
    }
  }catch(_){}
}

async function refreshCurrentWeatherData(isAutomatic=false){
  if(!currentPlace || autoRefreshInProgress) return;

  autoRefreshInProgress=true;
  updateAutoRefreshUi('refreshing');

  const place={...currentPlace};
  const keepSelected=selectedHourIndex;

  try{
    const weather=await getWeather(place.latitude,place.longitude);

    // Zachowujemy wybraną lokalizację i nie wywołujemy initOrUpdateMap(),
    // więc mapa nie wraca do widoku 50 km przy każdym odświeżeniu.
    currentWeatherData=weather;
    currentPlace=place;

    renderPlace(place);
    renderCurrent(weather);
    await sampleRadarNow(place,weather).catch(()=>{});
    sampleRadarNow(place,weather).catch(()=>{});
    renderHourly(weather);
    renderAnalysis(weather);

    if(keepSelected!==null){
      selectedHourIndex=keepSelected;
      const selectedCard=document.querySelector(`.hour-card[data-hour-index="${keepSelected}"]`);
      if(selectedCard){
        document.querySelectorAll('.hour-card').forEach(c=>c.classList.remove('selected'));
        selectedCard.classList.add('selected');
        renderHourDetails(weather,keepSelected);
      }
    }

    // Dane 15-min.
    try{
      const quarter=await getQuarterHourWeather(
        place.latitude,
        place.longitude,
        weather.timezone||'auto'
      );
      let dwd=null;
      try{
        dwd=await getLightning15Dwd(
          place.latitude,
          place.longitude,
          weather.timezone||'auto'
        );
      }catch(_){}

      weather.quarter_hour=mergeQuarterHourData(quarter,dwd);
      currentWeatherData=weather;
      updateVisualDashboard(weather);

      renderHourly(weather);
      if(keepSelected!==null){
        selectedHourIndex=keepSelected;
        const selectedCard=document.querySelector(`.hour-card[data-hour-index="${keepSelected}"]`);
        if(selectedCard){
          document.querySelectorAll('.hour-card').forEach(c=>c.classList.remove('selected'));
          selectedCard.classList.add('selected');
          renderHourDetails(weather,keepSelected);
        }
      }
    }catch(_){
      weather.quarter_hour=null;
      currentWeatherData=weather;
    }

    // Analiza regionalna 50 km.
    try{
      weather.region50km=await getRegionalHazards50km(
        place,
        weather.timezone||'auto'
      );
    }catch(_){}

    // Analiza burzowa 50 km.
    try{
      weather.storm_area_50km=await getStormArea50km(
        place,
        weather.timezone||'auto'
      );
      renderAnalysis(weather);
      renderLightningWarning(weather);
    }catch(_){}

    currentWeatherData=weather;

    // Świeże ostrzeżenia i RCB.
    await refreshWarnings(true).catch(()=>{});

    // Odświeżamy tylko aktualnie oglądaną warstwę mapy,
    // bez zmiany zoomu i pozycji użytkownika.
    await refreshActiveMapAfterDataUpdate();

    lastSuccessfulRefreshAt=new Date();
    document.getElementById('sideUpdated').textContent=
      'Ostatnia aktualizacja: '+lastSuccessfulRefreshAt.toLocaleString('pl-PL');

    searchStatus.className='status';
    searchStatus.textContent=isAutomatic
      ? `Dane automatycznie odświeżone o ${formatClock(lastSuccessfulRefreshAt)}.`
      : 'Dane odświeżone.';

    updateAutoRefreshUi('idle');
  }catch(err){
    searchStatus.className='status error';
    searchStatus.textContent=
      `Automatyczne odświeżenie nie powiodło się. Pozostawiam ostatnie poprawne dane.`;

    updateAutoRefreshUi('error');
  }finally{
    autoRefreshInProgress=false;
    scheduleNextAutoRefresh();
  }
}

async function runPlace(place){
  searchStatus.className='status';searchStatus.textContent='Pobieram prognozę…';citySuggestions.classList.add('hidden');
  try{
    const weather=await getWeather(place.latitude,place.longitude);currentWeatherData=weather;currentPlace=place;
    setTimeout(()=>refreshWarnings(true).catch(()=>{}),1200);forecastGridData=null;forecastGridMeta=null;forecastRasterValues=null;
    renderPlace(place);
    renderCurrent(weather);
    renderHourly(weather);
    renderAnalysis(weather);
    emptyState.classList.add('hidden');
    weatherSection.classList.remove('hidden');
    searchStatus.textContent='Prognoza główna: ECMWF IFS HRES 9 km. Pobieram dane 15-min i analizę burz w promieniu 50 km…';
    initOrUpdateMap(place).catch(()=>{});

    getRegionalHazards50km(place,weather.timezone||'auto')
      .then(region=>{
        weather.region50km=region;
        currentWeatherData=weather;
        refreshWarnings(true).catch(()=>{});
      })
      .catch(()=>{});

    getStormArea50km(place,weather.timezone||'auto')
      .then(area=>{
        weather.storm_area_50km=area;
        currentWeatherData=weather;
        renderAnalysis(weather);
        renderLightningWarning(weather);
      })
      .catch(()=>{});
    try{
      const quarter=await getQuarterHourWeather(place.latitude,place.longitude,weather.timezone||'auto');let dwd=null;try{dwd=await getLightning15Dwd(place.latitude,place.longitude,weather.timezone||'auto');}catch(_){}
      weather.quarter_hour=mergeQuarterHourData(quarter,dwd);
      currentWeatherData=weather;
      updateVisualDashboard(weather);

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

    lastSuccessfulRefreshAt=new Date();
    updateAutoRefreshUi('idle');
    scheduleNextAutoRefresh();
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
  const btn=document.getElementById('modelsNavBtn') ||
    [...document.querySelectorAll('.nav-item')].find(b=>b.textContent.toLowerCase().includes('modele pogodowe'));
  if(!btn) return;
  btn.classList.remove('disabled');
  btn.removeAttribute('disabled');
  btn.style.display='';
  btn.addEventListener('click',e=>{
    e.preventDefault();
    openModelsModal();
  });
}hookModelsMenu();

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
window.addEventListener('resize',()=>{
  clearTimeout(window.__meteoResizeTimer);
  window.__meteoResizeTimer=setTimeout(applyResponsiveMapFix,120);
});

window.addEventListener('orientationchange',()=>{
  setTimeout(applyResponsiveMapFix,250);
});









document.getElementById('stormCloudsNowBtn')?.addEventListener('click',()=>activateStormMap(0));
document.getElementById('stormForecast1Btn')?.addEventListener('click',()=>activateStormMap(1));
document.getElementById('stormForecast2Btn')?.addEventListener('click',()=>activateStormMap(2));
document.getElementById('stormForecast3Btn')?.addEventListener('click',()=>activateStormMap(3));


hookWarningsMenu();

document.getElementById('closeWarningsBtn')?.addEventListener('click',closeWarningsModal);
document.getElementById('refreshWarningsBtn')?.addEventListener('click',refreshWarnings);
document.getElementById('warningsModal')?.addEventListener('click',e=>{
  if(e.target.id==='warningsModal') closeWarningsModal();
});

document.getElementById('weatherAnimationPlay')?.addEventListener('click',playWeatherAnimation);
document.getElementById('weatherAnimationStop')?.addEventListener('click',()=>{
  stopWeatherAnimation();
  const s=document.getElementById('weatherAnimationSlider');
  if(s){s.value='0';renderWeatherAnimationPosition(0);}
});
document.getElementById('weatherAnimationSlider')?.addEventListener('input',async e=>{
  stopWeatherAnimation();
  await prepareWeatherAnimation();
  renderWeatherAnimationPosition(Number(e.target.value));
});


document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible' || !currentPlace) return;

  if(!lastSuccessfulRefreshAt){
    refreshCurrentWeatherData(true);
    return;
  }

  const age=Date.now()-lastSuccessfulRefreshAt.getTime();
  if(age>=AUTO_REFRESH_INTERVAL_MS){
    refreshCurrentWeatherData(true);
  }else{
    clearTimeout(autoRefreshTimer);
    clearInterval(autoRefreshCountdownTimer);
    autoRefreshNextAt=lastSuccessfulRefreshAt.getTime()+AUTO_REFRESH_INTERVAL_MS;

    const delay=Math.max(1000,autoRefreshNextAt-Date.now());
    autoRefreshCountdownTimer=setInterval(()=>updateAutoRefreshUi(),1000);
    autoRefreshTimer=setTimeout(
      ()=>refreshCurrentWeatherData(true),
      delay
    );
    updateAutoRefreshUi();
  }
});


document.getElementById('retryRadarNowBtn')?.addEventListener('click',async()=>{
  if(!currentPlace||!currentWeatherData) return;

  const btn=document.getElementById('retryRadarNowBtn');
  if(btn){
    btn.disabled=true;
    btn.textContent='POBIERAM…';
  }

  await sampleRadarNow(currentPlace,currentWeatherData);

  if(btn){
    btn.disabled=false;
    btn.textContent='↻ SPRÓBUJ PONOWNIE';
  }
});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
