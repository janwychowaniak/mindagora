## API Endpoint Implementation Plan: GET /api/ai-participants

## 1. Przegląd punktu końcowego

Endpoint zwraca **listę uczestników AI** (alias, model, kolor) należących do aktualnie zalogowanego użytkownika. Lista może być pusta.

> Spec (źródło: `.sketch/impl-planing/make-PLAN-implementacji-epa-api_104_GET_ai-participants.md`):
>
> - "**Opis:** Pobierz listę uczestników AI użytkownika"
> - "**Autoryzacja:** Required"
> - "**Parametry zapytania:** Brak (sortowanie alfabetyczne po aliasie w aplikacji)"

- **Metoda**: `GET`
- **Ścieżka**: `/api/ai-participants`
- **Autoryzacja**: wymagana (Supabase Auth; `locals.user` i authed `locals.supabase` ustawiane przez middleware `src/middleware/index.ts`)
- **Źródło danych**: tabela `public.ai_participants`
- **Dane wrażliwe**: brak sekretów (to dane użytkownika, ale nie są to credentials jak `openrouter_api_key`)

## 2. Szczegóły żądania

- **Metoda HTTP**: `GET`
- **URL**: `/api/ai-participants`
- **Parametry**:
  - **Wymagane**: brak
  - **Opcjonalne**: brak
- **Request Body**: brak
- **Nagłówki**:
  - **Wymagane**: `Authorization: Bearer <access_token>` (weryfikowane w middleware; w handlerze używamy `locals.user`)
  - **Opcjonalne**: `Accept: application/json`

### Walidacja wejścia (Zod)

- **Brak walidacji Zod requestu** — endpoint nie ma body ani query params.
- Zgodnie z zasadą w repo: **nie używać Zod dla danych z bazy dla GET** (`.ai/impl-plans-API/Uwagi implementacyjne do planów EP.md`, sekcja „Walidacja Zod”).

## 3. Wykorzystywane typy

Z `src/types.ts`:

- **DTO**: `AiParticipantDTO`
- **Błąd standardowy**: `ApiErrorResponseDTO`
- **Command modele**: brak (GET nie ma body)

Nowy serwis (do utworzenia):

- `getAiParticipants({ supabase, userId }): Promise<{ data: AiParticipantDTO[] | null; error: { message: string; code?: string } | null }>`

## 4. Szczegóły odpowiedzi

### 4.1. Sukces

