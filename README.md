# MeteoAnaliza v1034

Duża przebudowa interfejsu do układu zaawansowanego centrum meteorologicznego.

## Najważniejsze zmiany
- nowy układ pulpitu z lewym panelem nawigacji,
- panel „Obecnie” z temperaturą, wilgotnością, ciśnieniem, widzialnością, wiatrem i porywami,
- prognoza 24 h z opadem, wiatrem, porywami i prawdopodobieństwem opadu,
- szczegóły godziny są teraz wbudowane w ekran zamiast wyskakującego okna,
- porywy wiatru znajdują się obok średniego wiatru,
- dodane: zachmurzenie, kierunek wiatru, CAPE, widzialność,
- interaktywna mapa Leaflet,
- mapa bazowa OpenStreetMap,
- radar opadów RainViewer,
- sekcja „Wyładowania atmosferyczne” oparta o potencjał konwekcyjny/CAPE,
- analiza ryzyka burz, opadów i silnego wiatru,
- podgląd najbliższych funkcji wielomodelowych.

## Ważne
W v1003 sekcja wyładowań nie pokazuje zmyślonej liczby wyładowań LIVE. Pokazuje prognozowany potencjał burzowy/CAPE. Osobne źródło obserwowanych wyładowań LIVE dołączymy po wybraniu pewnego i legalnie dostępnego źródła.

## Pliki do podmiany
- `/index.html`
- `/css/style.css`
- `/js/app.js`
- `/sw.js`
- `/README.md`


## Zmiany v1004
- animowane ikony pogody:
  - pulsujące słońce,
  - przesuwające się chmury,
  - animowany deszcz,
  - animowany śnieg,
  - przesuwająca się mgła,
  - migająca błyskawica;
- kliknięcie konkretnej godziny aktualizuje mapę;
- nowy tryb mapy „Prognoza godziny”;
- aplikacja pobiera przestrzenną siatkę 5×5 punktów wokół wybranego miasta;
- mapa pokazuje prognozowane opady dla dokładnie wybranej godziny;
- po kliknięciu pola na mapie można odczytać:
  - temperaturę,
  - opad,
  - prawdopodobieństwo opadu,
  - średni wiatr,
  - kierunek wiatru,
  - porywy,
  - zachmurzenie,
  - CAPE;
- centralna lokalizacja na mapie ma animowaną ikonę zjawiska pogodowego;
- zachowano osobny przycisk „Radar teraz” dla danych radarowych.

### Dlaczego dwa tryby mapy
Radar pokazuje rzeczywiste echo opadów dla czasu bieżącego / historycznego. Dla przyszłych godzin v1004 pokazuje prognozę modelową Open‑Meteo, aby nie przedstawiać przyszłości jako rzeczywistego pomiaru radarowego.


## Zmiany v1005
- usunięto duże kolorowe koła z mapy prognozy;
- zwiększono siatkę przestrzenną z 5×5 do 7×7 punktów;
- dodano płynną interpolację danych między punktami;
- prognozowane opady są renderowane jako półprzezroczysta warstwa rastrowa;
- miejsca suche pozostają przezroczyste;
- skala mapy pokazuje intensywność opadów od 0.1 mm do 8+ mm/h;
- kliknięcie dowolnego miejsca na mapie pokazuje interpolowaną ilość opadu i prawdopodobieństwo opadu;
- animowana ikona pogody nad wybranym miastem pozostaje;
- zmiana godziny nadal automatycznie przebudowuje całą warstwę prognozy.


## Zmiany v1006
- po kliknięciu godziny pojawia się nowa sekcja „Szczegółowo co 15 minut”;
- pokazuje 4 kroki w obrębie wybranej godziny, np. 21:00, 21:15, 21:30, 21:45;
- dla każdego kroku wyświetlane są:
  - temperatura,
  - opad w danym 15-minutowym okresie,
  - średni wiatr,
  - porywy,
  - ocena ryzyka burz,
  - Lightning Potential Index (LPI),
  - CAPE;
