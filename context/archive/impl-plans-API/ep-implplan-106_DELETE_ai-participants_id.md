## API Endpoint Implementation Plan: DELETE /api/ai-participants/:id

## 1. Przegląd punktu końcowego

Endpoint usuwa (hard delete) pojedynczego **uczestnika AI** należącego do aktualnie zalogowanego użytkownika.

> Spec (źródło: `.sketch/impl-planing/make-PLAN-implementacji-epa-api_106_DELETE_ai-participants_id.md` / `.ai/ap5-api-plan-pl.md`):
>
> - "**Opis:** Usuń uczestnika AI (hard delete)"
> - "**Autoryzacja:** Required"
> - "**Parametry URL:** `id` (uuid)"
> - "**Uwaga:** Po usunięciu uczestnika, wszystkie jego wiadomości w konwersacjach mają `ai_participant_id` ustawione na NULL (ON DELETE SET NULL)."

- **Metoda**: `DELETE`
- **Ścieżka**: `/api/ai-participants/:id`
- **Autoryzacja**: wymagana (Supabase Auth; `locals.user` i authed `locals.supabase` ustawiane przez middleware `src/middleware/index.ts`)
- **Źródło danych**: tabela `public.ai_participants`
- **Efekty uboczne**:
  - usunięcie rekordu z `ai_participants`,
  - automatyczne ustawienie `messages.ai_participant_id = NULL` dla wiadomości powiązanych z usuwanym uczestnikiem (FK `ON DELETE SET NULL`).

## 2. Szczegóły żądania

- **Metoda HTTP**: `DELETE`
- **URL**: `/api/ai-participants/:id`
- **Parametry**:
  - **Wymagane**:
    - `id` (path param) — UUID uczestnika
  - **Opcjonalne**: brak
- **Request Body**: brak
- **Nagłówki**:
  - **Wymagane**: `Authorization: Bearer <access_token>` (weryfikowane w middleware; w handlerze używamy `locals.user`)
  - **Opcjonalne**: `Accept: application/json`

### Walidacja wejścia (Zod)

Zgodnie z zasadami repo (`.ai/impl-plans-API/Uwagi implementacyjne do planów EP.md`):

- ✓ używać Zod dla **path params**, gdy wymagają walidacji biznesowej/formatu (UUID).

Decyzje:

- **Zod schema location**: **inline w pliku endpointu** `src/pages/api/ai-participants/[id].ts` (re-use ≤ 1).
- **Walidacja `id`**:
  - `z.string().uuid("Invalid id")`
  - brak `Content-Type` checks (DELETE bez body).

> Uwaga: `400 Bad Request` dla niepoprawnego UUID nie jest wymienione w specyfikacji, ale jest standardowe i spójne z zasadą “400 dla nieprawidłowych danych wejściowych”.

## 3. Wykorzystywane typy

Z `src/types.ts`:

**Sukces:**

```typescript
import type { ApiSuccessResponseDTO } from "../../../types.ts";
// { message: string }
```

**Błąd:**

```typescript
import type { ApiErrorResponseDTO } from "../../../types.ts";
// { error: string; details: string | Record<string, string> }
```

**Service layer (internal):**

```typescript
// Nowy typ w src/lib/services/ai-participants.service.ts
type DeleteAiParticipantResult = {
  deleted: boolean;
  error: { message: string; code?: string } | null;
};
```

Endpoint nie zwraca `AiParticipantDTO` bo DELETE nie ma response body (poza success message).

## 4. Szczegóły odpowiedzi

### 4.1. Sukces

- **Status**: `200 OK`
- **Body** (`application/json`):

```json
{
  "message": "AI participant deleted successfully"
}
```

- **Nagłówki (zalecane)**:
  - `Content-Type: application/json; charset=utf-8`
  - `Cache-Control: no-store`

### 4.2. Błędy

Wszystkie odpowiedzi błędów zwracają `ApiErrorResponseDTO`:

```json
{
  "error": "string",
  "details": "string | { [field: string]: string }"
}
```

Statusy (wg przyjętej decyzji: unified 404 + standardowe 400 dla invalid UUID):

- `400 Bad Request` — nieprawidłowy `id` (nie jest UUID)
- `401 Unauthorized` — brak autoryzacji
- `404 Not Found` — uczestnik nie istnieje lub nie należy do użytkownika
- `500 Internal Server Error` — błąd serwera

## 5. Przepływ danych

### 5.1. Przepływ wysokopoziomowy

