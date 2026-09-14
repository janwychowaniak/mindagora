# Plan testów MindAgora (ap8)

Stan: 2026-09-12. Źródło prawdy dla procesu QA razem z kodem testów (`src/**/*.test.ts(x)`,
`vitest.config.ts`, `src/test/setup.ts`), skryptem smoke (`sketch/smoke-baseline.sh` + `baseline-*.out`) i regułą
`.claude/rules/testing.md`. Powiązane: PRD (ap2), plan API (ap5 §9), stack (ap3), spec auth (ap6), plan UI (ap7 §5.4),
inwentarz (`sketch/triage-inwentarz.md`: E4, A6, A14, A15). Dokument opisuje strategię, zakres, scenariusze i kryteria,
nie implementację testów. Struktura wg szablonu `test-plan.mdc`, skrojona pod projekt jednoosobowy (§7, §9, §10
skrócone do tego, co ma u nas nośnik).

## 0. Decyzje (2026-09-12)

1. **Piramida (E4):** unit (Vitest, bez sieci i bazy) → integracja = smoke curl (realny serwer, Supabase lokalny,
   OpenRouter, RLS) → E2E Playwright. Testów integracyjnych endpointów z mockiem OpenRoutera w Vitest
   nie piszemy — dublowałyby smoke z gorszą wiernością.
2. Plan po polsku w `specs_ai/`, cross-check drugim czytelnikiem (subagent) zamiast drugiego modelu w AI Studio.
3. Zakres unitów w etapie testów jednostkowych: priorytet P1 w całości, dwa–trzy hooki (P2), dwa–trzy komponenty (P3). Kompensacje
   w `conversations.service` (P2b) i ekstrakcje (P4) — później.
4. Środowisko: domyślnie `node`; pliki hooków i komponentów deklarują `// @vitest-environment jsdom`.
5. Narzędzia: Vitest 4.1 (Vitest 5 odłożone, D4b), jsdom, React Testing Library, jest-dom, user-event,
   `@vitest/coverage-v8` w wersji Vitest; bez `@vitest/ui`, bez MSW, bez progów pokrycia.
6. `npm test` = `vitest run` (jednorazowy przebieg dla agenta i CI), `npm run test:watch` = `vitest`,
   `npm run test:coverage` = raport v8 na żądanie; pre-commit bez testów (lint-staged zostaje szybki; strażnikiem testów jest reguła „`npm test` przed commitem” i CI).
7. Konwencje w `.claude/rules/testing.md`; nowa logika ze szwem czystym dostaje test w tym samym commicie
   (`CLAUDE.md` aplikacji).
8. Kolokacja: `*.test.ts(x)` obok źródła.
9. Ekstrakcje pod testy (duplikaty endpointów, predykaty middleware, prywatne helpery serwisów) → etap refaktoryzacji (A6, A15).

## 1. Wprowadzenie i cele

MindAgora to czat z wieloma uczestnikami AI (OpenRouter) i jednym, zawsze pełnym kontekstem konwersacji. MVP jest
funkcjonalnie kompletne (backend: 12 endpointów + 3 auth, RLS; UI: onboarding, ustawienia, lista, czat). Przed nami
refaktoryzacja, CI, wdrożenie i dalsza rozbudowa — każdy z tych kroków potrzebuje siatki
bezpieczeństwa.

Cele testów:

- **Regresja:** każda zmiana w kodzie ma szybki, deterministyczny sygnał (`npm test` w sekundach, bez sieci i bazy)
  i wolniejszy sygnał realny (smoke przy zmianach endpointów).
- **Ochrona wartości produktu:** pełny kontekst do każdego uczestnika, brak trybu „skrótu”; izolacja danych między
  użytkownikami (RLS); brak trwałych półproduktów po błędzie OpenRoutera (kompensacja).
- **Dokumentacja zachowań:** testy nazywają reguły z PRD/ap5/ap7 (np. auto-tytuł, 412 bez klucza, Enter wysyła).
- **Gotowość na CI:** `npm test` i `npm run lint` jako bramki PR; E2E jako bramka opcjonalna.

Zasady: testy chronią zachowanie, nie implementację; nie ma testów bez sensu biznesowego; unit nie dotyka sieci ani
bazy; tam, gdzie mock dublowałby pracę, jest realna integracja (smoke); losowość, czas i strefa czasowa są w testach
pod kontrolą.

## 2. Zakres

### 2.1. W zakresie