- dane pochodzą z natywnego endpointu `minutely_15` Open‑Meteo;
- nie stosujemy sztucznej interpolacji do 10 minut, aby zachować wiarygodność danych.


## Poprawka v1007
- naprawiono błąd „Nie udało się pobrać prognozy” po zmianach v1006;
- dane 15-minutowe zostały odseparowane od głównego zapytania pogodowego;
- podstawowa prognoza, mapa i dane godzinowe ładują się niezależnie;
- awaria danych 15-minutowych nie blokuje całej aplikacji;
- dane temperatury, opadu i wiatru 15-min pobierane są osobno;
- CAPE i Lightning Potential Index są dodatkowo pobierane z DWD ICON;
- jeśli DWD/LPI nie odpowie, reszta aplikacji nadal działa.


## Poprawka v1008
- naprawiono brak opadów w sekcji 15-minutowej;
- cała sekcja 15-minutowa korzysta teraz bezpośrednio z DWD ICON;
- pobierane są natywne dane:
  - precipitation,
  - rain,
  - snowfall,
  - temperature_2m,
  - apparent_temperature,
  - wind_speed_10m,
  - wind_direction_10m,
  - wind_gusts_10m,
  - CAPE,
  - Lightning Potential Index;
- przy opadzie pokazujemy sumę całkowitego opadu oraz osobno deszcz.


## Poprawka v1009
- naprawiono brak danych pogodowych co 15 minut;
- sekcja 15-min korzysta teraz z oficjalnego głównego endpointu `/v1/forecast`;
- dodano `forecast_minutely_15=192`, czyli 48 godzin prognozy 15-minutowej;
- Open-Meteo automatycznie dobiera najlepszy dostępny model dla Polski;
- poprawiono dopasowanie wybranej godziny do danych 15-minutowych:
  zamiast porównywania obiektów Date porównujemy bezpośrednio lokalny klucz czasu `YYYY-MM-DDTHH`;
- nadal pokazujemy:
  temperaturę, opad, deszcz, wiatr, porywy, CAPE i LPI;
- sekcja 15-min nie może zablokować działania głównej prognozy.


## Poprawka v1010
- rozdzielono dane natywne 15-minutowe od interpolowanych;
- zapytanie do DWD ICON-D2 pobiera wyłącznie natywne zmienne 15-min obsługiwane przez ten model:
  - precipitation,
  - rain,
  - snowfall,
  - CAPE,
  - Lightning Potential Index;
- temperatura, temperatura odczuwalna, wiatr i porywy są interpolowane pomiędzy działającymi danymi godzinowymi;
- dzięki temu zapytanie 15-min nie zawiera już nieobsługiwanych kombinacji zmiennych;
- interfejs wyraźnie oznacza wartości interpolowane gwiazdką `*`;
- natywne opady wyświetlane są z dokładnością do 0.01 mm;
- kierunek wiatru jest interpolowany po kącie z uwzględnieniem przejścia 359° → 0°.


## Poprawka v1011
- przebudowano moduł prognozy co 15 minut;
- głównym źródłem jest teraz `/v1/forecast` Open-Meteo z `minutely_15`;
- aplikacja najpierw próbuje pobrać pełny zestaw zmiennych 15-min;
- jeśli jedna ze zmiennych nie jest dostępna, automatycznie ponawia zapytanie z bezpiecznym zestawem podstawowym;
- CAPE i Lightning Potential Index pobierane są opcjonalnie z DWD ICON-D2 i ich brak nie blokuje pozostałych danych;
- temperatura, odczuwalna, opad, wiatr i porywy mają być wyświetlane niezależnie od dostępności LPI;
- wartości brakujące w szeregu 15-min mogą być awaryjnie interpolowane z prognozy godzinowej;
- wartości natywne 15-min są oznaczone etykietą `15m`, a interpolowane gwiazdką `*`;
- utrzymano zakres 192 kroków = 48 godzin.