1. **Middleware** (`src/middleware/index.ts`) weryfikuje `Authorization: Bearer <token>` i ustawia:
   - `locals.user`,
   - `locals.supabase` (authed Supabase client z JWT użytkownika; RLS działa automatycznie).
2. **Endpoint** (`DELETE /api/ai-participants/:id`) wykonuje guard clause:
   - jeśli `!locals.user` → `401 Unauthorized` (defense‑in‑depth; wzorzec z `src/pages/api/ai-participants.ts` i `src/pages/api/user-settings.ts`).
3. Endpoint waliduje `params.id` przez Zod:
   - jeśli invalid → `400 Bad Request` z `details: { id: "Invalid id" }`.
4. Endpoint wywołuje serwis:
   - `deleteAiParticipant({ supabase: locals.supabase, participantId: id })`
5. Serwis wykonuje **2-step** (z RLS): `SELECT` sprawdzający istnienie + `DELETE` i zwraca rezultat:
   - `deleted: true` → endpoint zwraca `200` i `{ message: "AI participant deleted successfully" }`
   - `deleted: false, error: null` → endpoint zwraca `404` (nie istnieje lub nie należy do użytkownika)
   - `deleted: false, error: { ... }` → endpoint zwraca `500`

### 5.2. Uproszczona implementacja z RLS (bez RPC)

**Decyzja:** Unified 404 dla "nie istnieje" i "nie należy do użytkownika"

**Uzasadnienie:**

- Security: Różnica między 403/404 to information disclosure
- Simplicity: Standardowy DELETE z RLS, zero custom RPC
- Industry standard: REST APIs zwykle zwracają 404 "not found or not accessible"

**Implementacja:**

```typescript
// Step 1: Check if participant exists (with RLS enforcing ownership)
const { data: participant, error: selectError } = await supabase
  .from("ai_participants")
  .select("id")
  .eq("id", participantId)
  .maybeSingle();

if (selectError) {
  return { deleted: false, error: { message: selectError.message, code: selectError.code } };
}

if (!participant) {
  // Not found or not owned by user (RLS filtered out) → unified 404
  return { deleted: false, error: null };
}

// Step 2: Delete (we know it exists and is owned by current user)
const { error: deleteError } = await supabase.from("ai_participants").delete().eq("id", participantId);

if (deleteError) {
  return { deleted: false, error: { message: deleteError.message, code: deleteError.code } };
}

return { deleted: true, error: null };
```

RLS policy automatycznie filtruje po `user_id = auth.uid()`, więc `SELECT` zwróci `null` i **nie wykonamy DELETE** jeśli:

- Uczestnik nie istnieje, lub
- Uczestnik należy do innego użytkownika

Oba przypadki → 404 w endpoint.

## 6. Względy bezpieczeństwa

- **Autoryzacja**:
  - endpoint chroniony przez middleware,
  - dodatkowy `if (!locals.user)` w handlerze jako defense‑in‑depth.
- **Autoryzacja zasobu (ownership / IDOR)**:
  - opiera się o RLS dla `ai_participants` (policy: `auth.uid() = user_id`),
  - celowo zwracamy **unified 404** dla "nie istnieje" i "nie należy do użytkownika" (security: no information disclosure / brak enumeracji UUID).
- **RLS**:
  - wszystkie operacje DB wykonywać przez `locals.supabase` (authed client z JWT użytkownika),
  - brak custom RPC / `security definer` dla tego endpointu.
- **Sekrety i logowanie**:
  - nie logować `Authorization` ani innych sekretów,
  - dla 5xx logować metadane (`route`, `method`, `status`, `supabase_error_code`) oraz opcjonalnie `participantId` (UUID nie jest sekretem).
- **Content-Type**:
  - nie dotyczy (DELETE bez body).

## 7. Obsługa błędów

### 7.1. Scenariusze błędów i statusy (wraz z severity)

- **401 Unauthorized**:
  - warunek: `!locals.user`
  - response: `jsonError(401, "Unauthorized", "Missing or invalid authentication token")`
  - logging: brak (expected flow)

- **400 Bad Request**:
  - warunek: `params.id` nie przechodzi Zod `.uuid()`
  - response: `jsonError(400, "Bad Request", { id: "Invalid id" })`
  - logging: brak (expected)

- **404 Not Found**:
  - warunek: serwis zwrócił `deleted: false, error: null` (RLS filtered out SELECT → brak dostępu do zasobu)
  - response: `jsonError(404, "Not Found", "AI participant not found")`
  - logging: brak (expected)
  - uwaga: Obejmuje oba przypadki: nieistniejący UUID i UUID należący do innego użytkownika (security: no information disclosure)

