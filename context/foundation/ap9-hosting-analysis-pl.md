# Analiza hostingu MindAgora (ap9)

Stan: 2026-09-12, lekcja 3x6 (Wdrożenie na produkcję). Analiza wg promptu kursu `prompty/3x6/hosting-analysis.pl.md`,
z planami i cenami zweryfikowanymi 2026-09-12 w dokumentacji dostawców (WebFetch/WebSearch; źródła w §7). Powiązane:
stack (ap3), brief `sketch/lekcje/3x6-brief.md` (T2 hosting, T4 Supabase, T7 obraz, T8 bramka, T9 URL-e, T10 sekrety),
inwentarz (`sketch/triage-inwentarz.md`). Dokument uzasadnia wybór hostingu; implementacji (Dockerfile, `master.yml`)
nie opisuje. Założenia przyjęte z briefu, nie kwestionowane tutaj: artefakt = obraz `node:24-alpine` na publicznym
GHCR, job `deploy` za bramką środowiska `production`; domena `mindagora.ai` w Cloudflare (Registrar + DNS).

Legenda oznaczeń: **[✓]** zweryfikowane w dokumentacji dostawcy 2026-09-12; **[~]** tylko źródło pośrednie (zestawienia
zewnętrzne, fora); **[?]** nie zweryfikowano — do sprawdzenia na koncie lub empirycznie.

## 1. Analiza głównego frameworka i modelu operacyjnego

- **Astro 5, `output: "server"`, adapter `@astrojs/node` (standalone)** → jeden długo żyjący proces Node 24 z własnym
  serwerem HTTP (`HOST`/`PORT` z env). Każdy request przechodzi przez middleware sesyjne (`@supabase/ssr`, cookies), więc
  nie ma nic do serwowania „statycznie” — potrzebny hosting **procesu** (kontener albo VM), nie hosting statyczny ani CDN.
- **React 19 jako wyspy**: SSR po stronie serwera (koszt CPU per request — istotne tam, gdzie limitem jest czas CPU,
  jak Workers Free 10 ms), hydratacja w przeglądarce.
- **Stan poza kontenerem**: baza, auth i klucze użytkowników w hostowanym Supabase (plan free, T4). Kontener jest
  bezstanowy: bez wolumenów, restart i przenosiny między platformami bez utraty danych, jedna replika wystarcza.
- **Długie requesty**: wywołania OpenRouter z serwera trwają 30–60 s bez streamingu — nagłówki odpowiedzi lecą dopiero
  po odpowiedzi modelu, więc przez ~60 s klient nie dostaje ani bajta. To główny filtr platform: limity „idle 60 s”
  (Fly.io) i limity czasu funkcji (Netlify 60 s) są na granicy; wymagane ≥ 60 s, wygodnie ≥ 120 s.