## Poprawka v1012
- poprawiono rozsypany układ sekcji „Szczegółowo co 15 minut”;
- każdy przedział 15-min ma teraz własną czytelną kartę;
- dane wewnątrz karty są ułożone pionowo, bez nachodzenia tekstów;
- etykieta `15m` została przeniesiona do prawego górnego rogu pola;
- zwiększono czytelność wartości i odstępy;
- układ jest responsywny:
  - 4 kolumny na szerokim ekranie,
  - 2 kolumny na średnim,
  - 1 kolumna na telefonie;
- nie zmieniano logiki pobierania ani obliczeń pogodowych.


## v1013
- automatyczna lokalizacja przy starcie,
- podpowiedzi miejscowości z regionem i krajem,
- uproszczone kafle 15-min: opad, wiatr, szac. burza,
- poprawka RainViewer przy zoomie przez maxNativeZoom=7 i overzoom Leaflet.


## Zmiany v1014
- zmniejszono i wyrównano sekcję prognozy co 15 minut;
- usunięto duże puste przestrzenie w kaflach 15-min;
- zmniejszono odstępy, wysokości pól i rozmiary opisów;
- usunięto czerwone obramowania porywów wiatru;
- silne porywy są nadal oznaczone czerwonym kolorem liczby;
- wygładzono warstwę prognozy na mapie;
- dodano stopniowe zanikanie warstwy na krawędziach siatki,
  aby nie było prostego prostokątnego odcięcia;
- logika pobierania danych pogodowych nie została zmieniona.


## Zmiany v1015
- przebudowano wygląd aplikacji zgodnie z zatwierdzonym wzorem;
- nagłówek ma osobny panel „Moja lokalizacja” oraz osobne wyszukiwanie;
- pozostawiono automatyczne pobieranie lokalizacji i ręczne wyszukiwanie;
- panel „Obecnie” został powiększony i uporządkowany;
- sekcja 15-min ma dokładnie jedną ramkę na każdy przedział czasu;
- wewnątrz kafla nie ma osobnych ramek dla opadu, wiatru i burzy;
- radar znajduje się jako duży panel po prawej;
- prognoza godzinowa jest bardziej zwarta i czytelna;
- czerwone ramki zostały usunięte — czerwone pozostają tylko wartości silnych porywów;
- logika pogodowa z v1014 pozostaje bez zmian.


## Poprawka v1016
- przebudowano od zera HTML sekcji „Szczegółowo co 15 minut”;
- usunięto użycie starych klas `.quarter-metric`, które powodowały konflikt CSS;
- każdy przedział 15 minut ma dokładnie jedną zewnętrzną ramkę;
- wewnątrz znajdują się tylko trzy zwykłe wiersze:
  - opad / 15 min,
  - wiatr,
  - prawdopodobieństwo burzy;
- brak dodatkowych ramek wokół informacji;
- wartości i opisy nie mają prawa wychodzić poza kartę;
- zachowano responsywność 4 / 2 / 1 kolumna;
- nie zmieniono logiki pobierania danych pogodowych.


## Poprawka v1017 — zgodność opadów godzinowych i 15-minutowych
Open-Meteo definiuje:
- `hourly precipitation` jako sumę opadu z poprzedniej godziny;
- `minutely_15 precipitation` jako sumę opadu z poprzednich 15 minut.

Dlatego dla kafla `15:00` aplikacja pokazuje przedziały:
- 14:00–14:15,
- 14:15–14:30,
- 14:30–14:45,
- 14:45–15:00.

Suma tych czterech wartości jest używana jako opad godzinowy przy `15:00`, jeśli pełne dane 15-min są dostępne. Dzięki temu kafel godzinowy, szczegóły i analiza 15-min pokazują spójne wartości.


