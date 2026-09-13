## API Endpoint Implementation Plan: `PUT /api/conversations/:id`

## 1. Przegląd punktu końcowego

- **Metoda HTTP**: `PUT`
- **URL**: `/api/conversations/:id`
- **Cel**: Zaktualizować tytuł konwersacji użytkownika (inline editing).
- **Autoryzacja**: **Wymagana** (`context.locals.user` + `context.locals.supabase` z `src/middleware/index.ts`).
- **Założenia/ograniczenia implementacyjne**:
  - **NO RPC**: żadnych wywołań `supabase.rpc()`.
  - Operacja jest prostą aktualizacją rekordu `conversations` (brak `.insert()`, więc „cleanup” nie dotyczy tego endpointu).
  - Nie ustawiamy ręcznie `updated_at` — w tej aplikacji `conversations.updated_at` jest używane jako “data ostatniej wiadomości” (aktualizowana triggerem przy INSERT message). PUT tytułu nie powinien “bumpować” konwersacji na liście.

## 2. Szczegóły żądania

- **Headers**:
  - `Authorization: Bearer <token>` (wymagane)
  - `Content-Type: application/json` (wymagane; walidować przed `request.json()`)
- **Parametry URL**:
  - `id` (uuid) — identyfikator konwersacji
- **Request body**:

```json
{
  "title": "string"
}
```

- **Walidacja (Zod)**:
  - `params.id`:
    - required
    - `uuid("Invalid id")`
  - `title`:
    - required
    - `trim()`
    - min 1 znak po trim (nie może być puste)
    - max 100 znaków
  - **Lokalizacja schematów**: inline w `src/pages/api/conversations/[id].ts` (single-use, brak reuse w >1 miejscu).

## 3. Wykorzystywane typy (DTO / Command Models)

Z `src/types.ts`:

- `UpdateConversationCommand` — `{ title: string }` (command dla PUT)
- `UpdateConversationResponseDTO` — alias do `ConversationDTO` (zwracamy kompletny row konwersacji)
- `ConversationDTO` — reprezentacja rekordu tabeli `conversations`
- `ApiErrorResponseDTO` — standardowy kształt błędów

## 4. Szczegóły odpowiedzi

### 200 OK

Zwraca `UpdateConversationResponseDTO` (`ConversationDTO`) po aktualizacji:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "string",
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime"
}
```

### Headers (success i error)

- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store` (odpowiedź jest user-specific)

## 5. Przepływ danych (end-to-end)

1. **Auth guard**:
   - jeśli `!locals.user` → `401 Unauthorized`
   - Skopiować pattern z:
     - `src/pages/api/conversations/[id].ts` (GET guard — ten sam plik)
     - lub `src/pages/api/user-settings.ts` (GET/PUT guard)

2. **Walidacja `params.id` (uuid)**:
   - `paramsSchema.safeParse(context.params)`
   - jeśli invalid → `400 Bad Request` + `{ id: "..." }`
   - Skopiować pattern walidacji params z `src/pages/api/conversations/[id]/messages.ts` (tam jest identyczny schemat).

3. **Walidacja `Content-Type` + JSON parse**:
   - jeśli `Content-Type` nie zawiera `application/json` → `400 Bad Request` `"Content-Type must be application/json"`
   - try/catch `await request.json()` → `400 Bad Request` `"Invalid JSON body"`
   - Skopiować pattern z `src/pages/api/user-settings.ts` (PUT) lub `src/pages/api/conversations.ts` (POST).

4. **Walidacja body (Zod)**:
   - `updateConversationSchema.safeParse(body)`
   - jeśli invalid → `400 Bad Request` lub `400 Validation error` (jawna decyzja poniżej).
   - Skopiować helper `formatZodErrors()` z:
     - `src/pages/api/user-settings.ts`
     - albo `src/pages/api/conversations.ts`

5. **Autoryzacja i istnienie konwersacji (403 vs 404) — decyzja + alternatywy**
   - Spec wymaga rozróżnienia:
     - `403 Forbidden` — konwersacja nie należy do użytkownika
     - `404 Not Found` — konwersacja nie istnieje

   Przy Supabase RLS i authed kliencie (`locals.supabase`) rekordy innych użytkowników są “niewidoczne” (zachowują się jak „not found”), więc samo API **nie odróżni wiarygodnie** `403` od `404` bez dodatkowego mechanizmu po stronie DB.

   **Podejście A (wybrane w MVP; security-first; NO RPC, bez service role)**: zwracamy **404** zarówno dla “not found”, jak i “not owned”.
   - Spójne z:
     - `GET /api/conversations/:id` (`src/pages/api/conversations/[id].ts`) — komentarz o mapowaniu na 404
     - `POST /api/conversations/:id/messages` (`src/pages/api/conversations/[id]/messages.ts`) — 404 dla braku własności
   - Trade-off: nie spełnia literalnie spec `403`, ale zmniejsza ryzyko enumeracji zasobów.

   **Podejście B (spec-correct; nadal bez RPC i bez service role)**: dodać DB-level mechanizm existence check (np. policy/view pozwalający odczytać minimalne dane `conversations.id/user_id`) i dopiero wtedy rozróżnić 403/404.
   - Trade-off: wymaga zmian w DB + świadomej decyzji o ryzyku enumeracji.