- **Status**: `200 OK`
- **Body** (`application/json`): lista `AiParticipantDTO[]` (może być pusta)

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "alias": "string",
    "model_id": "string",
    "color": "string (hex)",
    "created_at": "ISO 8601 datetime"
  }
]
```

- **Nagłówki (zalecane)**:
  - `Content-Type: application/json; charset=utf-8`
  - `Cache-Control: no-store` (spójne z istniejącymi endpointami w `src/pages/api/*`)

### 4.2. Błędy

Wszystkie odpowiedzi błędów zwracają `ApiErrorResponseDTO`:

```json
{
  "error": "string",
  "details": "string | { [field: string]: string }"
}
```

Zgodnie ze spec:

- `401 Unauthorized` — brak autoryzacji
- `500 Internal Server Error` — błąd serwera (np. błąd Supabase/DB)

## 5. Przepływ danych

### 5.1. Przepływ wysokopoziomowy

1. **Middleware** (`src/middleware/index.ts`) weryfikuje `Authorization: Bearer <token>` dla nie‑publicznych ścieżek i ustawia:
   - `locals.user`,
   - `locals.supabase` (authed Supabase client z JWT użytkownika; RLS działa automatycznie).
2. **Endpoint** (GET `/api/ai-participants`) wykonuje guard clause:
   - jeśli `!locals.user` → `401 Unauthorized` (defense‑in‑depth; praktycznie middleware już to obsługuje).
3. Endpoint wywołuje serwis:
   - `getAiParticipants({ supabase: locals.supabase, userId: locals.user.id })`
4. Serwis wykonuje zapytanie do `ai_participants`:
   - filtr: `.eq("user_id", userId)` (defense‑in‑depth oprócz RLS),
   - sortowanie: `.order("alias", { ascending: true })` dla stabilnego porządku (mimo że spec wspomina sortowanie w aplikacji).
5. Endpoint zwraca `200` z `AiParticipantDTO[]` (w tym `[]`).

### 5.2. Decyzje dot. service layer

- **Nowy serwis**: dodać `src/lib/services/ai-participants.service.ts` i przenieść query do serwisu (zgodnie z `@astro.mdc` i stylem `src/lib/services/user-settings.service.ts`).
- **Sygnatura serwisu (positional vs object params)**:
  - **Decyzja**: object params `{ supabase, userId }`, mimo że to 2 parametry.  
    **Rationale**: spójność z istniejącymi supabase‑serwisami (`getUserSettings({ ... })`, `updateUserSettings({ ... })`) oraz mniejsza podatność na pomyłkę kolejności parametrów.
- **Brak kolumny `updated_at`**: Tabela `ai_participants` nie śledzi modyfikacji
  (YAGNI - MVP nie ma funkcji edit, tylko create+delete).
- **Zod schema location**: nie dotyczy (GET bez user input).
- **Database query method (`.single()` vs `.maybeSingle()`)**:
  - nie dotyczy (lista) — używamy `.select()` bez `.single()`/`.maybeSingle()` ponieważ spodziewamy się 0..N wierszy.

## 6. Względy bezpieczeństwa

- **Autoryzacja**:
  - endpoint jest chroniony przez middleware (patrz `src/middleware/index.ts`);
  - dodatkowy `if (!locals.user)` w handlerze jako defense‑in‑depth (wzorzec z `src/pages/api/user-settings.ts`).
- **RLS i izolacja danych**:
  - wszystkie operacje DB wykonywać przez `locals.supabase` (authed client, bez service role key);
  - dodatkowo zawężać query przez `.eq("user_id", locals.user.id)` (defense‑in‑depth).
- **IDOR / enumeracja danych**:
  - endpoint nie przyjmuje `user_id` ani `id` w wejściu, więc ryzyko IDOR jest ograniczone do błędnej implementacji query — dlatego filtr `user_id` jest obowiązkowy.
- **Sekrety i logowanie**:
  - nie logować tokenów (`Authorization`), ani całych payloadów requestów.
- **Content-Type**:
  - nie dotyczy (GET bez body); walidacja `Content-Type` stosowana wyłącznie w POST/PUT (jak w `src/pages/api/user-settings.ts`).

## 7. Obsługa błędów

### 7.1. Mapowanie błędów (źródła i statusy)

- **Brak autoryzacji**:
  - `!locals.user` → `401 Unauthorized`
  - Body: `ApiErrorResponseDTO` (Skopiować helper `jsonError()` z `src/pages/api/user-settings.ts`)
  - Logging: brak (expected flow), ewentualnie minimalne logi w middleware (już istnieją dla errorów supabase auth).

- **Błędy Supabase/DB**:
  - Jeśli serwis zwróci `error` → `500 Internal Server Error`
  - Logging: **regular** (`console.error`) w stylu istniejących endpointów:
    - pola: `route: "/api/ai-participants"`, `method: "GET"`, `status: 500`, `supabase_error_code`
  - Response: `jsonError(500, "Internal Server Error", "An unexpected error occurred")` (lub analogiczny bezpieczny komunikat).

- **Nieoczekiwany stan (data null bez error)**:
  - traktować jak `500` (to nie powinno wystąpić przy PostgREST, ale defensywnie obsłużyć)
  - Logging: **CRITICAL** (naruszenie oczekiwań biblioteki / integracji) z polem np. `severity: "CRITICAL"`

### 7.2. Wzorce do skopiowania (konkretne referencje)

- Skopiować helper `jsonError()` z `src/pages/api/user-settings.ts` (format `ApiErrorResponseDTO` + `Content-Type`).
- Skopiować styl logowania błędów Supabase z:
  - `src/pages/api/user-settings.ts` (lookup error logging) lub
  - `src/middleware/index.ts` (log obiektowy z `route/method/status/supabase_error_code`).

### 7.3. Rejestrowanie błędów w tabeli (jeśli dotyczy)

- W dostarczonych zasobach DB/spec nie ma tabeli do trwałego logowania błędów requestów dla tego endpointa, więc w MVP logujemy przez `console.error` (jak w istniejących endpointach).

## 8. Wydajność

WYMAGANE:

- **Database query complexity**: \(O(\log N + k)\)
  - \(N\) = liczba wszystkich `ai_participants` w tabeli,
  - \(k\) = liczba uczestników danego użytkownika (wynik).  
    Zapytanie jest realizowane jako index range scan po `user_id` i zwraca \(k\) wierszy.
- **Number of DB roundtrips**: 1 (po `ai_participants`).
- **External API latency**: brak (0 wywołań do zewnętrznych API).
- **Worst-case total latency calculation**:
  - \(T_{worst} \approx T_{db} + T_{serialize}\)
  - Przy założeniu \(T_{db} \approx 10\text{–}50ms\), \(T_{serialize} < 5ms\) → ok. **15–55ms** (pomijając narzut sieciowy).
- **Index usage**:
  - wykorzystywany indeks wynikający z `UNIQUE(user_id, alias)` na `ai_participants` (filtr po `user_id` + naturalny porządek po `alias`),
  - dodatkowo PK na `id` nie jest używany w tym query (bo nie filtrujemy po `id`).

## 9. Kroki implementacji

1. **Utwórz serwis do pobierania listy AI participants**
   - Plik: `src/lib/services/ai-participants.service.ts`
   - Import typów:
     - `SupabaseClient` z `src/db/supabase.client.ts`
     - `AiParticipantDTO` z `src/types.ts`
   - API serwisu:
     - `getAiParticipants({ supabase, userId })`
   - Implementacja query (jeden roundtrip):
     - `.from("ai_participants")`
     - `.select("id,user_id,alias,model_id,color,created_at")`
     - `.eq("user_id", userId)`
     - `.order("alias", { ascending: true })`
   - Obsługa błędów:
     - przy `error` zwrócić `{ data: null, error: { message, code } }`
     - przy `!data` bez `error` zwrócić `{ data: null, error: { message: "AI participants lookup returned null data." } }`

2. **Utwórz endpoint Astro**
   - Plik: `src/pages/api/ai-participants.ts`
   - Wymagania frameworkowe:
     - `export const prerender = false`
     - `export const GET = async (context: APIContext) => { ... }` (uppercase)
   - Skopiować helper `jsonError()` z `src/pages/api/user-settings.ts`.
   - Dodać stałą `route = "/api/ai-participants"` (wzorzec jak w `src/pages/api/openrouter-models.ts`).

3. **Zaimplementuj flow handlera (guard clauses + happy path)**
   - Guard: `if (!locals.user)` → `401 Unauthorized` (defense‑in‑depth; Skopiować wzorzec z `src/pages/api/user-settings.ts`).
   - Service call: `getAiParticipants({ supabase: locals.supabase, userId: locals.user.id })`
   - Error path:
     - jeśli `error` lub `!data` → log **regular** / **CRITICAL** (jak w sekcji 7.1) i `jsonError(500, "Internal Server Error", "An unexpected error occurred")`
   - Happy path:
     - `return new Response(JSON.stringify(data satisfies AiParticipantDTO[]), { status: 200, headers: { ... } })`
     - dodać nagłówki `Content-Type` oraz `Cache-Control: no-store`

4. **(Opcjonalnie) Smoke test w dokumentacji**
   - Plik: `.sketch/curl_-_smoke_testy_API.md`
   - Dodać przykłady:
     - 200: `curl -H "Authorization: Bearer <token>" http://localhost:<port>/api/ai-participants`
     - 401: brak/invalid token (middleware powinien zwrócić `ApiErrorResponseDTO`)

### Checklist przed finalizacją

- [ ] Zod schema: **nie dotyczy** (GET bez inputu; nie walidujemy danych z DB Zod-em)
- [ ] DB operations: używamy `.select()` (lista), bez `.single()`/`.maybeSingle()` — uzasadnione przez 0..N wyników
- [ ] Service function signature: jawne `getAiParticipants({ supabase, userId })` + jawny typ zwrotu
- [ ] Wydajność: sekcja 8 zawiera wszystkie elementy WYMAGANE
- [ ] Reused patterns: kroki zawierają „Skopiować … z …”
- [ ] Logging: każda ścieżka błędu ma określone severity (regular vs CRITICAL) i nie loguje sekretów
- [ ] Error scenarios: statusy 200/401/500 zgodne ze spec
