# Architektura UI dla MindAgora (ap7)

Stan: 2026-09-12. Źródło prawdy razem z kodem (`src/pages/*.astro`, `src/components/**`,
`src/lib/api-client.ts`) oraz PRD (ap2 §3.2–3.8, US-004…US-036), planem API (ap5) i regułą `.claude/rules/frontend.md`.
Plany implementacji poszczególnych widoków: `specs_ai/impl-plans-UI/`. Dokument opisuje strukturę, przepływy
i kontrakty między widokami a API, nie implementację.

## 0. Decyzje sesji planistycznej (2026-09-12)

1. Sesja UI-1 zastąpiona jedną rundą pytań o luki w PRD; PRD i `frontend.md` przesądzały resztę.
2. Mapa tras: `/login`, `/register`, `/onboarding` (jedna strona, krok wyliczany server-side), `/` (lista),
   `/conversations/new`, `/conversations/:id`, `/settings`.
3. Bramkowanie onboardingu na `/` i `/conversations/*` (przekierowanie do `/onboarding` przy niekompletnym setupie);
   `/settings` zawsze dostępne za sesją.
4. Ładowanie danych: strony Astro bramkują przez serwisy (server-side, bez HTTP), wyspy React ładują i mutują dane
   przez `/api/*` (cookie same-origin) ze skeletonem na starcie.
5. Szkic konwersacji pod `/conversations/new`; po pierwszej udanej wymianie `history.replaceState` na
   `/conversations/:id` bez przeładowania.
6. Wybór modelu przez Combobox z wyszukiwaniem (`command` + `popover`); lista ładowana leniwie przy pierwszym otwarciu.
7. **Kompozytor: Enter wysyła, Shift+Enter wstawia nową linię** (decyzja użytkownika 2026-09-12, wpis w PRD §3.6
   i §4.1); przycisk Send zostaje; osłona `isComposing` dla IME; podpowiedź pod polem.
8. Usuwanie uczestnika z dialogiem potwierdzenia, tak samo jak konwersacji (wpis w PRD US-011).
9. `data-testid` na kluczowych elementach od razu (pod E2E).
10. Kolejność implementacji: ustawienia → onboarding → lista → czat.
11. Responsywność: desktop-first; przy ~400 px jedna kolumna, bez rozjazdu; bez nawigacji mobilnej.
12. Bez View Transitions (`ClientRouter`) w MVP.
13. Komponenty shadcn do dodania: `textarea`, `select`, `command`, `popover`, `dialog`, `alert-dialog`, `badge`,
    `skeleton`, `tooltip`, `scroll-area`, `separator`. Bez toastów.
14. Plany widoków pisane tuż przed implementacją każdego widoku.
15. Wysyłka bez optymistycznej „bańki" użytkownika: w trakcie oczekiwania tekst zostaje w zablokowanym polu,
    a w miejscu odpowiedzi pojawia się spinner z aliasem adresata; po sukcesie dochodzą obie wiadomości z API.

## 1. Przegląd struktury UI

- **Strony Astro (SSR)** = routing, sesja (middleware), bramkowanie onboardingu, powłoka (`Layout.astro`).
  Nie pobierają danych do renderu poza tym, co jest potrzebne do przekierowania.
- **Wyspy React (`client:load`)** = właściwe widoki: pobieranie danych z `/api/*`, mutacje, stan lokalny.
  Jedna wyspa na widok (`SettingsView`, `OnboardingView`, `ConversationListView`, `ChatView`) plus komponenty dzieci.
- **Jeden klient HTTP** `src/lib/api-client.ts`: `fetch` JSON same-origin, typy z `types.ts`, wspólne rozgałęzienie
  po statusie: `401` → `window.location.assign("/login")`; `412` → `window.location.assign("/settings?notice=api-key")`;
  pozostałe statusy wracają do widoku jako `ApiFailure { status, error, details }`. Helpery auth z etapu auth (`auth-api.ts`)
  przechodzą do tego modułu.