6. **Update w DB (serwis)**:
   - Wywołać serwis `updateConversationTitleForUser({ supabase, userId, conversationId, title })`.
   - Operacja: `.update({ title })` + `.eq("id", conversationId)` + `.eq("user_id", userId)` (defense-in-depth).
   - Jeśli serwis zwróci `data: null` bez błędu → `404 Not Found` `"Conversation not found"` (Podejście A).
   - (Komentarz do wklejenia w kodzie przy mapowaniu na 404):

```ts
// RLS zapewnia izolację — konwersacja innego usera zwróci null przez authed client,
// co mapujemy na 404 (anti-enumeration / information disclosure defense).
```

7. **Return 200**:
   - Zwrócić zaktualizowany `ConversationDTO` jako `UpdateConversationResponseDTO`.
   - Header `Cache-Control: no-store`.

### Jawne decyzje dotyczące spójności error payloadów

- **Błędy walidacji body (Zod)**: użyć statusu `400` oraz `error` = `"Bad Request"` (jak `PUT /api/user-settings`) i `details` jako obiekt `{ field: message }`.
- **Błędy walidacji params (`id`)**: `400 Bad Request` z `details: { id: "..." }` (jak istniejące endpointy conversations).

## 6. Względy bezpieczeństwa

- **Supabase authed client**:
  - wszystkie operacje wykonywać przez `context.locals.supabase` (zgodnie z `.cursor/rules/backend.mdc`).
- **Defense-in-depth**:
  - filtr `.eq("user_id", locals.user.id)` również w update (nawet jeśli RLS istnieje).
- **Content-Type validation**:
  - wymagane dla PUT przed `request.json()` (ochrona przed błędami parsera i niespójnymi klientami).
- **Anty-enumeration**:
  - w MVP mapujemy “not owned” → `404 Not Found` (Podejście A).
- **Brak logowania danych wrażliwych / treści**:
  - nie logować `title` (może zawierać dane użytkownika); logować tylko metadane i `supabase_error_code`.
- **Cache**:
  - `Cache-Control: no-store` (również na errorach, bo helper `jsonError()` w `src/pages/api/conversations/[id].ts` już to robi).

## 7. Obsługa błędów

### 400 Bad Request

- invalid `id` (niepoprawny uuid) — Zod params
- `Content-Type` ≠ `application/json`
- invalid JSON body (parse error)
- invalid `title`:
  - puste po trim
  - > 100 znaków

### 401 Unauthorized

- brak/invalid token (`locals.user` falsy)

### 403 Forbidden

- **Tylko jeśli wdrożymy Podejście B** (DB support do rozróżnienia).
- W MVP (Podejście A) ten przypadek mapowany jest na `404 Not Found`.

### 404 Not Found

- konwersacja nie istnieje **lub** (MVP / Podejście A) nie jest widoczna dla usera przez RLS.

### 500 Internal Server Error

- błąd zapytania Supabase w update:
  - log **regular**:
    - `route`, `method`, `status`, `supabase_error_code`
  - response: `"An unexpected error occurred"` albo `"Failed to update conversation"`
- stan nieoczekiwany:
  - np. serwis zwraca `data: null` i `error: null` w sytuacji innej niż “not found” (mało prawdopodobne) — log **CRITICAL** (jeśli nie da się tego wytłumaczyć brakiem rekordu).

### Logging severity (jawna decyzja)

- **regular**:
  - każdy błąd Supabase (update)
  - błędy walidacji wejścia (Content-Type / invalid JSON / Zod): **brak logowania**
    - Uzasadnienie: spójne z istniejącymi endpointami — logowanie pojawia się dopiero przy błędach Supabase/OpenRouter (5xx).
- **CRITICAL**:
  - nieoczekiwany stan typu “null data bez error” w miejscu, gdzie kod zakłada, że update powinien zwrócić rekord, jeśli został wykonany.

### Rejestrowanie błędów w tabeli błędów (jeśli dotyczy)

- MVP: **brak** dedykowanej tabeli błędów i brak integracji typu Sentry w tej ścieżce.
- Logowanie odbywa się przez `console.error` / `console.warn` zgodnie z patternami w istniejących endpointach.

## 8. Wydajność (WYMAGANE)

- **Database query complexity**:
  - update po PK `conversations.id` + filtr po `user_id` → \(O(1)\)
