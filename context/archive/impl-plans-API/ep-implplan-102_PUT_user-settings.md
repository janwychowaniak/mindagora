## API Endpoint Implementation Plan: PUT /api/user-settings

## 1. Przegląd punktu końcowego

Endpoint służy do aktualizacji ustawień **aktualnie zalogowanego użytkownika** w tabeli `public.user_settings` — w MVP głównie pola `openrouter_api_key`.

Kluczowe wymaganie funkcjonalne: **twarda walidacja klucza OpenRouter przed zapisem** (ping do OpenRouter, timeout 10s). Przy błędzie walidacji zapis musi być **zablokowany** (brak modyfikacji w DB).

- **Metoda**: PUT
- **Ścieżka**: `/api/user-settings`
- **Autoryzacja**: wymagana (Supabase Auth; realizowana w `src/middleware/index.ts`)
- **Źródło danych**: `public.user_settings` (relacja 1:1 z `auth.users`, rekord tworzony przez trigger przy rejestracji)
- **Zewnętrzna zależność**: OpenRouter `GET /api/v1/key` (walidacja klucza; timeout 10s)
- **Dane wrażliwe**: `openrouter_api_key` (sekret użytkownika; zwracany tylko właścicielowi)

### Wykorzystywane typy (DTO / Command)

Z `src/types.ts`:

- **Command**: `UpdateUserSettingsCommand` (request body)
- **DTO**: `UpdateUserSettingsResponseDTO` (alias do `UserSettingsDTO`)
- **Wspólny błąd**: `ApiErrorResponseDTO`

Z `src/lib/services/openrouter.service.ts` (do mapowania błędów walidacji):

- `validateApiKey(apiKey: string): Promise<boolean>`
- typed errors: `OpenRouterHttpError`, `OpenRouterTimeoutError`, `OpenRouterNetworkError`, `OpenRouterInvalidResponseError`, `OpenRouterInvalidApiKeyError`

## 2. Szczegóły żądania

- **Metoda HTTP**: `PUT`
- **URL**: `/api/user-settings`
- **Parametry**:
  - **Wymagane**: brak
  - **Opcjonalne**: brak
- **Nagłówki**:
  - **Wymagane**: `Authorization: Bearer <access_token>` (obsługiwane przez middleware)
  - **Wymagane**: `Content-Type: application/json`
  - **Opcjonalne**: `Accept: application/json`

### Request Body (JSON)

```json
{
  "openrouter_api_key": "string"
}
```

### Walidacja wejścia (Zod)

Walidujemy body w handlerze (user input jest nietrustowany):

- `openrouter_api_key`: required, `string`, po normalizacji `trim()` musi mieć długość > 0
- JSON parse error / brak pola / zły typ → `400 Bad Request` (szczegóły w `details`)

## 3. Szczegóły odpowiedzi

### 3.1. Sukces