## v1018 — prognoza opisowa dnia
- dodano przycisk `PROGNOZA` w sekcji szczegółów;
- po kliknięciu otwiera się osobne okno z opisową prognozą;
- można wybrać dzień z listy dostępnych dni prognozy;
- aplikacja generuje:
  - zakres temperatury,
  - sumę opadów,
  - najwyższe prawdopodobieństwo opadu,
  - najbardziej prawdopodobny okres opadów,
  - średni wiatr i maksymalne porywy,
  - szacowane ryzyko burz;
- dodatkowo generowane są osobne krótkie prognozy:
  - rano,
  - południe,
  - popołudnie,
  - wieczór,
  - noc;
- główny forecast rozszerzono do 7 dni, aby można było generować prognozę opisową na kilka dni do przodu.


## v1019 — graficzne prognozy 7 i 16 dni
- prognoza długoterminowa nie jest dodawana jako kolejna długa sekcja strony;
- pod prognozą godzinową 24h dodano dwa przyciski:
  - PROGNOZA 7 DNI,
  - PROGNOZA 16 DNI;
- oba przyciski otwierają osobne okno modalne;
- każdy dzień jest graficzną kartą z:
  - ikoną pogody,
  - temperaturą maksymalną i minimalną,
  - sumą opadu,
  - maksymalnym prawdopodobieństwem opadu,
  - maksymalnymi porywami,
  - szacowanym ryzykiem burz;
- kolorowe oznaczenie dnia: dobra / zmienna / opady / trudna pogoda;
- automatyczne wskazanie najlepszego i najtrudniejszego dnia;
- kliknięcie dnia pokazuje jego opisową analizę;
- pobieranie danych rozszerzono do 16 dni.


## v1020 — mapa 50 km i analiza burzowa obszaru
- naprawiono przypadek, w którym mapa pojawiała się jako mały fragment w rogu;
- po wybraniu/ustaleniu lokalizacji mapa startuje na obszarze około 50 km od punktu;
- mapa jest normalnie przesuwalna i powiększalna;
- radar RainViewer pokrywa cały aktualnie oglądany obszar mapy i działa przy zoomie do 18 (overzoom powyżej natywnego poziomu 7);
- prognozowana warstwa opadów nie jest już na stałe ograniczona do jednej siatki wokół lokalizacji;
- po przesunięciu lub zmianie zoomu aplikacja pobiera nową siatkę prognozy dla aktualnie widocznego obszaru;
- dzięki temu można oddalić mapę i oglądać sytuację pogodową dalej niż 50 km;
- dodano obszarową analizę burz w promieniu 50 km:
  - CAPE,
  - Lightning Potential Index,
  - kod burzowy pogody,
  - opad;
- analiza szuka najsilniejszego sygnału w promieniu 50 km i w najbliższych około 2 godzinach, zamiast analizować tylko dokładny punkt lokalizacji.

### Ważne
CAPE/LPI i kod pogody są danymi modelowymi. Nie są obserwacją rzeczywistych wyładowań atmosferycznych. Do wykrywania już występujących piorunów potrzebne będzie osobne źródło danych o wyładowaniach LIVE.


## v1021 — naprawa pustej mapy
- usunięto błędne nadpisywanie `.leaflet-pane` i `.leaflet-map-pane`;
- przywrócono natywne pozycjonowanie i transformacje Leafleta;
- mapa bazowa jest inicjalizowana dopiero po pokazaniu panelu;
- poprawiona kolejność:
  1. `invalidateSize()`,
  2. utworzenie promienia 50 km,
  3. `fitBounds()`,
  4. ponowne `invalidateSize()`,
  5. pobranie warstwy prognozy/radaru;
- dodano kontrolę błędów kafelków OpenStreetMap;
- jeśli OSM nie poda kafelków, aplikacja automatycznie próbuje awaryjnej warstwy CARTO;
- radar i warstwa prognozy nie zasłaniają mapy bazowej;
- mapa nadal startuje na obszarze około 50 km wokół lokalizacji i może być swobodnie przesuwana oraz skalowana.