- **500 Internal Server Error**:
  - źródła:
    - błąd Supabase/DB podczas `SELECT` (np. błąd PostgREST / timeout),
    - błąd Supabase/DB podczas `DELETE`,
    - naruszenie kontraktu zwrotu serwisu (nieoczekiwany stan).
  - logging:
    - **regular** dla błędów DB: `console.error("AI participant delete failed", { route, method: "DELETE", status: 500, supabase_error_code })`
    - **CRITICAL** dla naruszeń inwariantów (np. `deleted: true` i jednocześnie `error != null`).

### 7.2. Wzorce do skopiowania (konkretne referencje)

- Skopiować helper `jsonError()` z `src/pages/api/ai-participants.ts` (format `ApiErrorResponseDTO` + `Content-Type`).
- Skopiować guard `if (!locals.user)` i styl logowania błędów Supabase z:
  - `src/pages/api/ai-participants.ts` (obiektowe logi, `severity: "CRITICAL"` dla invariant violations).

### 7.3. Rejestrowanie błędów w tabeli (jeśli dotyczy)

- W dostarczonych zasobach DB/spec nie ma tabeli do trwałego logowania błędów requestów dla tego endpointa, więc w MVP logujemy przez `console.error` (jak istniejące endpointy).

## 8. Wydajność

WYMAGANE:

- **Database query complexity**:
  - 1× `SELECT` po `ai_participants.id` (PK) → \(O(\log N)\)
  - 1× `DELETE` po `ai_participants.id` (PK) → \(O(\log N)\)
  - - efekt FK `ON DELETE SET NULL` w `messages`:
    * z indeksem `idx_messages_ai_participant_id` (mandatory w tym planie): \(O(\log M + k)\), gdzie \(k\) = liczba wiadomości asystenta powiązanych z usuwanym uczestnikiem
    * bez indeksu: potencjalnie \(O(M)\) (pełny skan tabeli `messages`) — dlatego indeks jest wymagany
- **Number of DB roundtrips**: 2 (1× SELECT sprawdzający istnienie z RLS + 1× DELETE).
  - Uzasadnienie: Supabase JS Client nie zwraca "affected rows" dla DELETE, wymagane SELECT do rozróżnienia "not found" (404) vs "deleted successfully" (200).
  - 2 roundtrips to akceptowalny koszt dla rzadkiej operacji (usuwanie uczestnika).
- **External API latency**: brak (0 wywołań do zewnętrznych API).
- **Worst-case total latency calculation**:
  - \(T_{worst} \approx T_{select} + T_{delete} + T_{fk\_update} + T_{serialize}\)
  - przy małym \(k\): \(T_{select} \approx 5\text{–}10ms\), \(T_{delete} \approx 10\text{–}50ms\), \(T_{serialize} < 5ms\) → ok. **20–65ms** (pomijając narzut sieciowy)
  - przy dużym \(k\): \(T_{fk\_update}\) dominuje (UPDATE wielu wierszy w `messages`)
- **Index usage**:
  - `ai_participants`: PK na `id` (implicit)
  - `messages`: partial index `idx_messages_ai_participant_id` na `ai_participant_id where ai_participant_id is not null` (dodany w kroku 2)

## 9. Kroki implementacji

1. **Dodać endpoint Astro dla path param**
   - Plik: `src/pages/api/ai-participants/[id].ts`
   - Wymagania frameworkowe:
     - `export const prerender = false`
     - `export const DELETE = async (context: APIContext) => { ... }` (uppercase)
   - Skopiować helper `jsonError()` z `src/pages/api/ai-participants.ts`.
   - Dodać `route = "/api/ai-participants/:id"` do logów.

2. **Dodać indeks dla FK `ON DELETE SET NULL`**
   - Plik: `supabase/migrations/20250114120600_create_indexes.sql` (edytuj istniejący - migracje jeszcze nie uruchomione)
   - Dodaj na końcu pliku:
   - SQL:

```sql
-- Index to prevent full table scan on messages during participant deletion
-- ON DELETE SET NULL triggers UPDATE on messages table
create index if not exists idx_messages_ai_participant_id
on messages(ai_participant_id)
where ai_participant_id is not null;
```

- Rationale:
  - Bez indeksu: DELETE może być \(O(M)\) gdzie \(M\) = total messages (full scan)
  - Z indeksem: DELETE jest \(O(\log M + k)\) gdzie \(k\) = messages tego uczestnika
  - Partial index (`where ... is not null`) bo user messages mają `NULL`