- **Stan**: `useState`/`useReducer` w wyspie + hook per widok (`useConversations`, `useConversation`,
  `useParticipants`, `useModels`) w `src/components/hooks/`. Bez globalnego store'a; nic nie jest współdzielone
  między stronami poza tym, co niesie URL.
- **Stylowanie**: Tailwind 4 (tokeny w `global.css`), shadcn new-york/neutral, dark mode jako jedyny (`<html class="dark">`).
- **Formatowanie**: `src/lib/format.ts` przez `Intl` (czas absolutny „10:45 AM", separator dnia „Dec 15",
  czas względny „2h ago" statyczny), `src/lib/color.ts` (losowy `#RRGGBB`). Bez bibliotek dat.
- **Błędy**: macierz w §6. Dialog (`AlertDialog`) dla błędów OpenRoutera w czacie i błędów walidacji klucza;
  reszta inline przy polu lub sekcji. Bez toastów.
- **Dostępność**: etykiety dla każdego pola, `aria-describedby` dla błędów i podpowiedzi, `role="alert"` na
  komunikatach, `aria-live="polite"` na wskaźniku oczekiwania, kolor uczestnika nigdy jako jedyny nośnik informacji
  (prefiks tekstowy zawsze), fokus w dialogach zarządzany przez Radix.
- **Testowalność**: `data-testid` w kebab-case na elementach interakcji i kontenerach list (lista w §5.4).

## 2. Lista widoków

### 2.1. Logowanie — `/login` (zrobione w etapie auth)

Publiczny; zalogowany → `/`. `LoginForm`. Szczegóły: ap6.

### 2.2. Rejestracja — `/register` (zrobione w etapie auth)

Publiczny; zalogowany → `/`. `RegisterForm`. Szczegóły: ap6.

### 2.3. Onboarding — `/onboarding`

- **Cel:** doprowadzić nowe konto do stanu „klucz + ≥ 2 uczestników" (US-004, US-005, US-006).
- **Bramkowanie (server-side):** brak klucza → krok `api-key`; klucz i < 2 uczestników → krok `participants`;
  setup kompletny → `302 /`.
- **Informacje:** wskaźnik kroków (1 z 2 / 2 z 2), opis kroku, formularz kroku, przycisk „Continue".
- **Komponenty:** `OnboardingView` (prop `step`), w kroku 1 `ApiKeyForm` (tryb onboarding: bez podglądu
  aktualnego klucza, po sukcesie `window.location.assign("/onboarding")` → serwer wylicza krok 2), w kroku 2
  `ParticipantsPanel` (ten sam co w ustawieniach) + „Continue" aktywny, gdy lista ma ≥ 2 pozycje →
  `window.location.assign("/")`.
- **UX/a11y/security:** wznowienie po przerwaniu wynika z bramkowania (US-006), nie z zapisu postępu; próba
  ominięcia kroku 2 (< 2 uczestników) pokazuje komunikat pod przyciskiem (US-005).

### 2.4. Lista konwersacji — `/`

- **Cel:** wybór konwersacji do kontynuacji lub start nowej (US-014…US-019).
- **Bramkowanie:** niekompletny setup → `302 /onboarding`.
- **Informacje:** pozycje posortowane po `updated_at` malejąco (kolejność z API): tytuł, czas względny
  (statyczny), badge z `message_count`; empty state „No conversations yet".
- **Komponenty:** `ConversationListView` → `NewConversationButton` (link `/conversations/new`),
  `ConversationList` → `ConversationListItem` (tytuł jako przycisk edycji inline: klik → `input`, Enter = `PUT`,
  Escape/blur = anuluj, walidacja pusty/whitespace i `maxLength=100`; link „Open" / cały wiersz → `/conversations/:id`;
  ikona kosza → `ConfirmDialog` „Delete conversation '[title]'?" → `DELETE`), `EmptyState`, `Skeleton` na starcie.
- **UX/a11y/security:** przycisk usuwania z `aria-label` zawierającym tytuł; edycja inline nie przechwytuje
  kliknięcia w wiersz (osobny element tytułu); po `DELETE` pozycja znika lokalnie bez refetchu; błąd `PUT`/`DELETE`
  inline w wierszu.

### 2.5. Nowa konwersacja — `/conversations/new`

- **Cel:** pusty czat, konwersacja powstaje po pierwszej udanej wymianie (US-015, US-020).
- **Bramkowanie:** jak `/`.
- **Komponenty:** `ChatView` z `conversationId={null}`; pobiera tylko `GET /api/ai-participants`. Pierwsza wysyłka →
  `POST /api/conversations` (`title` pominięty → auto) → stan z `CreateConversationResponseDTO`
  (`ConversationDetailsDTO`), `history.replaceState(null, "", "/conversations/<id>")`, nagłówek widoku pokazuje tytuł.
- **UX:** empty state w obszarze wiadomości „Send a message to one of your AI participants to start".

### 2.6. Konwersacja — `/conversations/:id`

- **Cel:** pełna historia i kontynuacja z wymuszonym wyborem adresata (US-016, US-020…US-030).
- **Bramkowanie:** jak `/`; `:id` niebędące UUID → `404` strony (walidacja w frontmatterze); nieistniejąca/cudza
  konwersacja → API `404` → karta „Conversation not found" z linkiem do listy (anti-enumeration zachowane).
- **Informacje:** tytuł, „← List", lista wiadomości (stack, wszystkie naraz), separatory dni, timestampy absolutne,
  prefiksy „User" / „AI - [alias]" / „(Deleted Participant)", kolory uczestników jako `border-left` i kolor prefiksu.
- **Komponenty:** `ChatView` → `ChatHeader` („← List", tytuł), `MessageList` → `DateSeparator`, `MessageItem`,
  `PendingReply` (spinner + „AI - [alias] is thinking…", `aria-live`), `Composer` → `Textarea` (limit 10 000,
  `max-h`, licznik od 9000 „9000/10000"), `ParticipantPicker` (`Select` sortowany po aliasie, bez pamięci wyboru,
  `disabled` + `Tooltip` „Add at least 2 AI participants in Settings" gdy < 2), przycisk Send, podpowiedź
  „Enter to send, Shift+Enter for a new line", `ErrorDialog`.
- **Interakcje:** Enter (bez Shift, bez IME) = wysyłka tożsama z przyciskiem przez wspólny predykat `canSend`
  (tekst niepusty po trim, uczestnik wybrany, brak trwającej wysyłki, ≥ 2 uczestników); Shift+Enter = nowa linia.
  W trakcie: pole i picker zablokowane, tekst zostaje, `PendingReply` na dole. Sukces: `POST /api/conversations/:id/messages`
  → dopisanie `user_message` i `ai_message`, pole wyczyszczone, picker zresetowany, auto-scroll jeśli użytkownik
  był na dole (próg ~32 px). Błąd: `ErrorDialog` z `details` 1:1 (lub tekst stały), tekst w polu zostaje, wybór
  uczestnika zostaje.
- **UX/a11y/security:** wiadomości renderowane jako tekst (bez Markdownu w MVP, zachowane białe znaki przez
  `whitespace-pre-wrap`); `(Deleted Participant)` w `#808080`; przy wejściu przewinięcie na dół; treść nigdy nie
  jest interpretowana jako HTML.

### 2.7. Ustawienia — `/settings`

- **Cel:** klucz OpenRouter, uczestnicy, e-mail (US-007…US-013, US-032, US-033).
- **Bramkowanie:** tylko sesja; przy `?notice=api-key` baner „Add your OpenRouter API key to continue."
- **Komponenty:** `SettingsView` → sekcja **API key**: `ApiKeyForm` (pole `type=password` z przełącznikiem oka,
  aktualny klucz z `GET /api/user-settings` wstawiony w pole i zamaskowany, Save → `PUT`, blokada w trakcie,
  komunikat sukcesu inline, `400 Invalid API key` / `408 Validation timeout` / `5xx` → `ErrorDialog` z `details`);
  sekcja **AI participants**: `ParticipantsPanel` → `ParticipantList` (kropka koloru, alias, `model_id`, kosz →
  `ConfirmDialog` „Delete participant '[alias]'?" → `DELETE`), `AddParticipantForm` (alias `maxLength=30` z opisem
  reguły, `ModelCombobox` ładujący `GET /api/openrouter-models` przy pierwszym otwarciu ze spinnerem i błędem inline,
  kolor losowany przy zapisie, `POST`; `409` → błąd przy aliasie, `400 Validation error` → błędy per pole);
  sekcja **Account**: e-mail read-only (z `Astro.locals.user` przez props strony).
- **UX/a11y/security:** klucz nigdy w URL ani logach; przełącznik oka z `aria-pressed`; lista modeli w Combobox
  z filtrowaniem po `id` i `name` (kilkaset pozycji); po usunięciu uczestnika informacja, że jego wiadomości zostają
  jako „(Deleted Participant)" (treść dialogu).

## 3. Mapa podróży użytkownika

**Główny przepływ (nowe konto):** `/register` → (local dev: sesja) `/` → bramka → `/onboarding` krok 1 → zapis
klucza (walidacja przez API) → `/onboarding` krok 2 → dwóch uczestników (modele z Combobox) → „Continue" → `/` (empty
state) → „+ New conversation" → `/conversations/new` → wiadomość do uczestnika A → konwersacja zapisana, URL
podmieniony → wiadomość do uczestnika B odwołująca się do odpowiedzi A (pełny kontekst) → „← List" → pozycja z tytułem
auto, czasem „just now", badge 4 → edycja tytułu inline → usunięcie z potwierdzeniem → `/settings` → usunięcie
uczestnika → historia innej konwersacji pokazuje „(Deleted Participant)" → Logout → `/login`.

**Powracający użytkownik:** `/login` → `/` → bramka przepuszcza → lista → wybór konwersacji sprzed tygodnia →
wysyłka z pełnym kontekstem (US-025).

**Przerwany onboarding (US-006):** logowanie → `/` → bramka → `/onboarding` w pierwszym niekompletnym kroku.

**Ścieżki błędów:** wygasła sesja przy dowolnym wywołaniu API → `/login`; brak klucza (usunięty / pusty) przy
`GET /api/openrouter-models`, `POST /api/conversations`, `POST …/messages` → `412` → `/settings?notice=api-key`;
błąd OpenRoutera (500 „OpenRouter API error", 502, 504) → dialog z komunikatem, tekst zachowany; awaria sieci →
dialog „Network error - check your connection."; `404` konwersacji → karta „not found"; `409` alias → błąd przy polu.

## 4. Układ i struktura nawigacji

- **Nagłówek (`Layout.astro`, tryb auth):** logo/„MindAgora" → `/`, linki „Conversations" (`/`), „Settings"
  (`/settings`), „Help" (README, nowa karta), przycisk „Logout" (wyspa z etapu auth). Aktywny link z `aria-current="page"`.
  W trybie non-auth tylko logo.
- **Nawigacja wewnątrz czatu:** „← List" → `/` (pełna nawigacja; lista odzwierciedla `updated_at` i licznik,
  US-019). Tytuł w czacie nieedytowalny (edycja tylko na liście, PRD §3.5).
- **Tabela bramkowania (po middleware, które już odsiało brak sesji):**

| Trasa                                      | brak klucza                             | klucz, < 2 uczestników | setup kompletny |
| ------------------------------------------ | --------------------------------------- | ---------------------- | --------------- |
| `/login`, `/register` (z sesją)            | `302 /`                                 | `302 /`                | `302 /`         |
| `/onboarding`                              | krok `api-key`                          | krok `participants`    | `302 /`         |
| `/`                                        | `302 /onboarding`                       | `302 /onboarding`      | lista           |
| `/conversations/new`, `/conversations/:id` | `302 /onboarding`                       | `302 /onboarding`      | czat            |
| `/settings`                                | render (+ baner przy `?notice=api-key`) | render                 | render          |

- **Źródło stanu bramki:** `getOnboardingStatus({ supabase: locals.supabase, userId })` w serwisie
  (`user_settings.openrouter_api_key IS NOT NULL`, `COUNT(ai_participants)`), czysta funkcja
  `resolveOnboardingStep(status) → "api-key" | "participants" | "complete"`. Strony wołają serwis bezpośrednio
  (bez HTTP do własnego API); middleware pozostaje wyłącznie od sesji.

## 5. Kluczowe komponenty

### 5.1. Współdzielone (`src/components/shared/`, `src/lib/`)

- `api-client.ts`: `apiGet<T>(path)`, `apiSend<T>(method, path, body?)`; zwraca `{ ok: true, data } | { ok: false, failure }`;
  obsługa `401`/`412` przez przekierowanie; `ApiFailure { status, error, details, message }` z `message` gotowym do
  wyświetlenia (string `details` lub złączona mapa). Błąd sieci → `status: 0`, `message: "Network error - check your connection."`.
- `ConfirmDialog`: `AlertDialog` z tytułem, opisem, „Cancel"/„Delete" (wariant destructive), stan `pending`.
- `ErrorDialog`: `AlertDialog` z jednym przyciskiem „OK", tytuł i treść z propsów; używany w czacie i przy kluczu.
- `EmptyState`: ikona/tekst/akcja.
- `format.ts`: `formatTime(iso)` → „10:45 AM"; `formatDay(iso)` → „Dec 15" (z rokiem, gdy inny niż bieżący);
  `formatRelative(iso, now)` → „just now" / „5m ago" / „2h ago" / „3d ago" / `formatDay`; `isSameDay(a, b)`.
- `color.ts`: `randomHexColor()` → `#RRGGBB` (bez zbyt ciemnych, żeby border był widoczny na tle).

### 5.2. Ustawienia i onboarding (`src/components/settings/`)

`ApiKeyForm` (props: `mode: "settings" | "onboarding"`, `onSaved`), `ParticipantsPanel` (props: `onCountChange`),
`ParticipantList`, `AddParticipantForm`, `ModelCombobox` (props: `value`, `onChange`, ładowanie leniwe przez `useModels`).
Hooki: `useApiKey`, `useParticipants`, `useModels`.

### 5.3. Lista i czat (`src/components/conversations/`, `src/components/chat/`)

`ConversationListView`, `ConversationListItem`, `InlineTitleEditor`; `ChatView`, `ChatHeader`, `MessageList`,
`MessageItem`, `DateSeparator`, `PendingReply`, `Composer`, `ParticipantPicker`. Hooki: `useConversations`,
`useConversation` (ładowanie, wysyłka, `replaceState`, stan `pending`), `useAutoScroll`.

### 5.4. Konwencja `data-testid`

`new-conversation-button`, `conversation-item`, `conversation-title`, `title-input`, `delete-conversation`,
`open-conversation`, `back-to-list`, `message-item`, `message-input`, `participant-select`, `send-button`,
`pending-reply`, `api-key-input`, `api-key-toggle`, `api-key-save`, `participant-alias-input`, `model-combobox`,
`model-option`, `participant-add`, `participant-item`, `participant-delete`, `confirm-dialog-confirm`,
`confirm-dialog-cancel`, `error-dialog-ok`, `onboarding-continue`, `settings-notice`, `empty-state`.
Formularze auth (dopisane w etapie E2E, 2026-09-12): `login-email`, `login-password`, `login-submit`, `login-error`,
`register-email`, `register-password`, `register-confirm-password`, `register-submit`, `register-error`, `logout-button`.
Pozostałe z kodu (etap UI): `composer`, `message-list`, `pending-reply`, `date-separator`, `char-counter`, `chat-title`,
`conversation-not-found`, `participant-option`, `participant-count`, `participant-list`, `participant-list-empty`,
`api-key-saved`, `account-email`, `conversation-list`.

## 6. Macierz błędów: status API → zachowanie UI

| Status / sytuacja                                    | Gdzie                                    | Zachowanie                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `401`                                                | wszędzie                                 | `api-client` → `/login`                                                                                              |
| `412 No API key`                                     | modele, tworzenie konwersacji, wiadomość | `api-client` → `/settings?notice=api-key`                                                                            |
| `400 Validation error` (mapa)                        | formularze                               | błędy przy polach                                                                                                    |
| `400 Validation error` (string, np. < 2 uczestników) | czat                                     | `ErrorDialog`                                                                                                        |
| `400 Invalid API key`, `408 Validation timeout`      | klucz                                    | `ErrorDialog` z `details`; klucz niezapisany                                                                         |
| `409 Conflict`                                       | alias                                    | błąd przy polu alias                                                                                                 |
| `404 Not Found`                                      | konwersacja                              | karta „not found" + link do listy; uczestnik (usunięty w międzyczasie) → `ErrorDialog`                               |
| `500 OpenRouter API error`, `502`, `504`             | czat                                     | `ErrorDialog` z `details` 1:1 („OpenRouter request timed out" dla 504)                                               |
| `500` inne                                           | wszędzie                                 | inline „Something went wrong. Please try again." (formularze) / `ErrorDialog` (czat)                                 |
| sieć (`fetch` rzuca)                                 | wszędzie                                 | „Network error - check your connection." (czat: dialog; formularze: inline)                                          |
| odpowiedź niezgodna z kontraktem                     | czat                                     | „Received invalid response from OpenRouter. Please try again." (API zwraca to jako `details` 500 `Invalid response`) |

## 7. Mapowanie historyjek na elementy UI

| US                     | Widok / komponent                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| US-004, US-006, US-031 | `/onboarding` krok 1, `ApiKeyForm`, bramkowanie, `ErrorDialog` (timeout)                      |
| US-005, US-012         | `/onboarding` krok 2, `ParticipantsPanel`, „Continue"; `ParticipantPicker` disabled + tooltip |
| US-007, US-008         | `/settings`, `ApiKeyForm` (maskowanie, oko, walidacja)                                        |
| US-009, US-010, US-013 | `AddParticipantForm`, `ModelCombobox` (spinner, błąd), kolor z `color.ts`                     |
| US-011, US-027         | `ParticipantList` + `ConfirmDialog`; `MessageItem` „(Deleted Participant)"                    |
| US-014, US-016, US-019 | `ConversationListView`, `ConversationListItem`, „← List"                                      |
| US-015                 | `/conversations/new`, `ChatView` (szkic, `replaceState`)                                      |
| US-017, US-018         | `InlineTitleEditor`, `ConfirmDialog`                                                          |
| US-020, US-025, US-026 | `Composer`, `ParticipantPicker` (reset po wysyłce), `useConversation`                         |
| US-021, US-022         | `canSend`, licznik od 9000, `maxLength` 10 000                                                |
| US-023, US-024         | `MessageList`, `DateSeparator`, `formatTime`, `useAutoScroll`                                 |
| US-028, US-029, US-030 | `ErrorDialog`, `api-client` (sieć), tekst zachowany w polu                                    |
| US-032, US-033, US-034 | `/settings`, sekcja Account, nagłówek Layoutu                                                 |
| US-035, US-036         | `<html class="dark">`, teksty EN                                                              |

## 8. Granice i co dalej

Bez Markdownu w wiadomościach, bez streamingu, bez paginacji, bez edycji uczestników i wiadomości, bez multi-tab
(PRD §4). Testy jednostkowe komponentów i hooków → osobny etap; E2E po `data-testid` → osobny etap; nawigacja mobilna, react-hook-form,
motyw (tweakcn / design system) → etap refaktoryzacji lub po MVP; deployment → etap wdrożenia.
