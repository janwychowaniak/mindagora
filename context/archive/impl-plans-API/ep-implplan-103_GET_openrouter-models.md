## API Endpoint Implementation Plan: GET /api/openrouter-models

## 1. Przegląd punktu końcowego

Endpoint jest **proxy** do OpenRouter `GET /api/v1/models` i służy do pobrania listy dostępnych modeli (z pricing) dla UI (np. dropdown przy konfiguracji AI participant).

> Spec (źródło: `.ai/ap5-api-plan-pl.md`):
>
> - "**Opis:** Pobierz listę dostępnych modeli z OpenRouter API (proxy endpoint)"
> - "**Autoryzacja:** Required (używa klucza API użytkownika z user_settings)"
> - "**Parametry zapytania:** Brak"

- **Metoda**: `GET`
- **Ścieżka**: `/api/openrouter-models`
- **Autoryzacja**: wymagana (Supabase Auth; `locals.user` i authed `locals.supabase` ustawiane przez middleware)
- **Źródło danych**:
  - `public.user_settings.openrouter_api_key` (klucz użytkownika do OpenRouter),
  - OpenRouter API: `GET https://openrouter.ai/api/v1/models`
- **Dane wrażliwe**: `openrouter_api_key` (sekret) — nigdy nie logować, nigdy nie zwracać w odpowiedzi

## 2. Szczegóły żądania

- **Metoda HTTP**: `GET`
- **URL**: `/api/openrouter-models`
- **Parametry**:
  - **Wymagane**: brak
  - **Opcjonalne**: brak
- **Request Body**: brak
- **Nagłówki**:
  - **Wymagane**: `Authorization: Bearer <access_token>` (obsługiwane przez middleware; w handlerze dostępne jako `locals.user`)
  - **Opcjonalne**: `Accept: application/json`

### Walidacja wejścia (Zod)

- **Brak walidacji Zod requestu** — endpoint nie ma body ani query params.  
  Zgodnie z zasadą z repo: "**NIE używaj Zod dla: danych z bazy (GET endpoints)**" (`.ai/impl-plans-API/Uwagi implementacyjne do planów EP.md`).
- Walidacja odpowiedzi OpenRouter jest już zapewniona w `getModels()` przez schemy Zod w `src/lib/services/openrouter.service.ts`.

## 3. Wykorzystywane typy

Z `src/types.ts`:

- **DTO**: `OpenRouterModelDTO`
- **DTO**: `OpenRouterModelListDTO`
- **Błąd standardowy**: `ApiErrorResponseDTO`
- **Command modele**: brak (GET nie ma body)

Z `src/lib/services/openrouter.service.ts`:

- `getModels(apiKey: string): Promise<OpenRouterModelListDTO>`
- typed errors: `OpenRouterHttpError`, `OpenRouterTimeoutError`, `OpenRouterNetworkError`, `OpenRouterInvalidResponseError`, `OpenRouterInvalidApiKeyError`

Z `src/lib/services/user-settings.service.ts`:

- `getUserSettings({ supabase, userId }): Promise<{ data: UserSettingsDTO | null; error: { message: string; code?: string } | null }>`

## 4. Szczegóły odpowiedzi

### 4.1. Sukces

- **Status**: `200 OK`
- **Body** (`application/json`):

```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "pricing": {
        "prompt": "string",
        "completion": "string"
      }
    }
  ]
}
```

- **Typ**: `OpenRouterModelListDTO`
- **Nagłówki (zalecane)**:
  - `Content-Type: application/json; charset=utf-8`
  - (opcjonalnie) `Cache-Control: no-store` — bezpieczny default; response nie zawiera secretów, ale jest wynikiem calla autoryzowanego per user

### 4.2. Błędy

Wszystkie odpowiedzi błędów powinny zwracać `ApiErrorResponseDTO`:

```json
{
  "error": "string",
  "details": "string | { [field: string]: string }"
}
```

Zgodnie ze spec (źródło: `.ai/ap5-api-plan-pl.md`):

