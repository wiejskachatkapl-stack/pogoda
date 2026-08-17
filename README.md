# MeteoAnaliza v1004

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
