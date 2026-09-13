## API Endpoint Implementation Plan: `DELETE /api/conversations/:id`

## 1. Przegląd punktu końcowego

- **Metoda HTTP**: `DELETE`
- **URL**: `/api/conversations/:id`
- **Cel**: Usunąć konwersację użytkownika (hard delete) razem ze wszystkimi wiadomościami.
- **Autoryzacja**: **Wymagana** (`context.locals.user` + `context.locals.supabase` ustawiane przez `src/middleware/index.ts`).
- **Wymogi spec**:
  - Response body: `{ "message": "Conversation deleted successfully" }`
  - Uwaga z promptu: **„CASCADE delete automatycznie usuwa wszystkie messages w konwersacji.”**
- **Założenia/ograniczenia implementacyjne**:
  - **NO RPC**: żadnych wywołań `supabase.rpc()`.
  - Brak request body → **brak** walidacji `Content-Type` (dotyczy tylko POST/PUT).
  - Cleanup dla `.insert()` jest **N/A** (brak insertów w tym endpointcie; kasowanie jest pojedynczą operacją DB + CASCADE).

## 2. Szczegóły żądania

- **Headers**:
  - `Authorization: Bearer <token>` (wymagane)
- **Parametry URL**:
  - `id` (uuid) — identyfikator konwersacji
- **Query params**: brak
- **Request body**: brak
- **Walidacja (Zod)**:
  - `params.id`:
    - required
    - `uuid("Invalid id")`
  - **Lokalizacja schematu**: inline w `src/pages/api/conversations/[id].ts` (już istnieje `paramsSchema` i jest współdzielony przez GET/PUT/DELETE).

## 3. Wykorzystywane typy (DTO / Command Models)

Z `src/types.ts`:

- `ApiSuccessResponseDTO` — generyczny response dla endpointów DELETE:
  - `{"message": string}`
- `ApiErrorResponseDTO` — standardowy kształt błędów

Brak Command Modeli (DELETE nie przyjmuje body).

## 4. Szczegóły odpowiedzi

### 200 OK

Zwraca `ApiSuccessResponseDTO`:

```json
{
  "message": "Conversation deleted successfully"
}
```

### Headers (success i error)

- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store` (odpowiedź jest user-specific i nie powinna być cache’owana)

## 5. Przepływ danych (end-to-end)

1. **Auth guard**:
   - jeśli `!locals.user` → `401 Unauthorized`
   - Skopiować pattern z `src/pages/api/conversations/[id].ts` (GET/PUT — ten sam plik).

2. **Walidacja `params.id` (uuid)**:
   - `paramsSchema.safeParse(context.params)`
   - jeśli invalid → `400 Bad Request` + `{ id: "Invalid id" }`
   - Skopiować pattern z `src/pages/api/conversations/[id].ts` (GET/PUT) lub `src/pages/api/conversations/[id]/messages.ts` (POST).

3. **Autoryzacja i istnienie konwersacji (403 vs 404) — decyzja + alternatywy**
   - Spec wymaga rozróżnienia:
     - `403 Forbidden` — konwersacja nie należy do użytkownika
     - `404 Not Found` — konwersacja nie istnieje

   W Supabase z RLS i klientem authed (`locals.supabase`) rekordy innych użytkowników są niewidoczne, więc aplikacja zwykle nie odróżni `403` od `404` bez dodatkowego mechanizmu DB.

   **Podejście A (wybrane w MVP; security-first; spójne z istniejącym kodem) — zwracamy 404 dla obu przypadków**
   - Usuwanie wykonujemy z filtrem `.eq("id", conversationId).eq("user_id", userId)`
   - Jeśli 0 wierszy usuniętych → `404 Not Found`
   - Uzasadnienie (cytat z istniejącego `GET /api/conversations/:id` w `src/pages/api/conversations/[id].ts`):

```ts
// RLS izoluje zasoby innych userow, wiec authed client zwraca null
// zarowno dla "nie istnieje", jak i "nie nalezy do Ciebie".
// Celowo mapujemy oba przypadki na 404 (anti-enumeration / information disclosure defense).
```

**Podejście B (spec-correct; nadal bez RPC i bez service role) — umożliwia 403**

- Wymaga DB-level mechanizmu “existence check” niezależnego od właściciela (np. dodatkowy view/policy z minimalnymi polami).
- Trade-off: wymaga zmian w DB + świadomej decyzji o ryzyku enumeracji zasobów.

**Podejście C (spec-correct; niezalecane / wbrew zasadom)**: service role / admin (zabronione przez reguły bezpieczeństwa projektu).

4. **Delete w DB (serwis)**:
   - Wywołać serwis `deleteConversationForUserById({ supabase, userId, conversationId })`.
   - Operacja: `.delete()` na `conversations` z filtrem `id + user_id`.
   - **CASCADE** usuwa `messages` automatycznie (brak osobnych zapytań do `messages`).
   - Jeśli serwis zwróci `data: null` bez błędu → `404 Not Found` `"Conversation not found"` (Podejście A).

5. **Return 200**:
   - Zwrócić `{ message: "Conversation deleted successfully" }` jako `ApiSuccessResponseDTO`.

## 6. Względy bezpieczeństwa

- **Supabase authed client**:
  - wszystkie operacje wykonywać przez `context.locals.supabase`:
    - „**Use supabase from context.locals in Astro routes instead of importing supabaseClient directly**” (`.cursor/rules/backend.mdc`)
- **Defense-in-depth**:
  - filtr `.eq("user_id", locals.user.id)` również w delete (nawet jeśli RLS istnieje).
- **Anty-enumeration**:
  - MVP (Podejście A) mapuje “not owned” → `404 Not Found` (spójne z istniejącym `GET`/`PUT` i `POST /messages`).
- **Brak logowania danych wrażliwych**:
  - nie logować treści wiadomości (i tak nie są ładowane); logować tylko metadane (route/method/status oraz `supabase_error_code`).
- **Cache**:
  - `Cache-Control: no-store` (w success i error).

## 7. Obsługa błędów

### 400 Bad Request

- invalid `id` (niepoprawny uuid) — Zod params

### 401 Unauthorized

- brak/invalid token (`locals.user` falsy)

### 403 Forbidden

- **Tylko jeśli wdrożymy Podejście B** (DB support do rozróżnienia).
- W MVP (Podejście A) ten przypadek mapowany jest na `404 Not Found`.

### 404 Not Found

- konwersacja nie istnieje **lub** (MVP / Podejście A) nie jest widoczna dla usera przez RLS.

### 500 Internal Server Error

- błąd zapytania Supabase podczas delete:
  - log **regular**:
    - `route`, `method`, `status`, `severity: "regular"`, `supabase_error_code`
  - response: `"An unexpected error occurred"` lub `"Failed to delete conversation"`

### Logging severity (jawna decyzja)

- **regular**:
  - każdy błąd Supabase (delete)
- **CRITICAL**:
  - N/A w MVP dla tego endpointu (brak invariantów typu “record MUST exist” jak w `user_settings`).

## 8. Wydajność (WYMAGANE)

- **Database query complexity**:
  - delete parent row po PK `conversations.id` + filtr `user_id` → \(O(1)\)
  - CASCADE delete `messages` → \(O(n)\) względem liczby wiadomości w konwersacji \(n\) (operacja w obrębie DB, bez dodatkowych roundtripów).
- **Number of DB roundtrips**:
  - **1** roundtrip w happy path: pojedynczy `.delete(...).select(...).maybeSingle()`
  - CASCADE wykonuje się w tej samej transakcji w DB (0 dodatkowych roundtripów).
- **External API latency**:
  - brak (endpoint nie wywołuje OpenRouter ani innych usług zewnętrznych).
- **Worst-case total latency calculation**:
  - \(T \approx T_{db\_delete} + T_{db\_cascade(n)}\)
  - dla dużego \(n\) dominuje koszt usunięcia wielu rekordów `messages`.
- **Index usage (które indeksy są używane dla tego endpointu)**:
  - `conversations_pkey(id)` — lookup po `id`
  - **Ważne dla CASCADE**: indeksy dla `messages(conversation_id)` **już istnieją** (migracja `supabase/migrations/20250114120600_create_indexes.sql`) i wspierają szybkie odnajdywanie/usuwanie rekordów child podczas kasowania parent:
    - `idx_messages_conversation_id on messages(conversation_id)`
    - `idx_messages_conversation_created on messages(conversation_id, created_at asc)` (composite; pierwszy klucz to `conversation_id`)

## 9. Kroki implementacji (WYMAGANE)

### 9.1. Serwis (warstwa usług)

1. **Zaktualizować plik** `src/lib/services/conversations.service.ts`
   - Dodać named interface (na górze pliku, obok istniejących typu `UpdateConversationResult`):
     - Skopiować strukturę z `UpdateConversationResult` w tym samym pliku.
     - Przykład:

```ts
interface DeleteConversationResult {
  data: { id: string } | null;
  error: { message: string; code?: string } | null;
}
```

- Dodać funkcję:
  - `deleteConversationForUserById({ supabase, userId, conversationId }): Promise<DeleteConversationResult>`
- **Sygnatura**: object params (odchylenie od reguły “positional dla ≤3” — dla spójności z istniejącymi funkcjami w `conversations.service.ts`, np. `getConversationForUserById`, `updateConversationTitleForUser`).
- **Zapytanie (NO RPC)**:
  - `.from("conversations")`
  - `.delete()`
  - `.eq("id", conversationId)`
  - `.eq("user_id", userId)` (defense-in-depth)
  - `.select("id")`
  - `.maybeSingle()`
- **Decyzja `.single()` vs `.maybeSingle()`**:
  - `.maybeSingle()` ponieważ delete może dotyczyć 0 wierszy (nie istnieje / nie należy do usera / niewidoczne przez RLS).
- **Uwagi**:
  - Nie kasować `messages` ręcznie — DB ma `ON DELETE CASCADE` na `messages.conversation_id`.

### 9.2. Endpoint (Astro API route)

2. **Zaktualizować plik** `src/pages/api/conversations/[id].ts`
   - Plik już zawiera:
     - `export const prerender = false;`
     - `jsonError()` z `Cache-Control: no-store`
     - `paramsSchema` do UUID
     - `GET` i `PUT`
   - Dodać import serwisu:
     - Skopiować styl importów z istniejących importów w tym pliku.
   - Dodać handler:
     - `export const DELETE = async (context: APIContext) => { ... }`
   - Orkiestracja:
     - guard `locals.user` → `401`
     - validate params → `400`
     - call `deleteConversationForUserById({ supabase: locals.supabase, userId: locals.user.id, conversationId: id })`
     - jeśli `error` → log **regular** + `500`
     - jeśli `data === null` → `404` (MVP / Podejście A)
     - else → `200` + `ApiSuccessResponseDTO`
   - Logowanie:
     - Skopiować pattern `console.error(..., { route, method, status, severity, supabase_error_code })` z `PUT` w tym samym pliku.

### 9.3. Smoke testy (manualne)

3. **Uzupełnić** `.sketch/curl_-_smoke_testy_API.md` o przypadki dla DELETE:
   - `DELETE /api/conversations/:id` bez tokena → `401`
   - invalid uuid → `400`
   - poprawny token + własne `id` → `200` i message `"Conversation deleted successfully"`
   - poprawny token + nieistniejące/cudze `id` → `404` (MVP / Podejście A)
   - (weryfikacja CASCADE) po `DELETE` wykonać `GET /api/conversations/:id` → `404`

## Checklist końcowy (z promptu)

- [ ] All Zod schemas have explicit location (inline vs helper with rationale)
- [ ] All database operations specify `.single()` or `.maybeSingle()` with rationale based on invariants
- [ ] All service function signatures are explicit (async, params, return type)
- [ ] Section 8 (Performance) includes all WYMAGANE elements
- [ ] Section 9 (Implementation steps) uses “Skopiować … z …” for reused patterns
- [ ] All logging statements specify severity (regular vs CRITICAL)
- [ ] Security section addresses Content-Type validation for POST/PUT endpoints (N/A dla DELETE — jawnie pominięte)
- [ ] Error scenarios include exact HTTP status codes from API specification (lub jawnie opisane MVP odchylenie 403→404)
