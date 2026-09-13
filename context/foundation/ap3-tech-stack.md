# Tech Stack - MindAgora

Frontend - Astro z React dla komponentów interaktywnych:

- Astro 5 pozwala na tworzenie szybkich, wydajnych stron i aplikacji z minimalną ilością JavaScript
- React 19 zapewni interaktywność tam, gdzie jest potrzebna
- TypeScript 5 dla statycznego typowania kodu i lepszego wsparcia IDE
- Tailwind 4 pozwala na wygodne stylowanie aplikacji
- Shadcn/ui zapewnia bibliotekę dostępnych komponentów React, na których oprzemy UI

Backend - Supabase jako kompleksowe rozwiązanie backendowe:

- Zapewnia bazę danych PostgreSQL
- Zapewnia SDK w wielu językach, które posłużą jako Backend-as-a-Service
- Jest rozwiązaniem open source, które można hostować lokalnie lub na własnym serwerze
- Posiada wbudowaną autentykację użytkowników

AI - Komunikacja z modelami przez usługę Openrouter.ai:

- Dostęp do szerokiej gamy modeli (OpenAI, Anthropic, Google i wiele innych), które pozwolą nam znaleźć rozwiązanie zapewniające wysoką efektywność i niskie koszta
- Pozwala na ustawianie limitów finansowych na klucze API

CI/CD i Hosting:

- Github Actions do tworzenia pipeline'ów CI/CD
- Railway do hostowania aplikacji z obrazu Dockera publikowanego na GHCR (wdrożenie na każdy push do master przez `master.yml`,
  wydanie za bramką środowiska GitHub `production`); Cloudflare: domena `mindagora.ai`, DNS i TLS (decyzja E8, 2026-09-12;
  analiza hostingu: ap9; DigitalOcean z kursu został fallbackiem)

Testing:

- Vitest + React Testing Library do testów jednostkowych
- Playwright do testów end-to-end
- Codecov do śledzenia pokrycia kodu