## v1022 — druga naprawa pustej mapy
- usunięto ręczne z-indexy wewnętrznych warstw Leafleta;
- `map.setView()` wykonywane jest teraz przed dodaniem warstwy kafelkowej;
- mapa startuje na Radomiu / wybranej lokalizacji, a następnie dopasowuje obszar około 50 km;
- bazowa mapa OpenStreetMap jest dodawana w prosty, natywny sposób;
- po 3 błędach kafelków lub po 1.8 s bez żadnego załadowanego kafelka aplikacja przełącza się na awaryjny serwer OSM France;
- usunięto `crossOrigin:true` z mapy bazowej, aby nie prowokować blokowania kafelków przez przeglądarkę;
- przy przełączeniu na radar mapa bazowa pozostaje aktywna, a radar jest tylko nakładką;
- po zmianie lokalizacji ponownie ustawiany jest widok około 50 km.


## v1023 — Modele pogodowe
- uruchomiono pozycję menu `Modele pogodowe`;
- po kliknięciu otwiera się osobne okno porównawcze;
- aplikacja pobiera niezależne prognozy z:
  - ECMWF,
  - DWD ICON,
  - NOAA GFS;
- dla wybranej godziny porównywane są:
  - temperatura,
  - temperatura odczuwalna,
  - opad,
  - prawdopodobieństwo opadu (jeśli model zwraca),
  - wiatr,
  - kierunek wiatru,
  - porywy,
  - kod pogody;
- dodano automatyczną ocenę zgodności modeli 0–100%;
- dodano tabelę najbliższych 24 godzin dla wszystkich trzech modeli;
- zmiana godziny w oknie natychmiast aktualizuje karty i zgodność.


## v1024 — ECMWF AIFS jako model główny
- główna prognoza aplikacji pobierana z ECMWF AIFS Single;
- AIFS jest jawnie oznaczony jako model główny;
- sekcja Modele pogodowe porównuje: ECMWF AIFS, ECMWF IFS, ICON i GFS;
- ocena zgodności obejmuje wszystkie dostępne modele;
- pozostawiono dane wysokiej rozdzielczości (15-min, radar, analiza lokalnych burz) w dotychczasowych źródłach;
- jeśli AIFS jest chwilowo niedostępny, aplikacja przechodzi na Open-Meteo Best Match zamiast wyłączać całą prognozę.


## v1025 — naprawa modeli ECMWF
- naprawiono identyfikator ECMWF AIFS: `ecmwf_aifs025_single`;
- naprawiono identyfikator ECMWF IFS HRES 9 km: `ecmwf_ifs`;
- ICON korzysta z `icon_seamless`;
- GFS korzysta z `gfs_seamless`;
- wszystkie cztery modele są pobierane przez `/v1/forecast?models=...`;
- jeśli `precipitation_probability` nie jest dostępne dla konkretnego modelu, zapytanie automatycznie ponawia się bez tego parametru;
- zgodność pokazuje teraz kompletność, np. `4/4 modeli dostępnych`;
- procent zgodności liczony jest tylko z modeli, które rzeczywiście zwróciły dane.

## v1026 — ECMWF IFS jako model główny
- główny model aplikacji zmieniono z ECMWF AIFS na ECMWF IFS HRES 9 km;
- ECMWF IFS jest pierwszy i oznaczony jako MODEL GŁÓWNY w porównaniu;
- AIFS pozostaje jako osobny MODEL AI do obserwacji i porównywania;
- ICON i GFS pozostają bez zmian;
- zgodność nadal liczona jest z dostępnych modeli.


## v1027 — pełna responsywność mobilna + wyładowania LIVE

