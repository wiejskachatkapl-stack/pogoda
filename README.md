# Meteo Lightning Worker

Cloudflare Worker ukrywający klucz OpenWeather Lightning API przed publiczną aplikacją GitHub Pages.

## 1. Utwórz konto Cloudflare i zainstaluj zależności

```bash
npm install
npx wrangler login
```

## 2. Ustaw dozwoloną domenę GitHub Pages

W `wrangler.jsonc` zmień:

```json
"ALLOWED_ORIGIN": "https://TWOJ-LOGIN.github.io"
```

na swoją domenę GitHub Pages. Jeśli aplikacja jest na własnej domenie, wpisz tę domenę.

## 3. Dodaj klucz jako SECRET

NIE wpisuj klucza do `wrangler.jsonc`, `src/index.js` ani GitHuba.

```bash
npx wrangler secret put OPENWEATHER_API_KEY
```

Wrangler poprosi o wartość klucza i zapisze go po stronie Cloudflare.

## 4. Wdróż Worker

```bash
npm run deploy
```

Po wdrożeniu otrzymasz adres podobny do:

```text
https://meteo-lightning-proxy.TWOJ-SUBDOMAIN.workers.dev
```

## 5. Test

W przeglądarce:

```text
https://TWOJ-WORKER.workers.dev/health
```

Powinno zwrócić `ok: true`.

Test danych:

```text
https://TWOJ-WORKER.workers.dev/lightning?lat=51.40&lon=21.15&radius=50&minutes=30
```

Jeśli zwróci `403`, najczęściej oznacza to, że klucz OpenWeather nie ma aktywnego dostępu do produktu Lightning API.

## 6. Połącz z MeteoAnalizą v1028

W aplikacji, w sekcji **Wyładowania atmosferyczne**, wklej adres Workera i kliknij **ZAPISZ**.

Aplikacja:
- pobiera ostatnie 30 minut wyładowań w promieniu 50 km,
- odświeża dane co 60 sekund,
- pokazuje punkty na mapie,
- liczy wyładowania do 10 / 25 / 50 km,
- ostrzega o najbliższym wyładowaniu.
