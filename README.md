# MeteoAnaliza v1000

Pierwsza działająca wersja aplikacji pogodowej przygotowana pod GitHub Pages.

## Zawartość
- animowany ekran startowy,
- responsywny interfejs komputer/telefon,
- wyszukiwanie miejscowości,
- geokodowanie miejscowości przez Open-Meteo,
- aktualna pogoda,
- prognoza godzinowa na najbliższe 24 godziny,
- podstawowa automatyczna analiza,
- manifest PWA i service worker.

## Uruchomienie na GitHub Pages
Wgraj całą zawartość tej paczki do głównego katalogu repozytorium. Następnie w GitHub:
Settings → Pages → Deploy from a branch → main / root.

Po zapisaniu GitHub poda adres strony.

## Pliki
- `index.html`
- `css/style.css`
- `js/app.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/icons/icon.svg`

## Dane pogodowe
Wersja v1000 korzysta z Open-Meteo. Kolejne wersje będą rozbudowywane o jawne porównanie modeli, prognozy ensemble, wykresy, radar, ostrzeżenia i analizę zmian kolejnych prognoz.
