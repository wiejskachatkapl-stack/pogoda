# MeteoAnaliza v1003

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