- `401 Unauthorized` — brak autoryzacji **lub** brak klucza OpenRouter w `user_settings`
  - Dla braku klucza wymagany payload:

```json
{
  "error": "No API key",
  "details": "OpenRouter API key not configured. Please add it in Settings."
}
```

- `500 Internal Server Error` — błąd komunikacji z OpenRouter lub błąd serwera
- `502 Bad Gateway` — OpenRouter API niedostępne

## 5. Przepływ danych

### 5.1. Przepływ wysokopoziomowy

1. **Middleware** autoryzuje request i ustawia:
   - `locals.user` (zalogowany użytkownik),
   - `locals.supabase` (authed Supabase client z JWT; RLS działa automatycznie).
2. **Endpoint** (GET `/api/openrouter-models`) wykonuje guard clause:
   - jeśli `!locals.user` → `401 Unauthorized`.
3. Endpoint pobiera ustawienia użytkownika:
   - wywołuje `getUserSettings({ supabase: locals.supabase, userId: locals.user.id })`.
4. Endpoint odczytuje `openrouter_api_key` z `user_settings`:
   - jeśli klucz jest `null`/pusty → `401` z `{ error: "No API key", details: "OpenRouter API key not configured. Please add it in Settings." }`.
5. Endpoint wywołuje OpenRouter przez service layer:
   - `getModels(openrouterApiKey)` (timeout standardowy serwisu; obecnie `OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000`).
6. Na sukces zwraca `200` z `OpenRouterModelListDTO` (już znormalizowane do `{ data: [...] }`).

### 5.2. Decyzje dot. service layer

- **Logika integracji z OpenRouter**: reużywamy istniejącego `src/lib/services/openrouter.service.ts` (stateless, bez cache, bez przechowywania credentials).
  - Skopiować użycie `typed errors` i styl mapowania błędów z `src/pages/api/user-settings.ts` (tam mapowane są `OpenRouter*Error` → HTTP).
- **Pobranie klucza użytkownika**: reużywamy `getUserSettings()` z `src/lib/services/user-settings.service.ts`.
- **Sygnatury funkcji (positional vs object params)**:
  - Reużywamy istniejących sygnatur bez refaktoru: `getUserSettings({ supabase, userId })` (object params, jak w obecnym serwisie) oraz `getModels(apiKey)` (positional, jak w OpenRouter service).
  - Rationale: spójność z istniejącym kodem i brak nowej metody, którą realnie reużywamy w >1 miejscu w MVP.

## 6. Względy bezpieczeństwa

- **Autoryzacja**:
  - Endpoint jest chroniony przez middleware (kontrakt w repo: `locals.user` dostępny per-request).
  - Dodatkowy guard `if (!locals.user)` w handlerze jako defense-in-depth (wzorzec z `src/pages/api/user-settings.ts`).
- **RLS i izolacja danych**:
  - Zapytania DB wykonywać przez `locals.supabase` (authed client).
  - W samym query dodatkowo zawężać `.eq("user_id", locals.user.id)` (defense-in-depth).
- **Obsługa sekretów**:
  - `openrouter_api_key` traktować jako sekret (jak hasło).
  - Nigdy nie logować `openrouter_api_key`, nagłówka `Authorization`, ani całych payloadów requestów do OpenRouter.
- **Content-Type**:
  - Nie dotyczy (GET bez body). Walidację `Content-Type` stosować tylko w POST/PUT (patrz wzorzec w `src/pages/api/user-settings.ts`).

## 7. Obsługa błędów

### 7.1. Mapowanie błędów (źródła i statusy)

- **Brak autoryzacji**:
  - `!locals.user` → `401 Unauthorized`
  - Body: `ApiErrorResponseDTO` (wzorzec do skopiowania z `src/pages/api/user-settings.ts`)
  - Logging: brak (to expected flow), ewentualnie minimalny log na poziomie middleware (jeśli już istnieje).