- **Number of DB roundtrips**:
  - **1** roundtrip w happy path: pojedynczy `.update(...).select(...).maybeSingle()`
  - (opcjonalnie, Podejście B) **2** roundtripy: existence/ownership check + update
- **External API latency**:
  - brak (endpoint nie wywołuje OpenRouter ani innych usług zewnętrznych)
- **Worst-case total latency calculation**:
  - \(T \approx T_{db\_update}\) (1 roundtrip, typowo dziesiątki–setki ms w zależności od infrastruktury)
- **Index usage (które indeksy są używane dla tego endpointu)**:
  - `conversations_pkey(id)` — lookup po `id`
  - pomocniczo: index po `user_id` (jeśli planner uzna za potrzebne), ale przy filtrze po PK dominujący jest PK.

## 9. Kroki implementacji (WYMAGANE)

### 9.1. Serwis (warstwa usług)

1. **Zaktualizować plik** `src/lib/services/conversations.service.ts`
   - Dodać funkcję:
     - `updateConversationTitleForUser({ supabase, userId, conversationId, title }): Promise<{ data: ConversationDTO | null; error: { message: string; code?: string } | null }>`
   - **Sygnatura**: object params (bo >3 parametry; zgodnie z regułą).
   - **Zapytanie (NO RPC)**:
     - `.from("conversations")`
     - `.update({ title })`
     - `.eq("id", conversationId)`
     - `.eq("user_id", userId)`
     - `.select("id,user_id,title,created_at,updated_at")`
     - `.maybeSingle()`
   - **Decyzja `.single()` vs `.maybeSingle()`**:
     - `.maybeSingle()` ponieważ aktualizacja może dotyczyć 0 wierszy (nie istnieje / nie należy do usera).
   - **Obsługa błędów**:
     - jeśli `error` → zwrócić `error: { message, code }`
     - jeśli `data === null` i `error === null` → to jest “not found / not owned” (MVP: mapujemy na 404 w endpointcie).

### 9.2. Endpoint (Astro API route)

2. **Zaktualizować plik** `src/pages/api/conversations/[id].ts`
   - Plik już ma:
     - `export const prerender = false;`
     - `jsonError()` z `Cache-Control: no-store`
     - `paramsSchema` do UUID
     - `GET` handler
   - Dodać `PUT` handler:
     - `export const PUT = async (context: APIContext) => { ... }`
   - Dodać inline Zod schema dla body (single-use):
     - `updateConversationSchema = z.object({ title: z.string().trim().min(1, "Required").max(100, "Max 100 characters") })`
   - Dodać helper `formatZodErrors()`:
     - Skopiować 1:1 z `src/pages/api/user-settings.ts` (spójny output `Record<string, string>`).
     - Dodać adnotację:

```ts
// TODO: formatZodErrors() jest kopiowany do kolejnych endpointów (user-settings, conversations, ai-participants, teraz tutaj).
// Wyciągnąć do shared utility (np. src/lib/utils/validation.ts) przy refaktoryzacji.
```

- Skopiować patterny:
  - Content-Type guard + JSON parse try/catch z `src/pages/api/user-settings.ts` (PUT).
  - Logowanie Supabase error (regular) z `src/pages/api/conversations/[id].ts` (GET) — analogiczny kształt loga.
- Orkiestracja:
  - guard `locals.user`
  - validate params
  - validate Content-Type + parse JSON
  - validate body
  - call `updateConversationTitleForUser(...)`
  - jeśli `error` → log regular + `500`
  - jeśli `data === null` → `404`
  - else → `200` + `UpdateConversationResponseDTO`

### 9.3. Smoke testy (manualne)

3. **Wymagane**: Uzupełnić `.sketch/curl_-_smoke_testy_API.md` o (napisać curl’e; uruchamia developer ręcznie):
   - `PUT /api/conversations/:id` bez tokena → `401`
   - invalid uuid → `400`
   - brak `Content-Type: application/json` → `400`
   - invalid JSON → `400`
   - `title = "   "` → `400`
   - `title.length > 100` → `400`
   - poprawny token + własne `id` + poprawny `title` → `200` i zwraca zaktualizowany `title`
   - poprawny token + cudze/nieistniejące `id` → `404` (MVP / Podejście A)

## Checklist końcowy (z promptu)

- [ ] All Zod schemas have explicit location (inline vs helper with rationale)
- [ ] All database operations specify `.single()` or `.maybeSingle()` with rationale based on invariants
- [ ] All service function signatures are explicit (async, params, return type)
- [ ] Section 8 (Performance) includes all WYMAGANE elements
- [ ] Section 9 (Implementation steps) uses “Skopiować … z …” for reused patterns
- [ ] All logging statements specify severity (regular vs CRITICAL)
- [ ] Security section addresses Content-Type validation for PUT endpoint
- [ ] Error scenarios include exact HTTP status codes from API specification (lub jawnie opisane MVP odchylenie 403→404)