- **Status**: `200 OK`
- **Body** (`application/json`):

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "openrouter_api_key": "string",
  "created_at": "ISO 8601 datetime"
}
```

- **Nagłówki (zalecane)**:
  - `Content-Type: application/json; charset=utf-8`
  - `Cache-Control: no-store` (bo odpowiedź zawiera secret)

### 3.2. Błędy

Wszystkie odpowiedzi błędów zwracają `ApiErrorResponseDTO`:

```json
{
  "error": "string",
  "details": "string | { [field: string]: string }"
}
```

Wymagane przez specyfikację:

- **`400 Bad Request`** — nieprawidłowe dane wejściowe lub walidacja klucza nieudana
- **`408 Request Timeout`** — timeout walidacji klucza (>10s)
- **`401 Unauthorized`** — brak autoryzacji (realizowane w middleware)
- **`500 Internal Server Error`** — błąd serwera (DB / OpenRouter / nieoczekiwany wyjątek)

Przykłady wymagane przez kontrakt:

**400 (invalid key):**

```json
{
  "error": "Invalid API key",
  "details": "OpenRouter API key validation failed: [message from OpenRouter]"
}
```

**408 (timeout):**

```json
{
  "error": "Validation timeout",
  "details": "OpenRouter API key validation timed out after 10 seconds"
}
```

## 4. Przepływ danych

### 4.1. Przepływ wysokopoziomowy

1. **Middleware** (`src/middleware/index.ts`) wymusza autoryzację dla `/api/user-settings`:
   - odrzuca brak/niepoprawny `Authorization: Bearer ...` (401),
   - weryfikuje token i ustawia:
     - `locals.user`
     - `locals.supabase` jako authed client (JWT użytkownika → RLS działa “z automatu”).
2. Handler `PUT /api/user-settings`:
   - guard: jeśli `locals.user` brak → `401` (defensive; nie powinno się zdarzyć przy poprawnym middleware),
   - parsuje JSON body i waliduje Zod,
   - **waliduje klucz OpenRouter** przez `validateApiKey()` z hard timeout 10s,
   - dopiero po udanej walidacji wykonuje **UPDATE** w `user_settings`,
   - zwraca zaktualizowany rekord jako JSON.

### 4.2. Krytyczne detale: “hard block” zapisu

Aby spełnić “Hard block zapisu przy błędzie walidacji”:

- Wywołanie `validateApiKey()` musi nastąpić **przed** zapisem w DB.
- Przy każdej ścieżce błędu walidacji OpenRouter (invalid / timeout / network / upstream error) endpoint **nie wykonuje UPDATE**.

### 4.3. RLS i authed Supabase client

Tabela `user_settings` ma politykę UPDATE: `using (auth.uid() = user_id)` (migracja `supabase/migrations/20250114120800_enable_rls.sql`).

W praktyce oznacza to:

- zapytania UPDATE muszą być wykonane `locals.supabase` (authed client z JWT usera),
- dodatkowo stosujemy filtr `eq("user_id", locals.user.id)` jako defense-in-depth.

## 5. Względy bezpieczeństwa

- **Ochrona sekretu**:
  - Nie logować `openrouter_api_key` ani nagłówka `Authorization`.
  - Ustawić `Cache-Control: no-store` dla odpowiedzi 200.
- **Izolacja danych**:
  - Nie używać `SUPABASE_SERVICE_ROLE_KEY` do tego endpointu.
  - Polegać na RLS i authed Supabase client z middleware.
- **Walidacja Content-Type (nice-to-have)**:
  - Odrzucić requesty bez `Content-Type: application/json` (lub bez `application/json` w value), zanim nastąpi `request.json()`.
  - Zwrócić `400 Bad Request` z `ApiErrorResponseDTO` (trzymamy się statusów z kontraktu endpointu).
- **Walidacja inputu**:
  - Zod dla body.
  - Normalizacja `trim()` redukuje “fałszywie niepoprawne” klucze (np. wklejone z whitespace).
- **Ryzyko DoS / nadużyć**:
  - Każde wywołanie PUT wykonuje request do OpenRouter (max 10s). W MVP brak rate limit; rekomendacja: dodać throttling/rate limit w kolejnych iteracjach.
- **Idempotencja (nice-to-have)**:
  - `PUT /api/user-settings` jest **idempotentny** względem stanu DB: wielokrotne wywołanie z tym samym `openrouter_api_key` pozostawia rekord w tym samym stanie (różnica jedynie w wykonaniu walidacji OpenRouter per call).

## 6. Obsługa błędów

### 6.1. Scenariusze i mapowanie na statusy

- **Brak autoryzacji** → `401 Unauthorized` (middleware)
- **Niepoprawny JSON / body nie spełnia schemy** → `400 Bad Request`
  - `error`: `"Bad Request"`
  - `details`: obiekt z błędami pól (np. `{ "openrouter_api_key": "Required" }`) lub krótki string przy błędzie parsowania JSON
- **OpenRouter walidacja: timeout** (`OpenRouterTimeoutError`) → `408 Request Timeout`
  - `error`: `"Validation timeout"`
  - `details`: `"OpenRouter API key validation timed out after 10 seconds"`
- **OpenRouter walidacja: invalid key / non-2xx** (`OpenRouterHttpError`, w szczególności 401) → `400 Bad Request`
  - `error`: `"Invalid API key"`
  - `details`: `"OpenRouter API key validation failed: ${openRouterMessage}"`
    - gdzie `openRouterMessage` pochodzi z `OpenRouterHttpError.apiError.details` (pass-through z OpenRouter).
- **OpenRouter walidacja: błąd sieci / nieoczekiwany payload** (`OpenRouterNetworkError` / `OpenRouterInvalidResponseError`) → `500 Internal Server Error`
  - `error`: `"Internal Server Error"`
  - `details`: niesekretny komunikat (bez klucza)
- **Błąd DB / Supabase** → `500 Internal Server Error`
  - `details`: `"Failed to update user settings"` (lub podobne)

> Uwaga: Endpoint powinien utrzymać kontrakt: **nie zwracać 2xx jeśli walidacja OpenRouter nie przeszła**.

### 6.2. Logowanie błędów

Brak tabeli do logowania błędów w MVP — logowanie do stdout:

- `console.error("User settings update failed", { route, method, status, supabase_error_code, openrouter_status })`
- **bez**: `Authorization`, `openrouter_api_key`

## 7. Wydajność

- Koszt dominujący: wywołanie OpenRouter `GET /key` (timeout 10s).
- DB: pojedynczy `UPDATE ... WHERE user_id = ? RETURNING ...` (**single roundtrip**).
- Lookup jest \(O(1)\) dzięki indeksowi z UNIQUE constraint na `user_id`.
- Worst-case latency (MVP): ~10s (OpenRouter) + ~50ms (DB) + overhead aplikacji.
- Brak cache (celowo, secret).

## 8. Kroki implementacji

1. **Walidacja body (Zod) w endpointzie**
   - Dodać schemę inline w `src/pages/api/user-settings.ts`, przed handlerem `PUT`, np. jako:
     - `const updateUserSettingsSchema = z.object({ openrouter_api_key: z.string().min(1) })`
   - Normalizować `openrouter_api_key.trim()` przed dalszym użyciem.

2. **Walidacja klucza OpenRouter (hard requirement 10s)**
   - Użyć istniejącego `validateApiKey()` z `src/lib/services/openrouter.service.ts` (posiada `OPENROUTER_VALIDATE_KEY_TIMEOUT_MS = 10_000`).
   - Obsłużyć typed errors i zmapować je na wymagane statusy 400/408/500.

3. **Warstwa DB: aktualizacja `user_settings`**
   - Rozszerzyć `src/lib/services/user-settings.service.ts` o funkcję:
     - `async function updateUserSettings(supabase: SupabaseClient, userId: string, openrouterApiKey: string): Promise<UserSettingsDTO>`
     - `update({ openrouter_api_key: openrouterApiKey })`
     - `eq("user_id", userId)`
     - `select("id,user_id,openrouter_api_key,created_at")`
     - `.single()` — rekord **musi istnieć** (gwarantuje trigger `public.handle_new_user()`); brak rekordu lub błąd `.single()` traktujemy jako **invariant violation**:
       - log jako **CRITICAL** (database corruption / trigger misconfigured),
       - zwrot `500 Internal Server Error` (to nie jest user error).

4. **Endpoint Astro: dopisać handler `PUT`**
   - Plik: `src/pages/api/user-settings.ts`
   - Dodać `export const PUT = async (context: APIContext) => { ... }`
   - Wykorzystać wzorzec z `export const GET` **w tym samym pliku**:
     - **Skopiować** `jsonError()` helper (spójny format `ApiErrorResponseDTO` + `Content-Type: application/json; charset=utf-8`),
     - **Skopiować** guard `if (!locals.user) return jsonError(401, ...)`,
     - **Skopiować** logging pattern `console.error(..., { route, method, status, supabase_error_code })` (bez sekretów),
     - **Skopiować** success headers (`Content-Type`, `Cache-Control: no-store`).
   - W `PUT` dodać analogiczny `try/catch` (lub `safeParse` + early returns) wokół:
     - parsowania JSON (`request.json()`),
     - walidacji Zod,
     - walidacji OpenRouter (`validateApiKey`),
     - aktualizacji DB,
       tak aby mapping błędów był deterministyczny (400/408/500) i nie wyciekał sekretów.

5. **Checkpoints (manual)**
   - **401**: brak tokena → middleware zwraca 401
   - **400 (body)**: brak `openrouter_api_key` → 400
   - **400 (invalid key)**: klucz niepoprawny → 400 z `"Invalid API key"` i komunikatem OpenRouter w `details`
   - **408**: zasymulować timeout (np. sztuczny blok DNS / narzędzie proxy) → 408
   - **200**: poprawny klucz → zapis w DB i zwrot zaktualizowanego rekordu