- **Brak klucza OpenRouter w ustawieniach** (wymaganie spec):
  - `userSettings.openrouter_api_key == null` lub `trim().length === 0` → `401` z:
    - `error`: `"No API key"`
    - `details`: `"OpenRouter API key not configured. Please add it in Settings."`
  - Logging: brak (expected misconfiguration), lub ewentualnie regular bez sekretów.

- **Błędy DB / Supabase**:
  - Jeśli `getUserSettings()` zwróci `error` → `500 Internal Server Error`
    - Logging: **regular**
    - Log fields (bez sekretów): `route`, `method`, `status`, `supabase_error_code`
  - Jeśli `data === null` (brak rekordu `user_settings`) → **invariant violation** (w dokumentacji: trigger powinien gwarantować rekord)
    - Status: `500 Internal Server Error` (spec nie przewiduje 404 dla tego endpointa)
    - Logging: **CRITICAL** (np. `console.error` + wyraźny marker/field `severity: "CRITICAL"`)

- **Błędy OpenRouter** (mapowane na 500/502 wg spec):
  - `OpenRouterTimeoutError` → `502 Bad Gateway` (upstream timeout)
    - Logging: **regular**, np. `openrouter_error: "OpenRouterTimeoutError"`
  - `OpenRouterNetworkError` → `502 Bad Gateway` (upstream unreachable)
    - Logging: **regular**
  - `OpenRouterInvalidResponseError` → `502 Bad Gateway` (upstream zwrócił niezgodny payload)
    - Logging: **regular**
  - `OpenRouterHttpError`:
    - jeśli `status >= 500` lub `status` w `{502,503}` → `502 Bad Gateway`
    - w pozostałych przypadkach (401/402/429/400) → `500 Internal Server Error` (spec nie definiuje osobnych 4xx dla problemów upstream)
    - Body: `ApiErrorResponseDTO` z bezpiecznym komunikatem (bez sekretów); opcjonalnie można przepuścić `error.apiError.details` 1:1, bo to publiczny komunikat OpenRouter (nie zawiera klucza), ale należy uważać, by nie zdradzić nadmiarowych informacji.
    - Logging: **regular**, logować `openrouter_status` i `openrouter_error` (bez request payloadów).
  - `OpenRouterInvalidApiKeyError`:
    - Nie powinien wystąpić jeśli wcześniej sprawdzamy klucz w `user_settings`, ale obsłużyć defensywnie:
      - mapować jak brak klucza → `401` `"No API key"` (jeśli pusty) albo `500` (jeśli niepusty, ale nie przeszedł walidacji input schema).

### 7.2. Wzorce do skopiowania (konkretne referencje)

- Skopiować helper `jsonError()` z `src/pages/api/user-settings.ts` (spójny format `ApiErrorResponseDTO` i `Content-Type`).
- Skopiować styl logowania z `src/pages/api/user-settings.ts`:
  - log obiektowy, bez sekretów,
  - pola: `route`, `method`, `status`, `supabase_error_code` / `openrouter_error`.

### 7.3. Rejestrowanie błędów w tabeli (jeśli dotyczy)

- W dostarczonych zasobach DB/spec nie ma zdefiniowanej tabeli do trwałego logowania błędów requestów dla tego endpointa, więc w MVP logujemy przez `console.error` (jak w `src/pages/api/user-settings.ts`), z **CRITICAL** tylko dla naruszeń invariantów (np. brak rekordu `user_settings`).

## 8. Wydajność

WYMAGANE:

- **Database query complexity**: O(1) — lookup po `user_settings.user_id` (UNIQUE → indeks automatyczny); query typu `eq("user_id", userId)`.
- **Number of DB roundtrips**: 1 (po `user_settings`).
- **External API latency**: 1 call do OpenRouter `GET /models` z timeoutem serwisu; w kodzie: `OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000` (`src/lib/services/openrouter.service.ts`).
- **Worst-case total latency calculation**:
  - \(T_{worst} \approx T_{db} + T_{openrouterTimeout} + T_{serialize}\)
  - Przy założeniu \(T_{db} \approx 10\text{–}50ms\), \(T_{openrouterTimeout} = 30\,000ms\), \(T_{serialize} < 5ms\) → ok. **30.02–30.06s**.