### Responsywność
- przebudowano zachowanie całej aplikacji na telefonach;
- panel boczny staje się poziomowym, przewijanym paskiem;
- główne kolumny przechodzą w jeden pionowy układ;
- karty aktualnej pogody, 15-min, modele i prognozy długoterminowe dopasowują liczbę kolumn do szerokości;
- prognoza godzinowa pozostaje poziomo przewijana, ale nie wypycha całej strony;
- mapy mają stabilną wysokość na telefonach;
- modale są dopasowane do szerokości i wysokości ekranu;
- dodano poprawkę Leaflet po zmianie orientacji i rozmiaru ekranu.

### Wyładowania atmosferyczne
- dodano przycisk `MAPA LIVE`;
- mapa LIVE korzysta z oficjalnej strony LightningMaps.org / Blitzortung.org w osadzonym oknie;
- dodano przycisk awaryjny otwierający LightningMaps.org w nowej karcie;
- nie pobieramy ani nie kopiujemy surowych danych Blitzortung;
- dodano poziomy ostrzeżeń:
  - brak ostrzeżenia,
  - możliwe burze,
  - podwyższone ryzyko,
  - wysokie ryzyko;
- ostrzeżenie jest liczone z analizy obszaru 50 km, CAPE i dostępnych danych modelowych;
- LIVE mapa służy do obserwacji rzeczywistych wyładowań, a ostrzeżenia w aplikacji pozostają analizą prognozową.


## v1028 — prawdziwe wyładowania LIVE przez OpenWeather + Cloudflare Worker
- klucz OpenWeather nie jest przechowywany w aplikacji ani GitHub Pages;
- aplikacja komunikuje się wyłącznie z Cloudflare Workerem;
- Worker pobiera obserwowane wyładowania z OpenWeather Lightning API;
- mapa pokazuje punkty wyładowań:
  - czerwone: 0–5 min,
  - pomarańczowe: 5–15 min,
  - żółte: 15–30 min,
  - jasne: starsze;
- licznik wyładowań w promieniu 10 / 25 / 50 km;
- odległość do najbliższego wyładowania;
- automatyczny alert, jeśli wyładowanie pojawi się w promieniu 25 km;
- automatyczne odświeżanie co 60 sekund;
- adres Workera zapisuje się lokalnie w przeglądarce (`localStorage`).


## v1029 — bez Workera: radar + chmury burzowe + prognoza komórek

### Usunięto
- konfigurację Cloudflare Workera;
- pole adresu Workera;
- liczniki OpenWeather Lightning LIVE;
- automatyczne zapytania do proxy;
- zależność aplikacji od dodatkowego backendu.

### Zostawiono
- link do LightningMaps.org jako zewnętrzną mapę kontrolną;
- modelową analizę burz CAPE/LPI;
- radar RainViewer.

### Nowa mapa burzowa
W panelu mapy dodano:
- `Chmury burzowe` — aktualna modelowa lokalizacja komórek konwekcyjnych;
- `+1h`;
- `+2h`;
- `+3h`.

Komórki są wyznaczane z:
- CAPE,
- opadu,
- zachmurzenia,
- kodu WMO,
- wiatru,
- porywów.

Każda komórka ma:
- poziom ryzyka,
- kolor,
- strzałkę kierunku przemieszczania zgodną z kierunkiem wiatru,
- szczegóły po kliknięciu.

Mapa aktualizuje siatkę po przesunięciu i zmianie zoomu.


## v1030 — poprawka niewidocznych przycisków mapy burzowej
- w v1029 logika mapy burzowej była w JS, ale przyciski nie zostały wstawione do właściwego miejsca HTML;
- w v1030 dodano osobny, niezależny blok sterowania pod standardowymi przyciskami mapy;
- widoczne przyciski:
  - CHMURY BURZOWE,
  - +1h,
  - +2h,
  - +3h;
- przycisk aktywnego trybu jest fioletowo podświetlany;
- legenda burzowa pojawia się tylko w trybie mapy burzowej;
- logika prognozy komórek z v1029 została zachowana.


