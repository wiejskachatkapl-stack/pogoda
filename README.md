# MeteoAnaliza v1009

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