| Obszar                                                                  | Poziom                                             | Uwagi                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/*.ts` (format, color, api-client, onboarding-gate, validation) | unit                                               | czyste lub ze szwem `fetch`/`window`                         |
| `src/lib/services/*.service.ts`                                         | unit (części czyste, szew `fetch`), smoke (reszta) | serwis OpenRouter ma 10 testów; serwisy Supabase przez smoke |
| `src/components/hooks/*`                                                | unit (jsdom, mock `api-client`)                    | stan i semantyka statusów HTTP                               |
| `src/components/{auth,settings,onboarding,conversations,chat,shared}`   | unit (wybrane), E2E (reszta)                       | komponenty z logiką bez Radix → unit; z Radix → E2E          |
| `src/middleware/index.ts`                                               | smoke (AUTH), E2E                                  | predykaty czyste → unit po ekstrakcji (A15)                  |
| `src/pages/api/**`                                                      | smoke                                              | kontrakty ap5; walidacja Zod; mapowanie błędów               |
| `src/pages/*.astro`                                                     | E2E                                                | bramki onboardingu, przekierowania                           |
| `supabase/migrations/**` (RLS, triggery, CASCADE / SET NULL)            | smoke                                              | cross-user 404, `ON DELETE SET NULL`, CASCADE                |
| Sekrety                                                                 | statyczne                                          | gitleaks: hooki, CI, push protection                         |

### 2.2. Poza zakresem

shadcn/ui i Radix (cudzy kod; w jsdom wymagają polyfilli — sprawdza je E2E), renderowanie stron Astro w Vitest
(Container API; strony sprawdza E2E), OpenRouter i Supabase jako usługi, testy wydajnościowe i obciążeniowe (MVP,
jeden użytkownik naraz), audyt dostępności (Lighthouse/axe — kandydat po wdrożeniu), pentest (poza MVP; bezpieczeństwo
= RLS w smoke + gitleaks + reguły `api.md`), testy wizualne/snapshoty DOM (kruche przy Tailwind), progi pokrycia.

## 3. Strategia: poziomy testów

| Poziom         | Narzędzie                                                                    | Co sprawdza                                                                                   | Środowisko                                                                      | Kiedy                                                    | Stan 2026-09-12                                                                                                        |
| -------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Statyczne      | TypeScript przez `npm run check` (`astro check`), ESLint, Prettier, gitleaks | typy (także `.astro`), styl, sekrety                                                          | lokalnie + hooki + CI                                                           | każdy commit; job `lint` w CI                            | gitleaks CI, lint-staged, `check` w CI                                                                                 |
| Jednostkowe    | Vitest 4 (`node` / `jsdom` per plik), RTL, user-event                        | czyste funkcje, hooki, komponenty z logiką                                                    | bez sieci i bazy                                                                | `npm test` przed commitem; CI                            | 10 testów serwisu OpenRouter → etap testów jednostkowych rozszerza                                                     |
| Integracyjne   | `sketch/smoke-baseline.sh` (curl, Bearer + cookie)                           | endpointy end-to-end z realnym Supabase, OpenRouterem, RLS, triggerami                        | dev server :3000, Supabase lokalny, klucz OpenRouter                            | przed commitem zmian endpointów / serwisów / migracji    | 110 PASS / 0 FAIL / 5 SKIP, 14 prefiksów ID w 15 blokach                                                               |
| E2E            | Playwright 1.63 (`e2e/`, Chromium, 1 worker)                                 | przepływy użytkownika w przeglądarce: auth, onboarding, rozmowa z realnym OpenRouterem, lista | LOKALNY stos Supabase, `.env.test`, konto E2E z projektu `setup`, `data-testid` | `npm run test:e2e` lokalnie; job `e2e` w CI na każdym PR | 10 testów + setup/teardown (2026-09-12); bez klucza OpenRoutera 6 pomijanych; model `meta-llama/llama-3.2-1b-instruct` |
| Bezpieczeństwo | smoke (RLS), gitleaks, przegląd kodu (`api.md`)                              | izolacja użytkowników, sekrety, brak service role, CSRF (SameSite + Content-Type, ap5 §8.5)   | jw.                                                                             | jw.                                                      | RLS w smoke; gitleaks                                                                                                  |

**Dobór poziomu:** czysta funkcja → unit. Logika stanu hooka → unit z `vi.mock("@/lib/api-client")`. Interakcja
użytkownika z komponentem bez Radix → unit z user-event. Wszystko, co wymaga bazy, RLS, OpenRoutera, cookies lub Radix →
smoke albo E2E. Mock jest dozwolony na granicy procesu (`fetch`, `window.location`, `Math.random`, zegar) i na granicy
modułu (`api-client` w hookach, serwisy w `onboarding.service`/`onboarding-gate`); nie mockujemy Supabase w unitach.

## 4. Scenariusze testowe

### 4.1. Mapa modułów (drzewa zależności, prompt „Wizualizacja struktury komponentów”)

```
/settings (settings.astro, bez bramki — zawsze dostępne, ap7 §4), /onboarding (onboarding.astro liczy krok własną logiką,
                        przy `complete` przekierowuje na `/`)
SettingsView / OnboardingView (krok z `resolveOnboardingStep`, `canContinue` = participantCount >= 2)
├── ApiKeyForm ── useApiKey ── apiGet/apiPut /api/user-settings ── user-settings.service ── openrouter.validateApiKey
│   └── ErrorDialog (400 string / 408 → dialog; reszta inline)
└── ParticipantsPanel ── useParticipants (sortByAlias) ── /api/ai-participants ── ai-participants.service
    ├── AddParticipantForm (ALIAS_PATTERN, randomHexColor, fieldErrors 400/409)
    │   └── ModelCombobox (cmdk + Popover) ── useModels ── /api/openrouter-models ── openrouter.getModels
    └── ParticipantList ── ConfirmDialog (AlertDialog)

/ (index.astro → onboardingGate)
ConversationListView ── useConversations ── apiGet/apiPut/apiDelete /api/conversations[/:id] ── conversations.service
├── EmptyState
└── ConversationListItem (formatRelative, ConfirmDialog)
    └── InlineTitleEditor (Enter/Escape/blur, fieldErrors)

/conversations/new, /conversations/:id ([id].astro, new.astro → onboardingGate)
ChatView (status: loading/ready/not-found/error, document.title) ── useConversation ── /api/ai-participants,
│                                                                     /api/conversations[/:id[/messages]]
├── ChatHeader
├── MessageList ── useAutoScroll, isSameDay ── DateSeparator, MessageItem (formatTime), PendingReply
├── Composer (canSend, Enter/Shift+Enter/IME, licznik od 9000) ── ParticipantPicker (Radix Select, tooltip < 2)
└── ErrorDialog („Message not sent”)

/login, /register (login.astro, register.astro; Layout.astro → LogoutButton)
LoginForm / RegisterForm ── validateCredentials (auth-api.ts) ── apiPost /api/auth/* ── authCredentialsSchema ──
auth.service (signInWithPassword / signUp / signOut)

Wspólne: api-client (401 → /login poza /api/auth/*, 412 → /settings?notice=api-key poza /settings)
Serwer: middleware (Bearer | cookie → locals.user, locals.supabase) → endpointy (Zod, jsonError, mapowanie
błędów OpenRouter) → serwisy (Supabase z RLS; conversations.service z kompensacją) → openrouter.service (fetch,
timeouty, klasy błędów)
```

### 4.2. Kandydaci do testów jednostkowych (prompt „Analiza kandydatów”)

Priorytet: P1 = czyste i tanie, P2 = hooki, P3 = komponenty, P4 = po ekstrakcji (etap refaktoryzacji). Kolumna „Scenariusze” to
zbiór przypadków, z których testy wybierają te z sensem biznesowym; „Uwagi” — szwy i pułapki.

**P1 — helpery i funkcje czyste (środowisko `node`)**

| Moduł                                | Funkcja                           | Scenariusze                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Uwagi                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/services/onboarding.service.ts` | `resolveOnboardingStep`           | brak klucza → `api-key` (niezależnie od liczby uczestników); klucz + 0/1 uczestników → `participants`; klucz + 2 i więcej → `complete`; próg = `MIN_PARTICIPANTS`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | pierwszy test; reguła PRD §3.2                                                                                                                                                                                                                                                                         |
|                                      | `getOnboardingStatus`             | błąd ustawień → `{data:null,error}`; błąd zliczania → error; `count: null` → error z komunikatem zastępczym (gałąź obronna: `countAiParticipants` sam zamienia `null` na błąd, osiągalna tylko przez mock); pusty klucz `""` → `hasApiKey: false`; klucz + count → `data`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `vi.mock` `user-settings.service` i `ai-participants.service`; nie importować `supabase.client`                                                                                                                                                                                                        |
| `lib/format.ts`                      | `formatRelative(iso, now)`        | 0–59 s → `just now`; 60 s → `1m ago`; 59 min → `59m ago`; 1 h → `1h ago`; 23 h; 1 d → `1d ago`; 6 d; 7 d → dzień (`formatDay`); granice dokładnie na progu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `now` wstrzyknięte; wynik do 7 dni niezależny od TZ                                                                                                                                                                                                                                                    |
|                                      | `formatDay(iso, now)`             | ten sam rok → bez roku; inny rok → z rokiem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ISO z godziną 12:00 UTC, żeby TZ nie przesunął dnia                                                                                                                                                                                                                                                    |
|                                      | `isSameDay`                       | ten dzień; sąsiednie dni; ten dzień miesiąca w innym miesiącu/roku                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | jw.                                                                                                                                                                                                                                                                                                    |
|                                      | `formatTime`                      | `10:45 AM`, `10:05 PM`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | TZ przypięte do UTC przez `test.env` w `vitest.config.ts`, więc asercja dokładna                                                                                                                                                                                                                       |
| `lib/validation/auth-credentials.ts` | `authCredentialsSchema`           | poprawne dane; e-mail z białymi znakami → przycięty; e-mail bez `@` → komunikat; hasło 5 znaków → komunikat; oba błędy naraz → dwa komunikaty; obce klucze usunięte; brak pola → błąd                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Zod 3; komunikaty 1:1 z kodu                                                                                                                                                                                                                                                                           |
| `components/auth/auth-api.ts`        | `validateCredentials`             | te same przypadki co wyżej + **test zgodności**: dla tabeli wejść obie implementacje zgadzają się co do pól z błędem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | czysty, bez React. Znany rozjazd (A16): regex klienta przepuszcza `a@b.c`, `a@b..com`, `a@-b.com`, które Zod `.email()` odrzuca — tabela zgodności używa wejść, na których obie strony mają się zgadzać; dla brzegowych klient przepuszcza, serwer odpowiada 400 i formularz pokazuje komunikat z pola |
| `lib/services/auth.service.ts`       | `extractBearerToken`, `signOut`   | brak nagłówka → `null`; `Basic …` → `null`; `Bearer` bez tokenu → `null`; `Bearer abc` → `abc`; `bearer abc` (małe litery) → `abc`; wiele spacji po `Bearer`; `signOut` woła bibliotekę z `scope: "local"` (nie wylogowuje innych urządzeń) i zgłasza błąd usługi                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | tylko `new Request(url, { headers })`; moduł czyta env na poziomie modułu, ale nie używa go przy imporcie                                                                                                                                                                                              |
| `lib/color.ts`                       | `randomHexColor`                  | format `^#[0-9A-F]{6}$`; `Math.random` = 0 → wartość deterministyczna; = 0.999… → wartość deterministyczna; 6 sektorów barwy (hue w środku sektora) → dominujący kanał zgodny z sektorem; każdy kanał w paśmie czytelnym dla ciemnego motywu (min. kanał w całym paśmie S/L to 0x2B, więc zero-padding w `toHex` jest nieosiągalne — bez testu)                                                                                                                                                                                                                                                                                                                                                                                        | `vi.spyOn(Math, "random").mockReturnValueOnce(...)` ×3 na wywołanie; bez testu „losowości”                                                                                                                                                                                                             |
| `lib/api-client.ts`                  | `apiGet/apiPost/apiPut/apiDelete` | `fetch` rzuca → `{ok:false, status:0, message: NETWORK_ERROR_MESSAGE}`; 200 z JSON → `{ok:true, data}`; 200 bez JSON → `Invalid response` + `GENERIC_ERROR_MESSAGE`; 400 z `details` string → `message` = string; 400 z `details` mapą → `message` = wartości połączone spacją; mapa pusta → `GENERIC_ERROR_MESSAGE`; 500 bez ciała → `error: "Error"`; POST z body → nagłówek `Content-Type: application/json` i `JSON.stringify`; POST bez body → brak nagłówka i body; **401 na `/api/conversations` → `location.assign("/login")`**; **401 na `/api/auth/login` → bez przekierowania**; **412 poza `/settings` → `assign("/settings?notice=api-key")`**; **412 na `/settings` → bez przekierowania**; metody przekazane do `fetch` | `vi.stubGlobal("fetch")`, `vi.stubGlobal("window", { location: { pathname, assign: vi.fn() } })`; `Response` natywny                                                                                                                                                                                   |
|                                      | `fieldErrors`, `formMessage`      | details string → `{}` / message; details mapa → mapa / `null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 2 + 2 przypadki                                                                                                                                                                                                                                                                                        |
| `lib/onboarding-gate.ts`             | `onboardingGate`                  | brak `locals.user` → `/login`; status z błędem → `Response` 503 + `console.error`; `data: null` → 503; krok ≠ `complete` → `/onboarding`; `complete` → `null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `vi.mock` z `importOriginal` (mockowane tylko `getOnboardingStatus`, `resolveOnboardingStep` prawdziwe); `console.error` przez `vi.spyOn`                                                                                                                                                              |

**P2 — hooki (`// @vitest-environment jsdom`, `renderHook` + `act`/`waitFor`, `vi.mock("@/lib/api-client")`)**

| Hook                            | Scenariusze                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useConversations`              | start: `loading` → po sukcesie `ready` z listą w kolejności z API; błąd → `error` + `loadError`; `reload` czyści błąd; `rename` sukces → tytuł podmieniony, kolejność bez zmian, zwraca `null`; `rename` 404 → wiersz usunięty lokalnie, zwraca failure; `rename` 400 → lista nietknięta, zwraca failure; `remove` sukces → wiersz usunięty; `remove` 404 → wiersz usunięty, zwraca `null`; `remove` 500 → lista nietknięta, zwraca failure                                                                                                                                                                                                                                             |
| `useConversation`               | `null` (szkic): ładuje tylko uczestników, `conversation === null`, `ready`; id: równoległe `GET` uczestników i konwersacji; błąd uczestników → `error`; konwersacja 404 → `not-found`; konwersacja 500 → `error`; `send` z nieznanym uczestnikiem → failure `status: 0`, bez wywołania API; `send` w szkicu → `POST /api/conversations` z `{user_message, ai_participant_id}`, `pending` ustawiony w trakcie i wyczyszczony po, `conversation` = odpowiedź, `history.replaceState` z `/conversations/:id`; `send` w konwersacji → `POST …/messages`, dwie wiadomości dopisane, `updated_at` z odpowiedzi AI; `send` z błędem → `pending` wyczyszczony, failure zwrócony, stan bez zmian |
| `useModels`                     | `idle` na starcie, bez wywołań; `load` → `loading` → `ready` z listą; drugie `load()` bez `retry` → brak drugiego wywołania; po błędzie `load(true)` i zwykłe `load()` → ponowne wywołanie (`startedRef` zresetowany); 412 → komunikat „Add your OpenRouter API key first.”; inny błąd → `failure.message`                                                                                                                                                                                                                                                                                                                                                                              |
| `useParticipants` (opcjonalnie) | `add` wstawia w porządku aliasów (bez rozróżniania wielkości liter); `remove` 404 → failure, lista nietknięta (inaczej niż `useConversations` — rozjazd A17, do ujednolicenia w etapie refaktoryzacji)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `useApiKey` (opcjonalnie)       | `load: false` → `ready` bez wywołania; `load: true` → `ready` z ustawieniami / `error` z `loadError`; `save` → `saving` w trakcie, `settings` po sukcesie, zwraca wynik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**P3 — komponenty (`jsdom`, `render` + `user-event`, zapytania po roli i `data-testid` z ap7 §5.4)**

| Komponent           | Scenariusze                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Uwagi                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InlineTitleEditor` | klik w tytuł → pole z wartością, fokus i zaznaczenie; Enter z nową wartością → `onSave(trimmed)`, po `null` wraca do tytułu; Enter z pustym → „Title cannot be empty”, `onSave` nie wołany; Enter z tą samą wartością → wyjście z edycji bez `onSave`; Escape → anulowanie bez `onSave`; blur → anulowanie; `onSave` zwraca failure z `details.title` → komunikat z pola; failure ze stringiem → `message`; w trakcie zapisu pole `disabled`, blur w trakcie zapisu nie anuluje                                                                    | brak Radix; `role="alert"` na błędzie                                                                                                                    |
| `Composer`          | pusty tekst → Send `disabled`; tekst bez uczestnika → `disabled`; tekst + uczestnik → aktywny; `busy` → `disabled` i etykieta „Sending…”; < 2 uczestników → Send `disabled` (blokada pickera to logika `ParticipantPicker`, po mocku — E2E); Enter → `onSend(text, id)` i po `true` pole puste, uczestnik zresetowany; Enter po `false` → tekst zostaje; Shift+Enter → brak wysyłki; `isComposing` → brak wysyłki (`fireEvent.keyDown` z `isComposing: true`; user-event nie symuluje IME); licznik od 9000 znaków (`user.paste`, nie `user.type`) | `ParticipantPicker` (Radix Select) zastąpić przez `vi.mock("./ParticipantPicker")` natywnym `<select>` — testujemy Composer, nie Select                  |
| `MessageList`       | brak wiadomości i brak `pending` → `emptyState`; wiadomości z jednego dnia → jeden separator; zmiana dnia → separator przed pierwszą wiadomością nowego dnia; `pending` → wiersz oczekiwania z aliasem uczestnika; `pending` bez wiadomości → bez `emptyState`                                                                                                                                                                                                                                                                                     | `useAutoScroll` używa `scrollTo` — stub na prototypie elementu; daty w środku dnia, żeby TZ nie zmienił separatorów                                      |
| `MessageItem`       | `user` → „User”; uczestnik → „AI - alias” w jego kolorze; `assistant` z `ai_participant: null` → „(Deleted Participant)” w `#808080` (PRD §3.4)                                                                                                                                                                                                                                                                                                                                                                                                    | bez Radix, tani                                                                                                                                          |
| `ChatView`          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | poza P3: w stanie `ready` renderuje `Composer` → `ParticipantPicker` (Radix Select) i `ErrorDialog` (Radix); `not-found` i `document.title` sprawdzi E2E |

**P4 — testy po ekstrakcji (etap refaktoryzacji; A6, A15). W etapie testów jednostkowych nie ruszamy kodu produkcyjnego.**

| Kod                                                                                                                                                                   | Dziś                                                     | Po ekstrakcji: testy                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatZodErrors` ×7, `jsonError` ×11 (10 endpointów + middleware), `noApiKeyError` ×3                                                                                | prywatne kopie                                           | `src/lib/http/*`: pierwsza wiadomość per pole; nagłówek `Content-Type`; 412 „No API key”. Uwaga: `Cache-Control: no-store` ma dziś tylko middleware, `conversations/[id].ts` i `auth/*` — dodanie go wszędzie to zmiana zachowania 7 endpointów (A3), nie czysty refaktor |
| mapowanie błędów OpenRouter → HTTP ×3 (`openrouter-models.ts`, `conversations.ts`, `messages.ts`; `user-settings.ts` ma własny kontrakt walidacji klucza 408/400/500) | kopie z rozjazdami (A7–A9: Timeout 502 vs 504, etykiety) | jedna funkcja: Timeout → 504, Network/InvalidResponse → 502, HttpError ≥ 500 → 502, < 500 → 500 „OpenRouter API error”                                                                                                                                                    |
| auto-tytuł w `POST /api/conversations`                                                                                                                                | inline                                                   | `> 50` → 50 znaków + `...`; `≤ 50` → bez wielokropka (B8); trim robi Zod na `user_message`, pusty jawny `title` → auto                                                                                                                                                    |
| **budowa kontekstu w `POST …/messages`**                                                                                                                              | inline                                                   | **wartość produktu**: kontekst = cała historia w kolejności + nowa wiadomość, bez obcinania; role `user`/`assistant`; wiadomości uczestników usuniętych nadal w kontekście                                                                                                |
| `looksLikeUniqueViolation`                                                                                                                                            | prywatny w endpoincie `pages/api/ai-participants.ts`     | kod `23505` string/number, „duplicate key”, „unique constraint”, inne → false                                                                                                                                                                                             |
| middleware: `isStaticAsset`, `isApiRequest`, `isAnonymousSessionError`, `PUBLIC_PATHS`                                                                                | prywatne                                                 | `/_astro/*`, `/assets/*`, `/favicon.(ico\|png)`; `/api/*`; status `undefined`/`< 400`/`4xx`/`5xx`; lista publicznych bez `/api/auth/logout`                                                                                                                               |
| `conversations.service`: `extractErrorCode`, `normalizeAiParticipant`, `getEmbeddedMessageCount`                                                                      | prywatne                                                 | kształty embedded count (A14): tablica pusta / bez `count` / poprawna; `ai_participant` null / obiekt / tablica                                                                                                                                                           |
| `conversations.service`: kompensacje (P2b)                                                                                                                            | wymaga fałszywego buildera Supabase                      | błąd insertu AI → delete wiadomości użytkownika, `cleanupFailed`; błąd w `createConversationWithInitialExchange` → delete konwersacji; fallback 2 zapytań przy błędzie embedded count                                                                                     |
| `useParticipants.sortByAlias`                                                                                                                                         | prywatny                                                 | porządek bez rozróżniania wielkości liter i akcentów                                                                                                                                                                                                                      |

### 4.3. Czego nie testujemy unitami i dlaczego

- **Endpointy `src/pages/api/**`** — kontrakty (statusy, etykiety, walidacja Zod, 412, 404 anti-enumeration) sprawdza
  smoke na realnym stosie; unit wymagałby mockowania Supabase i OpenRoutera, czyli drugiej, gorszej implementacji smoke.
- **Serwisy Supabase** (`ai-participants`, `conversations`, `user-settings`) — zapytania, RLS, triggery, CASCADE /
  SET NULL są w bazie; smoke sprawdza je z prawdziwym PostgREST. Wyjątek zaplanowany: kompensacje (P2b).
- **Middleware** — dwie ścieżki sesji (Bearer, cookie) i przekierowania sprawdza blok AUTH smoke (15 przypadków)
  i E2E; predykaty czyste po ekstrakcji (A15).
- **Formularze auth (`LoginForm`, `RegisterForm`, `LogoutButton`), `ApiKeyForm`, `ParticipantList`,
  `ConversationListItem`, `ModelCombobox`** — mają gałęzie (np. `LogoutButton`: status 0 / inny błąd / sukces;
  `RegisterForm`: „Passwords do not match”, `confirmation_required`; `ApiKeyForm`: 400-string / 408 → dialog), ale to
  głównie przekazanie błędów z `api-client` (przetestowanego) do pól oraz dialogi Radix; taniej i wierniej w E2E,
  gdzie i tak przechodzi cały przepływ. Kandydaci na później, jeśli E2E okaże się za drogie: `AddParticipantForm`
  (własna walidacja, 409 → pole alias; bez Radix — Popover jest w dziecku `ModelCombobox`), `RegisterForm`
  (zgodność haseł nie ma odpowiednika serwerowego).
- **Strony `.astro`** (bramki, `redirect`) — E2E.
- **Serwis OpenRouter ponad obecne 10 testów** — helpery prywatne (`mapStatusToLabel`, `parseErrorResponse`,
  `buildHeaders`) wracają przy ekstrakcji; luki do domknięcia przy okazji: `OpenRouterInvalidApiKeyError` dla pustego
  klucza, timeout dla `getModels`/`sendChatCompletion`.
- **`cn`, `EmptyState`, `DateSeparator`, `ChatHeader`, `PendingReply`** — prezentacja bez gałęzi.

### 4.4. Scenariusze integracyjne (smoke, stan 2026-09-12: 110 PASS / 0 FAIL / 5 SKIP)

Bloki `sketch/smoke-baseline.sh` i to, co chronią (szczegóły przypadków: `sketch/curl_-_smoke_testy_API.md`; liczby =
przypadki PASS/FAIL/SKIP per prefiks ID, bez `note`):

| Blok                                      | Funkcjonalność (PRD / ap5)                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixtures                                  | konta `smoke-a/b/c`, czyszczenie z poprzedniego przebiegu (baza lokalna, jednorazowa)                                                                                                                                                                             |
| AUTH (15)                                 | login cookie → 200 na API; złe hasło → 401; duplikat rejestracji → 409; logout → 401; strona bez sesji → 302 `/login`; Bearer i cookie równolegle (E3)                                                                                                            |
| US (5), PUT (8)                           | `GET/PUT /api/user-settings`: GET z pustym kluczem → 200 (`key=`), bez rekordu → 404 (SKIP); PUT: walidacja klucza w OpenRouterze (400 nieprawidłowy; 408 timeout = SKIP, niezweryfikowane), zapis                                                                |
| MOD (6)                                   | `GET /api/openrouter-models`: 412 bez klucza; 200 z listą; klucz nieprawidłowy → 200 (endpoint publiczny w OpenRouterze, B19)                                                                                                                                     |
| GAIP (4), PAIP (8), DAIP (7), SETNULL (1) | uczestnicy: lista (sortowanie po aliasie nieasertowane — luka); walidacja aliasu/koloru/modelu; 409 duplikat aliasu; 404 cudzy; `ON DELETE SET NULL` (uczestnik z wiadomością → `ai_participant_id: null`)                                                        |
| CONV (17)                                 | `POST /api/conversations`: 412 bez klucza; 0 uczestników → 400; auto-tytuł (B8); realna wymiana z OpenRouterem; klucz nieprawidłowy w DB → 500 (OpenRouter wołany przed insertem, więc sierota nie powstaje — kompensacja serwisu dotyczy tylko awarii bazy, P2b) |
| GCONV (5), GCID (8), PCID (9)             | lista z `message_count` (embedded count, A14); szczegóły z pełną historią; cross-user 404 (RLS); rename z walidacją, `updated_at` niezmienione po rename                                                                                                          |
| MSG (16)                                  | `POST …/messages`: realna odpowiedź; uczestnik cudzy → 404; walidacja treści (1–10 000); `message_count` po wymianie (`note`)                                                                                                                                     |
| DCID (6)                                  | delete: 404 cudzy; CASCADE wiadomości (`note`); GET po usunięciu → 404                                                                                                                                                                                            |

Luki smoke (kandydaci na rozszerzenie skryptu, nie na unity): wysłanie do uczestnika usuniętego → 404; podbicie
`updated_at` po wymianie (asercja, dziś `note`); sortowanie listy uczestników; `Cache-Control` jest raportowany
(kolumna `cc`), nigdy asertowany — 7 endpointów odpowiada błędami bez `no-store` (A3).

Czego smoke nie sprawdza (świadomie): treść żądania do OpenRoutera (pełny kontekst) — patrz P4; błąd bazy w połowie
przepływu — P2b; zachowanie przeglądarki (cookies w UI, przekierowania z `api-client`) — E2E.

### 4.5. Scenariusze E2E (Playwright — wdrożone 2026-09-12)

Page Objecty per strona (`e2e/page-objects/`), konto E2E z projektu `setup` (rejestracja albo logowanie przez
`/api/auth/*`, klucz OpenRoutera z `E2E_OPENROUTER_KEY`, uczestnicy „E2E Alpha”/„E2E Beta”, sesja w `storageState`),
teardown pod RLS. Scenariusze z modelem (`requireOpenRouterKey`) pomijane bez klucza.

| Plik                             | Scenariusze                                                                                                                                                                                                                                                           | Klucz                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `auth.spec.ts` (S1)              | gość na `/` → `/login`; złe hasło → błąd inline, zostaje na `/login`; poprawne logowanie → aplikacja (lista albo onboarding) i `/login` niedostępne; wylogowanie kończy sesję (**konto jednorazowe** — `signOut` Supabase unieważnia wszystkie sesje konta)           | nie                  |
| `onboarding.spec.ts` (S2)        | świeże konto z timestampem: rejestracja → `/onboarding` krok 1 → klucz → krok 2 → dwóch uczestników przez combobox (licznik 1 → 2, `Continue` aktywny od 2) → `/` z pustym stanem → `/onboarding` przekierowuje na `/`                                                | tak                  |
| `conversation.spec.ts` (S3)      | `New conversation` → szkic → uczestnik Alpha + Enter → `pending-reply` → 2 wiadomości (user, „AI - E2E Alpha”) → URL `/conversations/:id` bez przeładowania, tytuł = auto-tytuł, pole puste → druga wiadomość do Bety → 4 wiadomości → lista z tytułem i licznikiem 4 | tak (2 wywołania)    |
| `conversation-list.spec.ts` (S4) | konwersacja z API w `beforeEach`; Enter zapisuje tytuł (trwa po reload); Escape anuluje; pusty tytuł → „Title cannot be empty”; delete z `ConfirmDialog` → wiersz znika (trwa po reload); `/conversations/<uuid>` nieistniejący → karta „not found” (bez klucza)      | tak (poza not-found) |

Poza etapem E2E (kandydaci S5+): 412 (klucz nie do usunięcia z UI), usunięty uczestnik w czacie, błędy sieci/timeoutu
OpenRoutera, `settings-notice`. Pułapki poznane przy wdrożeniu: hydracja wysp Astro (każda akcja POM czeka, aż
zniknie `astro-island[ssr]`), `signOut` kończący sesję ze `storageState`, edytor tytułu podmieniający przycisk na pole (lokatory na liście,
nie na elemencie filtrowanym po tytule).

## 5. Środowisko testowe

- **Jednostkowe:** Node 24 (`.nvmrc`), Vitest 4.1 przez `vitest.config.ts` (`getViteConfig` z `astro/config`: alias
  `@/`, integracja React, Tailwind; `test.env.TZ = "UTC"` — zweryfikowane, `formatTime` asertuje dokładne godziny),
  środowisko domyślne `node`, `// @vitest-environment jsdom` w plikach DOM, setup `src/test/setup.ts` (matchery jest-dom,
  `cleanup` po każdym teście), `src/test/fixtures.ts` (budowniczowie DTO, `ok`/`failure`, `deferred`).
  Bez `.env`: `db/supabase.client.ts` tworzy klienta przy imporcie i rzuca bez URL — nie importować w unitach;
  `auth.service.ts` i `openrouter.service.ts` czytają env przy imporcie, ale używają go dopiero w funkcjach (bezpieczne).
  Lokalny `.env` jest ładowany przez `getViteConfig`, więc raz na etap uruchomić przebieg z przemianowanym `.env`
  (2026-09-12: 128/128 bez `.env`). Bez sieci: `fetch` zawsze stubowany.
- **Smoke:** `npx supabase start` (PG 17, PostgREST 16, Auth z wyłączonym potwierdzaniem e-mail), dev server na
  porcie 3000 z pidfile, env `SUPA_URL`, `ANON`, `OR_KEY` (`sketch/.env.smoke`, ignorowany), realny klucz OpenRouter
  (model `openai/gpt-4o-mini-2024-07-18`, koszt groszowy per przebieg). Wynik do `sketch/baseline-<data>.out`.
- **E2E:** LOKALNY stos Supabase (decyzja E6 — projekt chmurowy odłożony do etapu wdrożenia), `.env.test` z lokalnymi URL/anon
  key + `E2E_USERNAME`/`E2E_PASSWORD`/`E2E_OPENROUTER_KEY` (`.env.test.example`), `astro dev --mode test` jako
  `webServer` Playwrighta (port 3000, działający dev server jest reużywany), Chromium Playwrighta w `~/.cache/ms-playwright`
  (bez `--with-deps`), `workers: 1`, `storageState` w `playwright/.auth/` (ignorowany), teardown przez supabase-js
  pod RLS z odmową dla nielokalnego URL. Konta jednorazowe (onboarding, logout) zostają w lokalnym `auth.users`.
- **CI (`.github/workflows/pull-request.yml`):** na każdym PR do `master` i ręcznie; `ubuntu-latest`, Node
  z `.nvmrc` przez composite action `node-setup` (`npm ci` z cache); joby: `lint` (eslint + `astro check`) → `unit`
  (`test:coverage`, artefakt `coverage/`) ∥ `build` ∥ `e2e` (własny stos Supabase w runnerze: `npx supabase start -x`
  bez studio/storage/realtime/logflare/…, `.env.test` z `supabase status -o env`, Chromium `--with-deps`, artefakt
  `playwright-report/`; jedyny sekret `E2E_OPENROUTER_KEY`) → `status-comment` (`github-script`, `pull-requests: write`
  tylko na tym jobie). `concurrency` anuluje poprzedni przebieg PR-a. Smoke poza CI (klucz + realny OpenRouter
  z pełnym kosztem; ap8 §3). Model pracy (E7): gałąź + PR per faza, merge po zielonym lokalnym fast-forwardem.

## 6. Narzędzia

| Narzędzie                                  | Wersja (2026-09-12)                     | Rola                                                   |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------ |
| Vitest                                     | 4.1.11 (5.0 odłożone, D4b)              | runner, `vi`, fake timers, coverage v8                 |
| `@vitest/coverage-v8`                      | 4.1.11 (= Vitest)                       | `npm run test:coverage`: raport na żądanie, bez progów |
| jsdom                                      | 29.x (30 wymaga Node ≥ 24.15)           | DOM dla hooków i komponentów                           |
| `@testing-library/react` + `dom`           | 16.3.x / 10.x                           | `render`, `renderHook`, zapytania po roli              |
| `@testing-library/jest-dom`                | 7.x (`/vitest`)                         | matchery DOM                                           |
| `@testing-library/user-event`              | 14.6.x                                  | interakcje użytkownika                                 |
| curl + bash                                | —                                       | smoke                                                  |
| `@playwright/test`                         | 1.63 (Chromium 153 z cache Playwrighta) | E2E; `@types/node` 24 dla configu i helperów           |
| gitleaks, ESLint 9, Prettier, TypeScript 5 | jak w repo                              | statyczne                                              |

Nieużywane świadomie: `@vitest/ui`, MSW, happy-dom, snapshoty, Jest, Cypress, Postman, Lighthouse (patrz §2.2).

## 7. Harmonogram

Wyznaczają go etapy: testy jednostkowe — środowisko + P1 + P2 (2–3 hooki) + P3 (2–3 komponenty) (zrobione); E2E — S1–S4
na lokalnym stosie (zrobione);
refaktoryzacja — ekstrakcje z P4 i ich testy, ewentualnie P2b; CI na PR-ach (zrobione); wdrożenie — `master.yml` i deploy.
Od etapu testów jednostkowych każda nowa funkcjonalność dostaje testy w tym samym commicie, gdy ma szew czysty.

## 8. Kryteria akceptacji

- **Commit:** `npm test` (= `vitest run`) zielone, `npm run lint` czysty; przy zmianie endpointu, serwisu Supabase
  lub migracji dodatkowo pełny smoke bez regresji względem ostatniego `baseline-*.out`.
- **Etap:** DoD etapu.
- **Wdrożenie:** `npm run test:e2e` zielone z kluczem; `npm audit` przejrzany i zaakceptowany (D4b).
- **Wartość testu:** nazywa zachowanie z PRD/ap5/ap7 albo gałąź błędu; czerwony wynik wskazuje konkretną regresję;
  nie zależy od czasu, strefy czasowej, losowości ani sieci bez jawnej kontroli; nie sprawdza klas CSS ani struktury DOM
  poza rolami i `data-testid`.

## 9. Role

Maintainer: decyduje o zakresie i priorytetach, przegląda testy, uruchamia smoke (klucz OpenRouter po jego stronie).
Claude Code: pisze testy wg tego planu i `.claude/rules/testing.md`, uruchamia `npm test`/`npm run lint` przed
każdym commitem, raportuje paczkami. CI: strażnik bramek PR.

## 10. Raportowanie błędów

Defekt znaleziony przez test lub smoke trafia do `sketch/triage-inwentarz.md` (grupa A dla kodu,
B dla rozjazdów spec) z decyzją i hashem naprawy; test, który go wykrył, zostaje jako regresyjny. Po publikacji repo:
GitHub Issues z krokami, wynikiem oczekiwanym i faktycznym oraz środowiskiem. Czerwony test blokuje commit —
naprawa albo świadoma zmiana testu z uzasadnieniem w commicie.

## 11. Utrzymanie planu

Aktualizacja przy każdym etapie, który zmienia poziomy testów (E2E: §4.5 i §5; refaktoryzacja: P4 → wykonane; CI: §5).
Liczby z §3 i §4.4 odświeżać po każdym pełnym smoke.