## v1031 — Ostrzeżenia IMGW
- uruchomiono pozycję `Ostrzeżenia (IMGW)` w menu;
- dane pobierane bezpośrednio z oficjalnego API IMGW-PIB:
  - `/api/data/warningsmeteo`,
  - `/api/data/warningshydro`;
- automatyczne filtrowanie ostrzeżeń do aktualnego województwa;
- przełącznik `MÓJ REGION / CAŁA POLSKA`;
- przełącznik `WSZYSTKIE / METEO / HYDRO`;
- stopień ostrzeżenia 1/2/3 z kolorami;
- prawdopodobieństwo zjawiska;
- czas obowiązywania;
- opis przebiegu i uwagi IMGW;
- lista obszarów objętych ostrzeżeniem;
- licznik aktywnych ostrzeżeń przy pozycji menu;
- automatyczne odświeżenie po zmianie lokalizacji;
- wymagane oznaczenie źródła danych IMGW-PIB.


## v1032 — większa czytelność Ostrzeżeń IMGW
- znacznie powiększono czcionki całego modułu Ostrzeżeń;
- większy tytuł i opis lokalizacji;
- większe kafle podsumowania;
- większe przyciski filtrów;
- większy stopień ostrzeżenia i prawdopodobieństwo;
- większe daty obowiązywania;
- większy opis przebiegu zjawiska;
- większe uwagi IMGW;
- większe etykiety obszarów;
- zachowano responsywność na tabletach i telefonach;
- logika pobierania danych IMGW nie została zmieniona.

## v1033 — świeże ostrzeżenia i prognoza zagrożeń na 72 h
- stare bezterminowe ostrzeżenia hydrologiczne z poprzednich miesięcy są odfiltrowane z głównego centrum;
- pokazujemy tylko świeże ostrzeżenia dotyczące obecnego okresu i najbliższych 2 dni;
- jedno okno obejmuje Dzisiaj / Jutro / Pojutrze;
- analiza zagrożeń obejmuje burze, grad, silne opady, silny wiatr/wichurę, upał, mróz/przymrozki i śnieg/śliskość;
- przy każdym zagrożeniu podawane są możliwe skutki;
- oficjalne ostrzeżenia IMGW są oddzielone od modelowej analizy aplikacji;
- jeśli pojawi się świeże ostrzeżenie IMGW lub podwyższone/wysokie zagrożenie modelowe, okno ostrzeżeń otwiera się automatycznie;
- ten sam alert automatyczny nie otwiera się wielokrotnie w tej samej sesji;
- prognoza modelowa nie jest oznaczana jako oficjalne ostrzeżenie IMGW.


## v1034 — duże ostrzeżenia, RCB, region 50 km i animacja mapy

### Ostrzeżenia
- znacznie zwiększono rozmiar całej typografii Centrum Ostrzeżeń;
- modelowa analiza poważnych zagrożeń jest rozszerzona z jednego punktu na 9 punktów w promieniu około 50 km;
- analizowane są m.in. burze, grad, silny deszcz, silny wiatr/wichura, upał, mróz i śnieg;
- po wykryciu poziomu podwyższonego/wysokiego okno nadal otwiera się automatycznie;
- aplikacja próbuje pobrać świeże pogodowe Alerty RCB z oficjalnego gov.pl;
- Alert RCB jest dopasowywany do miejscowości, powiatu lub województwa; RCB nie publikuje alertów jako dokładnego promienia 50 km;
- jeśli gov.pl blokuje odczyt cross-origin, aplikacja nie przestaje działać — pozostają IMGW i analiza 50 km.

### Animacja mapy
- dodano suwak od `-60 min` do `+120 min`;
- przycisk `ANIMACJA` automatycznie przesuwa klatki co 10 minut;
- `-60..0 min`: rzeczywiste klatki radarowe RainViewer;
- `0..+120 min`: interpolowana przestrzennie i czasowo prognoza opadów z modelu;
- na mapie zawsze widać, czy oglądana klatka jest RADAREM czy MODELEM.