- **Index usage**:
  - wykorzystywany indeks wynikający z `UNIQUE(user_id)` na `user_settings` (dla filtra `eq("user_id", ...)`).

Uwagi:

- MVP: brak cache w serwisie OpenRouter (kontrakt: "Stateless: brak cache" w `.ai/impl-plans-SL/service-implplan-OPENROUTER.md`).  
  Jeśli później pojawi się potrzeba optymalizacji, można rozważyć krótkie cache (TTL) _bez_ cache’owania kluczy i _bez_ zmiany semantyki „używa klucza użytkownika”.

## 9. Kroki implementacji

1. **Utwórz endpoint Astro**
   - Plik: `src/pages/api/openrouter-models.ts`
   - Wymagania frameworkowe:
     - `export const prerender = false`
     - `export const GET = async (context: APIContext) => { ... }` (uppercase)
   - Skopiować `jsonError()` z `src/pages/api/user-settings.ts`.

2. **Zaimplementuj flow handlera (guard clauses + happy path)**
   - Guard: `if (!locals.user)` → `401` (Skopiować wzorzec z `src/pages/api/user-settings.ts`).
   - DB: `getUserSettings({ supabase: locals.supabase, userId: locals.user.id })`
     - Uwaga o `.maybeSingle()`: używane wewnątrz serwisu; w handlerze jawnie obsłużyć:
       - `error` → `500` + log regular
       - `data === null` → `500` + log **CRITICAL** (invariant violation)
   - Guard: `if (!openrouterApiKey || openrouterApiKey.trim().length === 0)` → `401` `"No API key"` (payload jak w spec).
   - Happy path: `const models = await getModels(openrouterApiKey)` → `200` z `OpenRouterModelListDTO`.

3. **Dodaj mapowanie błędów OpenRouter → 500/502**
   - Skopiować podejście do `try/catch` z `PUT` w `src/pages/api/user-settings.ts` (mapowanie po `instanceof OpenRouter*Error`).
   - Zastosować mapping opisany w sekcji 7.1 (szczególnie 502 dla timeout/network/invalid-response).
   - Logging: bez sekretów; pola: `route: "/api/openrouter-models"`, `method: "GET"`, `status`, `openrouter_error`, opcjonalnie `openrouter_status`.

4. **Upewnij się, że typy DTO pasują 1:1 do spec**
   - `src/types.ts` już zawiera:
     - `OpenRouterModelDTO` z polami `id`, `name`, `pricing.prompt`, `pricing.completion`
     - `OpenRouterModelListDTO` jako `{ data: OpenRouterModelDTO[] }`
   - Brak zmian w typach, chyba że spec się rozszerzy.

5. **(Opcjonalnie) Smoke test w dokumentacji**
   - Dodać przykład wywołania do `.sketch/curl_-_smoke_testy_API.md`:
     - `curl -H "Authorization: Bearer <token>" http://localhost:<port>/api/openrouter-models`
   - Dodać scenariusz: brak klucza → 401 `"No API key"`.

### Checklist przed finalizacją

- [ ] Zod schema: **nie dotyczy requestu** (GET bez inputu); response OpenRouter walidowana w `getModels()`
- [ ] DB operations: `getUserSettings()` używa `.maybeSingle()` — w handlerze jest jawna obsługa `data === null` jako invariant violation (CRITICAL)
- [ ] Service function signatures: użyte jawnie `getUserSettings({ supabase, userId })` i `getModels(apiKey)`
- [ ] Wydajność: sekcja 8 zawiera wszystkie elementy WYMAGANE
- [ ] Reused patterns: w krokach jest „Skopiować … z …”
- [ ] Logging: każda ścieżka błędu ma określone severity (regular vs CRITICAL) i nie loguje sekretów
- [ ] Error scenarios: statusy 200/401/500/502 zgodne ze spec