- **Artefakt = obraz Dockera na GHCR**: hosting musi (a) uruchomić kontener z publicznego obrazu, (b) przyjąć env
  (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`, `HOST`, `PORT`), (c) dać się wyzwolić
  z GitHub Actions, (d) dać HTTPS, (e) obsłużyć własną domenę z certyfikatem.
- **Konsekwencja modelu**: platformy serverless/edge „od twórców” (Netlify, Vercel, Cloudflare Workers) wymagają wymiany
  adaptera i porzucenia obrazu jako artefaktu; platformy kontenerowe przyjmują obraz bez zmian w aplikacji, a wybór
  między nimi jest odwracalny (ten sam obraz, inne env) — to wprost realizuje cel promptu „uniknąć migracji”.

## 2. Rekomendowane usługi od twórców technologii (Astro docs → Netlify, Vercel, Cloudflare)

Dokumentacja Astro (`docs.astro.build/en/guides/deploy/`) wyróżnia Netlify i Vercel jako szybkie ścieżki, a Cloudflare
jest na liście z SSR. Wszystkie trzy wymagają wymiany `@astrojs/node` na adapter platformy — koszt: zmiana
`astro.config.mjs`, nowa zależność, rozjazd dev (Node) ↔ prod (runtime platformy), obraz Dockera przestaje być
artefaktem wdrożenia (cały ustalony pipeline GHCR staje się zbędny).

1. **Netlify** (`@astrojs/netlify`, SSR jako Netlify Functions). Plan Free 0 USD, 300 kredytów/mies. z twardym limitem
   (bandwidth 20 kredytów/GB ≈ 15 GB) [~]; użytek komercyjny dozwolony [✓ forum Netlify + docs]; własna domena z TLS na
   Free [✓]. Limit funkcji synchronicznej: **60 s, nieskonfigurowalny** [✓ docs 2026] (wcześniej 10 s domyślnie, 26 s
   na prośbę — w 2026 podniesione). Dla 30–60 s czekania na model to ryzyko 502 w ogonie rozkładu.
2. **Vercel** (`@astrojs/vercel`, Fluid compute). Hobby: 0 USD, max duration 300 s [✓], ale **„non-commercial, personal
   use only”** [✓ docs Hobby] → startup = Pro 20 USD/użytkownika/mies. Domyślny region funkcji `iad1` (USA), zmiana
   możliwa. Preview per PR wbudowane. Uwaga: Vercel w 2026 przyjmuje też obrazy OCI (Vercel Container Registry) [?] —
   nie weryfikowano, czy zadziała z naszym obrazem Node.
3. **Cloudflare Workers** (`@astrojs/cloudflare`, `nodejs_compat`, runtime `workerd` ≠ Node: brak CommonJS, ograniczony
   `sharp`, sesje Astro w KV) [✓ docs adaptera]. Free: 100 k req/dzień, **10 ms CPU/request** (SSR React może to
   przekraczać) [✓]; Paid 5 USD/mies.: 30 s CPU domyślnie (do 5 min) [✓]. **Brak limitu czasu ściennego** dla requestu
   HTTP — czekanie na `fetch` do OpenRoutera nie liczy się do CPU [✓]. Domena `mindagora.ai` „w domu”. Użytek
   komercyjny na Free dozwolony [~]. To jest ścieżka autora kursu (Pages 9/10 w 04.2025; od 2025 nowe projekty → Workers).

## 3. Platformy alternatywne (konteneryzacja)

Kandydaci: obraz `node:24-alpine` z GHCR, jedna mała instancja (256–512 MB), budżet 0–5 USD/mies.

### 3.1 Tabela A — plan, zasoby, usypianie, timeout

| Platforma                 | Plan free / najtańszy i cena                                                                      | RAM / CPU na tym planie                               | Usypianie                                                 | Timeout requestu                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Render                    | Free: 0 USD, 750 h/mies. [✓]; Starter płatny [?]                                                  | 512 MB / 0,1 CPU [~]                                  | po 15 min, budzenie ~1 min [✓]                            | brak udokumentowanego limitu [?]                                        |
| Railway                   | Trial 5 USD (30 dni) → Free 1 USD kredytu/mies.; Hobby 5 USD/mies. z 5 USD usage [✓]              | usage: ~10 USD/GB RAM/mies., ~~20 USD/vCPU/mies. [~~] | opcjonalne („Serverless”, 5–10 min) [✓]                   | 5 min bez danych, max 15 min [✓]                                        |
| Koyeb                     | **Starter (z free instancją) zamknięty dla nowych od 17.02.2026**; Pro 29 USD/mies. + compute [✓] | free: 512 MB / 0,1 vCPU (tylko istniejące org.) [✓]   | free: po 1 h [✓]                                          | 100 s [~ docs edge]                                                     |
| Fly.io                    | brak free; trial 2 h VM / 7 dni; shared-cpu-1x 256 MB ≈ 2,02 USD/mies. + rootfs 0,15 USD/GB [✓]   | 256 MB / shared 1x [✓]                                | auto-stop konfigurowalne [✓]                              | **60 s idle bez danych** (zmiana: Pro 99 USD lub support) [~ staff Fly] |
| DigitalOcean App Platform | brak free dla web service; `apps-s-1vcpu-0.5gb` 5 USD/mies. [✓]                                   | 512 MiB / 1 shared vCPU, 50 GiB transferu [✓]         | nie                                                       | 100 s twardy limit [~ odpowiedzi DO]                                    |
| Cloudflare Containers     | Workers Paid 5 USD/mies. + usage; w cenie 25 GiB-h RAM, 375 vCPU-min, 200 GB-h dysku [✓]          | `lite`: 256 MiB / 1/16 vCPU / 2 GB [✓]                | `sleepAfter` (domyślnie 10 min), bez opłat w uśpieniu [✓] | bez limitu ściennego (Worker) [✓]                                       |
| Hetzner Cloud VPS         | CX23 5,49 EUR netto + IPv4 0,50 EUR; **CX/CAX „currently not available”** [✓]; CPX12 [?]          | CX23: 2 vCPU / 4 GB [✓]                               | nie                                                       | brak (własny Caddy)                                                     |
| Google Cloud Run          | free tier: 2 M req, 180 k vCPU-s, 360 k GiB-s/mies. [✓]; wymaga konta rozliczeniowego z kartą     | konfigurowalne (np. 512 MiB)                          | scale-to-zero domyślnie                                   | do 60 min [✓]                                                           |

### 3.2 Tabela B — domena, komercja, region, deploy z GHA / obraz z GHCR

| Platforma             | Własna domena + TLS na free                                         | Użytek komercyjny                                                   | Region EU                                           | Deploy z GHA / obraz GHCR                                                                                                    | Uwagi                                                                                   |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Render                | tak, 2 domeny w Hobby [✓]                                           | brak klauzuli zakazu w docs (Free opisany jako „hobby/testing”) [~] | Frankfurt [✓]; Free we FRA [?]                      | Deploy Hook (`curl`, `?imgURL=`) [✓]; publiczny obraz „z dowolnego rejestru” [✓]                                             | Free na obrazie [?]; Cloudflare: CNAME DNS-only do certów, potem Proxied + SSL Full [✓] |
| Railway               | tak (CNAME + TXT, certy auto) [✓]                                   | brak klauzuli zakazu w docs; ToS [?]                                | EU West (Amsterdam) [✓]                             | `railway redeploy --service … --yes` z `RAILWAY_TOKEN` [✓]; GHCR natywnie jako źródło usługi [✓]                             | Free 1 USD/mies. nie utrzyma stałej instancji → realnie Hobby 5 USD                     |
| Koyeb                 | 10 domen free [✓ stare docs]                                        | —                                                                   | Frankfurt [✓]                                       | `koyeb/action-git-deploy@v1` (wejście `docker`) [✓]                                                                          | odpada: brak planu w budżecie dla nowych kont                                           |
| Fly.io                | 10 certów free [✓]                                                  | tak (pay-as-you-go)                                                 | ams, fra, cdg, arn, lhr; brak `waw` [✓]             | `superfly/flyctl-actions/setup-flyctl@master` + `flyctl deploy --image ghcr.io/…` [✓]                                        | karta wymagana; 60 s idle to realne ryzyko przy 30–60 s ciszy                           |
| DigitalOcean          | tak (standard oferty) [~]                                           | tak (płatny)                                                        | AMS, FRA [✓]                                        | `digitalocean/action-doctl@v2` + `doctl apps create-deployment` [✓]; GHCR publiczne [✓], bez autodeployu z GHCR [✓]          | fallback 1:1 z kursem; + VAT                                                            |
| Cloudflare Containers | tak, domena w tym samym koncie                                      | tak                                                                 | placement: region/jurysdykcja `eu` (od 04.2026) [✓] | `cloudflare/wrangler-action@v4` [✓]; **GHCR nieobsługiwane** — `docker pull` + `wrangler containers push` do rejestru CF [✓] | wymaga własnego Workera (klasa Container) — dodatkowy kod; GA na Workers Paid [✓]       |
| Hetzner               | Caddy (Let's Encrypt) — własnoręcznie                               | tak                                                                 | Norymberga, Falkenstein, Helsinki [✓]               | SSH (`appleboy/ssh-action`, nieoficjalna) lub Watchtower; `docker compose pull`                                              | pełny DIY: system, aktualizacje, firewall; ceny +30–40 % (06.2026) [✓]                  |
| Google Cloud Run      | domain mapping = **preview, „not production-ready”** [✓]; LB płatny | tak                                                                 | europe-west1 i inne [✓]                             | `google-github-actions/deploy-cloudrun` + WIF [?]; GHCR publiczne bezpośrednio [✓]                                           | najwięcej konfiguracji (projekt GCP, IAM, billing)                                      |

### 3.3 Finaliści

1. **Render (Free)** — jedyna platforma, która spełnia (a)–(e) za 0 USD bez karty [~], z gotową ścieżką „prebuilt image
   z publicznego rejestru + Deploy Hook z `imgURL`” i oficjalnym poradnikiem DNS dla Cloudflare. Wady: usypianie po
   15 min z ~1 min budzenia i nieudokumentowany limit czasu requestu (weryfikacja empiryczna w pierwszym tygodniu).
2. **Railway (Hobby 5 USD)** — najlepsze cechy runtime w budżecie: GHCR jako natywne źródło usługi, region Amsterdam,
   bez usypiania, timeout 5 min bez danych, oficjalne CLI do `redeploy` z GHA. Wada: nie jest darmowy (Free 1 USD/mies.
   nie utrzyma stałej instancji 256–512 MB) i model usage-based wymaga jednego spojrzenia na rachunek.

Poza finałem: Koyeb odpadł przez zamknięcie Starter dla nowych kont (Mistral, 02.2026); Fly.io przez 60 s idle-timeout
dokładnie na profilu naszych requestów; DigitalOcean spełnia wszystko, ale bez free i z limitem 100 s (przy 60 s to
mało zapasu) — zostaje jako fallback 1:1 z kursem; Cloudflare Containers przez brak GHCR i konieczność napisania
Workera-routera (wraca, gdy będziemy chcieli mieć wszystko w jednym koncie z domeną); Hetzner przez niedostępność CX23,
wzrost cen i koszt operacyjny DIY; Cloud Run przez nieprodukcyjny status domain mappingu i narzut konfiguracji GCP.

## 4. Krytyka rozwiązań (a: złożoność wdrożenia, b: zgodność ze stosem, c: środowiska równoległe, d: plany)

**Netlify.** (a) Prosto z Gita, ale u nas oznacza porzucenie obrazu i `master.yml`: build robi Netlify, nie GHA; sekrety
w UI Netlify. (b) Wymiana adaptera; SSR jako funkcja Lambda — limit **60 s, nieskonfigurowalny** — nasz request
30–60 s bez streamingu trafia w sufit; region funkcji domyślnie USA (latencja do Supabase w EU nie zweryfikowana).
(c) Deploy previews per PR wbudowane, branch deploys — najlepiej z całej trójki. (d) Free 0 USD z komercją; 300 kredytów
to twardy limit (po wyczerpaniu strona staje do końca miesiąca); Personal 9 USD, Pro 20 USD.

**Vercel.** (a) Jak Netlify: build po stronie Vercela, GHCR zbędne. (b) Wymiana adaptera na `@astrojs/vercel`; Fluid
compute 300 s rozwiązuje problem długich requestów; region domyślny `iad1`, przełączenie na `fra1` możliwe. (c) Preview
per PR wbudowane. (d) Hobby jest wprost **niekomercyjny** — dla „może kiedyś startup” to natychmiast Pro 20 USD/os./mies.,
czyli 4× nasz górny budżet; jedyna platforma w zestawieniu z twardą klauzulą.

**Cloudflare Workers.** (a) `wrangler deploy` z GHA (`wrangler-action@v4`) jest proste, ale nasz pipeline obrazu jest
zbędny; potrzebna zmiana adaptera i `wrangler.jsonc`. (b) Najbardziej ryzykowna zgodność: `workerd` ≠ Node (brak
CommonJS, `nodejs_compat` jako polyfill, `sharp` niedostępny), rozjazd dev/prod (lokalnie Node, prod workerd — E2E
wymagałyby `wrangler dev`). Free daje 10 ms CPU — SSR strony czatu z wyspami React może to przekraczać; realnie Paid
5 USD (30 s CPU). Plus: brak limitu ściennego — 60 s czekania na OpenRouter nie kosztuje nic. (c) Preview URL-e wersji
Workera; środowiska przez `env` w wranglerze. (d) Free komercyjnie OK; Paid 5 USD — w budżecie; domena w tym samym
koncie, zero konfiguracji DNS między dostawcami.

**Render (finalista).** (a) Najprościej: usługa „Existing image” → `ghcr.io/<owner>/mindagora:latest`, Deploy Hook
z `imgURL=` wywołany `curl`-em w jobie `deploy`; env w dashboardzie. Brak oficjalnej akcji GHA (hook = jeden `curl`).
(b) Pełna zgodność: Node 24 w naszym obrazie, `PORT` wstrzykiwany przez Render, `HOST=0.0.0.0` z obrazu. Niewiadome:
limit czasu requestu (docs milczą; troubleshooting radzi `keepAliveTimeout` 120 s w Node) i wydajność 0,1 CPU dla SSR.
(c) Hobby: 2 środowiska na projekt; **preview environments tylko w Pro** — środowisko per PR nie za darmo.
(d) 0 USD, bez karty [~~], bez klauzuli niekomercyjnej [~~]; 750 h/mies. pokrywa jedną stałą usługę (730 h); usypianie
po 15 min bezczynności + ~1 min budzenia to główna wada demo („pierwsze wejście trwa minutę”).

**Railway (finalista).** (a) Usługa ze źródłem „Docker Image” (GHCR natywnie), `railway redeploy --service … --yes`
z `RAILWAY_TOKEN` w GHA (oficjalne CLI, obraz `ghcr.io/railwayapp/cli`); env w projekcie; domena = CNAME + TXT.
(b) Pełna zgodność; Amsterdam; timeout 5 min bez danych — komfortowy zapas; bez usypiania (Serverless jest opt-in).
(c) Środowiska projektu i PR environments [?] — lepiej niż Render Hobby. (d) Hobby 5 USD/mies. z 5 USD usage; stała
instancja 512 MB ≈ 5 USD RAM + ~~1 USD CPU → rachunek 5–6 USD/mies. [~~]; Trial/Free (1 USD/mies.) tylko do testu.
Brak klauzuli niekomercyjnej w docs, ToS nie sprawdzono.

## 5. Oceny (0–10; 10 = bezpośrednia rekomendacja dla MindAgory w obecnym kształcie)

| Platforma                 | Ocena | Powody                                                                                                          |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| Render (Free)             | **8** | spełnia (a)–(e) za 0 USD bez zmian w aplikacji; −1 usypianie/budzenie ~1 min, −1 nieznany timeout i 0,1 CPU     |
| Railway (Hobby)           | **7** | najlepszy runtime (GHCR, EU, bez usypiania, 5 min); −2 koszt 5–6 USD przy dostępnej opcji za 0, −1 usage-based  |
| DigitalOcean App Platform | 6     | 1:1 z kursem, GHCR, `doctl`; −2 brak free, −1 limit 100 s blisko naszych 60 s, −1 bez autodeployu z GHCR        |
| Cloudflare Containers     | 6     | 5 USD, domena w domu, EU placement, bez limitu czasu; −2 GHCR → re-push do rejestru CF, −2 własny Worker-router |
| Cloudflare Workers        | 5     | tanio, bez limitu ściennego, domena w domu; −3 wymiana adaptera i runtime ≠ Node, −2 obraz GHCR bez użycia      |
| Fly.io                    | 5     | ~2 USD, `--image` z GHCR, EU; −3 60 s idle-timeout na profilu naszych requestów, −2 brak free, karta            |
| Hetzner VPS               | 5     | pełna kontrola, brak limitów; −2 CX23 niedostępny i ceny w górę, −3 DIY (OS, Caddy, deploy przez SSH)           |
| Google Cloud Run          | 5     | realny free tier, GHCR bezpośrednio, 60 min; −3 domena (mapping preview / LB płatny), −2 narzut GCP i billing   |
| Netlify                   | 4     | free z komercją; −3 wymiana adaptera, −3 twardy limit 60 s = nasz czas odpowiedzi modelu                        |
| Vercel                    | 4     | 300 s, preview per PR; −3 wymiana adaptera, −3 Hobby niekomercyjny → 20 USD/mies.                               |
| Koyeb                     | 3     | technicznie dobry (free 512 MB, FRA, akcja GHA); −7 Starter zamknięty dla nowych, Pro 29 USD                    |

## 6. Rekomendacja dla MindAgory

**Teraz: Render, instancja Free, region Frankfurt. Plan B: Railway Hobby (5 USD).** Obraz jest ten sam — zmiana platformy
to nowa usługa, te same env i inny krok `deploy` (poniżej), bez dotykania aplikacji. DigitalOcean zostaje fallbackiem
1:1 z kursem, gdyby oba zawiodły.

**Krok `deploy` w `master.yml` (Render):** job `deploy` z `needs: [image]`, `environment: production` (required
reviewers, T8), jeden krok `curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL?imgURL=ghcr.io/<owner>/mindagora:${GITHUB_SHA}"`
(Deploy Hook przyjmuje GET/POST, `imgURL` = tag lub digest; 200 = start, 202 = kolejka [✓]). URL hooka zawiera klucz →
sekret środowiska `production` (`gh secret set --env production`, T10). Bez oficjalnej akcji Render — nie jest potrzebna.
Alternatywa: Render API [?].

**Podpięcie obrazu:** Render Dashboard → New Web Service → „Existing image” → `ghcr.io/<owner>/mindagora:latest`
(publiczny, bez poświadczeń), instancja Free, region Frankfurt. Obraz `linux/amd64` [✓ wymóg Render]. **Do sprawdzenia
na koncie:** czy formularz pozwala wybrać Free dla usługi z obrazu i Frankfurt dla Free (docs tego nie mówią wprost).

**Zmienne:** Environment usługi: `SUPABASE_URL`, `SUPABASE_KEY` (anon prod), `OPENROUTER_HTTP_REFERER=https://mindagora.ai`,
`OPENROUTER_X_TITLE`; `HOST=0.0.0.0` w obrazie (T7); `PORT` wstrzykuje Render — adapter Node czyta go z env. Health check:
`GET /login`. Warunek wstępny spełniony przez `astro:env` (T1 w briefie §9.1: `import.meta.env` nie działa w runtime
kontenera).

**Domena `mindagora.ai` (Cloudflare DNS):** w Render dodać `mindagora.ai` i `www.mindagora.ai` (2 domeny w Hobby [✓]);
w Cloudflare: `CNAME @ → <usługa>.onrender.com` (apex przez CNAME flattening — domyślnie na wszystkich planach, Free
też [✓]) i `CNAME www → <usługa>.onrender.com`, oba **DNS only** do czasu wystawienia certyfikatów przez Render, usunąć
ewentualne `AAAA` (Render bez IPv6), potem opcjonalnie Proxied z SSL/TLS = Full [✓ poradnik Render]. Supabase Auth:
`site_url` i redirect = `https://mindagora.ai` (T4, T9).

**Usypianie:** po 15 min ciszy pierwszy request budzi kontener ~1 min. Dla demo akceptowalne — wpis w README („first
load may take up to a minute”). Obejście (ping co 10 min z zewnętrznego crona) mieści się w 750 h/mies., ale to
utrzymywanie free-tieru na siłę; jeśli budzenie przeszkadza (rekrutacja, pokazy) → plan B.

**Weryfikacja empiryczna w pierwszym tygodniu (rozstrzyga o planie B):** (1) request z wolnym modelem 60–90 s przez
domenę — czy Render nie ucina (limit nieudokumentowany); (2) czas SSR czatu na 0,1 CPU; (3) budzenie ze snu przy
sesji cookie (middleware → Supabase) — czy pierwszy request po budzeniu nie kończy się 401/redirectem.

**Plan B — Railway Hobby:** usługa ze źródłem Docker Image `ghcr.io/<owner>/mindagora:latest`, region EU West; krok
`deploy`: `npx -y @railway/cli@latest redeploy --service <id> --yes` z `RAILWAY_TOKEN` (token projektu) [✓ CLI docs];
env w Variables; domena: CNAME + TXT wg Railway [✓]. Koszt: 5 USD/mies. + ewentualna nadwyżka usage ~~0–1 USD [~~].

**Szacunkowy koszt miesięczny:** Render Free 0 USD (Supabase free, Cloudflare DNS 0, domena już opłacona w Registrarze);
plan B 5–6 USD; DO 5 USD + VAT. Zgodne z ap3 („DigitalOcean via Docker”) w duchu — obraz Dockera zostaje, hoster jest
wymienny; README/ap3 do aktualizacji po wdrożeniu.

**Preview per PR (później):** Render wymaga Pro; Railway ma środowiska/PR environments [?]; dla solo-dewelopera z E2E na
lokalnym stosie w CI (3x5) nie jest to potrzebne w 2026.

## 6a. Decyzja użytkownika (2026-09-12) — kryterium zmienione: portfolio, zawsze włączone

Aplikacja ma żyć jako element publicznego portfolio i materiał do kolejnych certyfikacji, więc usypianie (Render Free,
Railway z App Sleeping) i pingi podtrzymujące odpadają jako stan docelowy. Przy tym kryterium **plan A = Railway**
(udokumentowany timeout 5 min na request bez danych, bez usypiania, Amsterdam, GHCR jako natywne źródło, oficjalne
CLI do redeployu), **plan B = Render Starter** (~7 USD/mies., stała cena, timeout nieudokumentowany). Ścieżka: konto
Railway na planie Free (30-dniowy trial z 5 USD kredytu, bez karty) na PR 2 i weryfikację (deploy z GHCR, domena, długi
request), potem workspace na Hobby (5 USD/mies. z 5 USD zużycia). Zmierzone lokalnie: RSS zbudowanego serwera 86 MB po
starcie, 146 MB po kilkunastu żądaniach z SSR → zawsze włączona usługa ≈ 2–2,5 USD/mies. zużycia (RAM ~10 USD/GB/mies.),
czyli 1 USD kredytu planu Free starcza na ~pół miesiąca — Free bez usypiania nie utrzyma aplikacji, Hobby mieści ją
w kredycie. Krok `deploy` w `master.yml`: `npx -y @railway/cli@latest redeploy --service <id> --yes` z `RAILWAY_TOKEN`
jako sekretem środowiska `production` (zamiast Deploy Hooka Rendera z §6).

## 7. Źródła (sprawdzone 2026-09-12) i co się zmieniło od kursu (04.2025)

- https://render.com/docs/free — Free: 750 h/mies., usypianie po 15 min, budzenie ~1 min, własne domeny i TLS na Free.
- https://render.com/docs/deploying-an-image — publiczny obraz z dowolnego rejestru, redeploy przez hook `imgURL`,
  obraz `linux/amd64`, ≤ 10 GB.
- https://render.com/docs/deploy-hooks — hook GET/POST, `imgURL`, kody 200/202, przykład z `curl` w GHA.
- https://render.com/docs/configure-cloudflare-dns — CNAME apex i www, DNS-only do certów, SSL Full, usunąć AAAA.
- https://render.com/docs/new-workspace-plans — Hobby bez opłaty, 1 członek, 25 usług, 2 środowiska; preview w Pro.
- https://render.com/docs/regions — Oregon, Ohio, Virginia, Frankfurt, Singapur.
- https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026 (23.04.2026) — 2 domeny w Hobby,
  bez karty; Fly.io bez free dla nowych; Railway 1 USD/mies. po trialu; Netlify limit funkcji 60 s.
- https://render.com/docs/troubleshooting-deploys — brak limitu requestu w docs; rada `keepAliveTimeout` 120 s.
- https://docs.railway.com/pricing/plans i …/reference/pricing/free-trial — Trial 5 USD/30 dni → Free 1 USD/mies.;
  Hobby 5 USD z 5 USD usage; Pro 20 USD.
- https://docs.railway.com/guides/services — publiczne obrazy z Docker Hub, GHCR, GitLab, Quay; redeploy tagu `latest`.
- https://docs.railway.com/reference/regions — US West, US East, EU West (Amsterdam), Singapur.
- https://docs.railway.com/networking/public-networking/specs-and-limits — 15 min przy transferze, 5 min bez danych.
- https://docs.railway.com/reference/app-sleeping — Serverless opt-in, sen po 5–10 min bez ruchu wychodzącego.
- https://docs.railway.com/reference/cli-api — `railway redeploy` (`--service`, `--yes`), `RAILWAY_TOKEN`.
- Stawki usage Railway (10 USD/GB RAM, 20 USD/vCPU miesięcznie): tylko zestawienia zewnętrzne — [~].
- https://www.koyeb.com/blog/koyeb-is-joining-mistral-ai-to-build-the-future-of-ai-infrastructure (17.02.2026) i
  https://techcrunch.com/2026/02/17/… — Starter usuwany, nowi użytkownicy: Pro/Scale/Enterprise z kartą.
- https://www.koyeb.com/pricing — Pro 29 USD/mies. + compute, Scale 299 USD. https://www.koyeb.com/docs/reference/instances
  — free 512 MB/0,1 vCPU, FRA/WAS, sen po 1 h (stan docs, dotyczy istniejących organizacji).
- https://github.com/koyeb/action-git-deploy — `@v1`, źródło `docker`, `service-env`, `service-regions`.
- https://fly.io/docs/about/pricing/ i …/about/free-trial/ (27.10.2025) — shared-cpu-1x 256 MB 2,02 USD (ams),
  rootfs 0,15 USD/GB, 10 certów free; trial 2 h/7 dni; karta wymagana.
- https://community.fly.io/t/request-timeouts-on-fly-io/5653/2 — staff: 60 s bez danych zamyka połączenie.
- https://fly.io/docs/flyctl/deploy/ — `-i, --image`; …/launch/continuous-deployment-with-github-actions/ —
  `superfly/flyctl-actions/setup-flyctl@master`, `FLY_API_TOKEN`. …/reference/regions/ — brak Warszawy.
- https://docs.digitalocean.com/products/app-platform/details/pricing/ — `apps-s-1vcpu-0.5gb` 5 USD, 512 MiB, 50 GiB.
- https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-container-images/ — DOCR, Docker Hub, GHCR;
  publiczne bez poświadczeń; `doctl apps create-deployment`; autodeploy tylko z DOCR.
- https://docs.digitalocean.com/products/app-platform/details/availability/ — AMS, FRA, LON i inne.
- Limit 100 s DO: odpowiedzi DO na community (nie w docs limits) — [~]. https://github.com/digitalocean/action-doctl — `@v2`.
- https://developers.cloudflare.com/containers/ i …/containers/pricing/ — GA na Workers Paid 5 USD; `lite` 256 MiB;
  25 GiB-h, 375 vCPU-min, 200 GB-h w cenie; `sleepAfter` 10 min; bez opłat w uśpieniu.
- https://developers.cloudflare.com/containers/platform-details/image-management/ — rejestr CF, Docker Hub, ECR, GAR;
  inne rejestry przez `wrangler containers push`. …/changelog/post/2026-04-05-regional-placement/ — jurysdykcja `eu`.
- https://developers.cloudflare.com/workers/platform/limits/ — Free 10 ms CPU, Paid 30 s (do 5 min), brak limitu
  ściennego requestu. https://github.com/cloudflare/wrangler-action — `@v4`.
- https://developers.cloudflare.com/dns/cname-flattening/set-up-cname-flattening/ — flattening apex domyślnie na
  wszystkich planach.
- https://docs.astro.build/en/guides/integrations-guide/cloudflare/ — `nodejs_compat`, brak CommonJS, `sharp`, sesje KV.
- https://www.hetzner.com/cloud/cost-optimized/ — CX/CAX „currently not available” (12.09.2026);
  https://docs.hetzner.com/cloud/servers/overview/ — IPv4 0,50 EUR/mies.; https://costgoat.com/pricing/hetzner
  (05.09.2026) i https://northflank.com/blog/hetzner-cloud-server-price-increases — CX23 3,99 → 5,49 EUR (15.06.2026),
  CAX11 5,99, CPX22 19,49 [~]. Cena CPX12 — cennik ładowany skryptem, nie odczytano [?].
- https://docs.cloud.google.com/free/docs/free-cloud-features — Cloud Run 2 M req, 180 k vCPU-s, 360 k GiB-s;
  …/run/docs/deploying — Artifact Registry, publiczne Docker Hub i GHCR; …/run/quotas — 60 min;
  …/run/docs/mapping-custom-domains — domain mapping w preview, „not production-ready”, LB zalecany.
- https://docs.netlify.com/build/functions/configuration/ — synchroniczne 60 s (nieskonfigurowalne), background 15 min;
  https://www.netlify.com/pricing/ — Free 0 USD, Personal 9 USD; komercja na Free: forum Netlify (staff) [~].
- https://vercel.com/docs/plans/hobby (31.08.2026) — Hobby „non-commercial, personal use only”, 300 s;
  https://vercel.com/docs/functions/limitations (24.08.2026) — Hobby 300 s max, Pro 800 s.
- https://docs.astro.build/en/guides/deploy/ — lista dostawców z SSR (Netlify, Vercel, Cloudflare, Fly.io, Railway…).

**Co się zmieniło od 04.2025:** Cloudflare Pages → Workers, a Containers z „coming” stały się GA (z placementem EU od
04.2026); Koyeb po przejęciu przez Mistral (02.2026) zamknął Starter/free dla nowych kont; Fly.io bez free od 10.2024;
Hetzner podniósł ceny (04 i 06.2026) i wstrzymał sprzedaż CX/CAX; Netlify przeszedł na kredyty i podniósł limit funkcji
do 60 s; Vercel Fluid compute daje 300 s na Hobby, ale klauzula niekomercyjna została; Railway dodał Free 1 USD/mies.
po trialu; DigitalOcean 5 USD bez zmian; Render Free bez zmian w istocie (usypianie, 750 h).