3. **Rozszerzyć serwis `ai-participants` o delete**
   - Plik: `src/lib/services/ai-participants.service.ts`
   - Dodać funkcję (2-step: SELECT + DELETE):

```typescript
async function deleteAiParticipant({
  supabase,
  participantId,
}: {
  supabase: SupabaseClient;
  participantId: string;
}): Promise<{ deleted: boolean; error: { message: string; code?: string } | null }> {
  // Step 1: Check if participant exists (with RLS enforcing ownership)
  const { data: participant, error: selectError } = await supabase
    .from("ai_participants")
    .select("id")
    .eq("id", participantId)
    .maybeSingle();

  if (selectError) {
    return { deleted: false, error: { message: selectError.message, code: selectError.code } };
  }

  if (!participant) {
    // Not found or not owned by user (RLS filtered out) → unified 404
    return { deleted: false, error: null };
  }

  // Step 2: Delete (we know it exists and is owned by current user)
  const { error: deleteError } = await supabase.from("ai_participants").delete().eq("id", participantId);

  if (deleteError) {
    return { deleted: false, error: { message: deleteError.message, code: deleteError.code } };
  }

  return { deleted: true, error: null };
}
```

- Return type: `{ deleted: boolean; error: ... | null }`
  - `deleted: true` → 200 OK
  - `deleted: false, error: null` → 404 Not Found (nie istnieje lub nie należy do użytkownika - RLS)
  - `deleted: false, error: <obj>` → 500 Internal Server Error (błąd bazy danych)
- Rationale dla `.maybeSingle()`: Participant może nie istnieć (404 expected), więc używamy `.maybeSingle()` zamiast `.single()` który rzuciłby error dla "no rows"

4. **Skopiować walidację parametrów (Zod) inline w endpoint**
   - Plik: `src/pages/api/ai-participants/[id].ts`
   - Zod schema location: inline (re-use ≤ 1), np. `ParamsSchema = z.object({ id: z.string().uuid("Invalid id") })`

5. **Zaimplementować flow handlera (guard clauses + happy path)**

   Przykład struktury handlera:

```typescript
// src/pages/api/ai-participants/[id].ts
import { z } from "zod";
import type { APIContext } from "astro";

export const prerender = false;

// Inline Zod schema (reuse ≤1)
const ParamsSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

export const DELETE = async (context: APIContext) => {
  const route = "/api/ai-participants/:id";
  const { locals, params } = context;

  // Guard 1: Auth (defense-in-depth)
  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  // Guard 2: Params validation
  const validation = ParamsSchema.safeParse(params);
  if (!validation.success) {
    return jsonError(400, "Bad Request", {
      id: validation.error.errors[0].message,
    });
  }

  const participantId = validation.data.id;

  // Service call
  const { deleted, error } = await deleteAiParticipant({
    supabase: locals.supabase,
    participantId,
  });

  if (error) {
    console.error("AI participant delete failed", {
      route,
      method: "DELETE",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "Failed to delete AI participant");
  }

  if (!deleted) {
    return jsonError(404, "Not Found", "AI participant not found");
  }

  return new Response(JSON.stringify({ message: "AI participant deleted successfully" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
```

6. **(Opcjonalnie) Smoke testy curl**
   - Plik: `.sketch/curl_-_smoke_testy_API.md`
   - Dodać przypadki:
     - 200: delete własnego participant
     - 400: invalid uuid
     - 404: uuid nieistniejący
     - 404: uuid istniejący, ale z innego usera (unified 404)
     - 401: brak Authorization

### Checklist przed finalizacją

- [ ] Zod schema: **inline w `src/pages/api/ai-participants/[id].ts`** (path param UUID)
- [ ] DB operations: decyzja dot. **unified 404** (nie istnieje / nie należy do użytkownika) jest jawna
- [ ] Service function signature: `deleteAiParticipant({ supabase, participantId })` zwraca `{ deleted: boolean; error: ... | null }`
- [ ] Wydajność: sekcja 8 zawiera wszystkie elementy WYMAGANE + uwzględnia koszt `ON DELETE SET NULL`
- [ ] Reused patterns: kroki zawierają „Skopiować … z …”
- [ ] Logging: każda ścieżka błędu ma określone severity (regular vs CRITICAL) i nie loguje sekretów
- [ ] Error scenarios: statusy 200/400/401/404/500 zgodne z przyjętą decyzją (unified 404)
