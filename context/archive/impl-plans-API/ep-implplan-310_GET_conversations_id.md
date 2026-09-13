## API Endpoint Implementation Plan: `GET /api/conversations/:id`

## 1. Przegląd punktu końcowego

- **Metoda HTTP**: `GET`
- **URL**: `/api/conversations/:id`
- **Cel**: Pobrać szczegóły pojedynczej konwersacji zalogowanego użytkownika **wraz ze wszystkimi wiadomościami** (MVP: bez pagination).
- **Autoryzacja**: **Wymagana** (`context.locals.user` + `context.locals.supabase` ustawiane przez `src/middleware/index.ts`).
- **Wymogi spec**:
  - wszystkie wiadomości ładowane na raz (brak pagination w MVP)
  - wiadomości posortowane po `created_at ASC` (chronologicznie)
  - dla `role='user'`: `ai_participant_id` i `ai_participant` są zawsze `null`
  - dla `role='assistant'` z usuniętym uczestnikiem: `ai_participant_id` jest `null` i `ai_participant` jest `null`

## 2. Szczegóły żądania

- **Headers**:
  - `Authorization: Bearer <token>` (wymagane; endpoint ma guard `locals.user` jak inne endpointy)
- **Parametry URL**:
  - **Wymagane**:
    - `id` (uuid) — identyfikator konwersacji
- **Query params**: brak (MVP)
- **Request Body**: brak
- **Walidacja (Zod)**:
  - Zod schema **inline w pliku endpointu** (używana tylko tutaj):
    - `paramsSchema = z.object({ id: z.string().uuid("Invalid id") })`
  - Błąd walidacji params → `400 Bad Request` (to nie jest wprost w spec, ale jest poprawnym kodem dla invalid input i jest zgodne z zasadami globalnymi z promptu).

## 3. Wykorzystywane typy (DTO / Command Models)

Z `src/types.ts`:

- `ConversationDTO` — podstawowy typ konwersacji (row), używany w serwisie do zwrotu metadanych konwersacji
- `ConversationDetailsDTO` — kształt odpowiedzi `200 OK` (conversation + `messages`)
- `ConversationMessageDTO` — element tablicy `messages`
- `AiParticipantSummaryDTO` — zagnieżdżony obiekt `ai_participant` w wiadomości (lub `null`)
- `ApiErrorResponseDTO` — standardowy kształt błędów

## 4. Szczegóły odpowiedzi

### 200 OK

Zwraca pojedynczy obiekt `ConversationDetailsDTO`:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "string",
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime",
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "role": "user | assistant",
      "content": "string",
      "ai_participant_id": "uuid | null",
      "ai_participant": {
        "id": "uuid",
        "alias": "string",
        "model_id": "string",
        "color": "string (hex)"
      },
      "created_at": "ISO 8601 datetime"
    }
  ]
}
```

### Headers (success i error)

- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store` (odpowiedź jest user-specific i zawiera treści wiadomości)

## 5. Przepływ danych (end-to-end)

1. **Auth guard**:
   - jeśli `!locals.user` → `401 Unauthorized`
   - Skopiować wzorzec z:
     - `src/pages/api/conversations.ts` (`GET` guard)
     - lub `src/pages/api/conversations/[id]/messages.ts` (`POST` guard)

2. **Walidacja `params.id` (uuid)**:
   - `paramsSchema.safeParse(context.params)`
   - jeśli invalid → `400 Bad Request` + `{ id: "Invalid id" }`
   - Skopiować wzorzec walidacji params z `src/pages/api/conversations/[id]/messages.ts`.

3. **Autoryzacja i istnienie konwersacji (403 vs 404) — decyzja + alternatywy**
   - Spec wymaga rozróżnienia:
     - `403 Forbidden` — konwersacja nie należy do usera
     - `404 Not Found` — konwersacja nie istnieje

   W Supabase z RLS i klientem authed (`locals.supabase`) typowa polityka `USING (auth.uid() = user_id)` powoduje, że rekordy innych użytkowników są **niewidoczne** (zachowują się jak “not found”), więc sama aplikacja **nie potrafi** wiarygodnie odróżnić `403` od `404` bez dodatkowego mechanizmu.

   **Podejście A (MVP, rekomendowane security-first; zgodne z “no service role / no RPC”) — zwraca 404 dla obu przypadków**
   - Query: `.from("conversations").select(...).eq("id", id).eq("user_id", userId).maybeSingle()`
   - Jeśli brak rekordu → `404 Not Found` (“Conversation not found”)
   - Uwaga: **RLS zapewnia izolację** — konwersacja innego usera zwróci `null` przez authed client, co mapujemy na 404 (anty-enumeration / information disclosure).
   - Trade-off: nie spełnia literalnie spec (brak `403`), ale:
     - jest spójne z już istniejącym zachowaniem `POST /api/conversations/:id/messages` (tam też brak rozróżnienia, zwraca `404`)
     - ogranicza enumerację zasobów (bezpieczniejsze)

   **Podejście B (spec-correct; wymaga zmian po stronie DB, nadal bez RPC i bez service role) — umożliwia 403**
   - Cel: móc sprawdzić “czy konwersacja istnieje” niezależnie od właściciela, bez ujawniania treści.
   - Wymaga DB-level rozwiązania (jedno z):
     - dodatkowa polityka/privileges umożliwiające odczyt minimalnych danych (np. tylko `conversations.id` / `conversations.user_id`) dla authed users
     - osobny “index table/view” z mapą `conversation_id -> owner_id` o ograniczonych uprawnieniach
   - Przepływ:
     - 1. existence check po `id` → jeśli nie ma → `404`
     - 2. jeśli istnieje, ale `owner_id !== locals.user.id` → `403`
     - 3. jeśli należy do usera → pobrać pełne dane + wiadomości i zwrócić `200`
   - Trade-off: wymaga pracy na DB (migracje/RLS/privileges) i świadomej decyzji o ujawnianiu istnienia zasobu (enumeration risk).

   **Podejście C (spec-correct; niezalecane / wbrew zasadom) — service role / admin**
   - Server-side existence check przez service role, potem 403/404.
   - Trade-off: łamie zasadę “Never use `SUPABASE_SERVICE_ROLE_KEY` for user-facing endpoints”.

   **Jawna decyzja w tym planie**:
   - Implementujemy **Podejście A** (404 dla “not found” i “not owned”) w MVP.
   - Jeśli Product/Spec koniecznie wymaga `403`, dopiero wtedy wdrażamy Podejście B (DB support) jako osobne zadanie.

4. **Pobranie wiadomości (chronologicznie)**:
   - wywołać serwis `getConversationMessages({ supabase, conversationId })` z `src/lib/services/conversations.service.ts`
   - serwis już:
     - joinuje `ai_participant:ai_participants(id,alias,model_id,color)`
     - sortuje `.order("created_at", { ascending: true })`
     - normalizuje join (czasem array vs object) do `AiParticipantSummaryDTO | null`

5. **Złożenie odpowiedzi**:
   - złożyć `ConversationDetailsDTO`:
     - conversation row (`id,user_id,title,created_at,updated_at`)
     - `messages: ConversationMessageDTO[]`
   - zwrócić `200` + `Cache-Control: no-store`

## 6. Względy bezpieczeństwa

- **Supabase authed client**:
  - wszystkie operacje wykonywać przez `context.locals.supabase` (zgodnie z `.cursor/rules/backend.mdc`)
- **Defense-in-depth**:
  - filtr `.eq("user_id", locals.user.id)` w zapytaniu o konwersację (nawet jeśli RLS istnieje)
- **Ochrona przed enumeracją**:
  - przy podejściu A: brak rozróżnienia 403/404 zmniejsza ujawnianie informacji o istnieniu zasobu
- **Brak logowania treści**:
  - nie logować `title` ani `messages.content`
  - logować tylko metadane: `route`, `method`, `status`, `supabase_error_code`
- **Cache**:
  - zawsze `Cache-Control: no-store`

## 7. Obsługa błędów

### 400 Bad Request

- invalid `id` (niepoprawny uuid) z Zod:
  - response: `jsonError(400, "Bad Request", { id: "..." })`
  - logowanie: **bez** (błąd klienta), ewentualnie `console.warn` (regular) jeśli chcemy.

### 401 Unauthorized

- `locals.user` falsy (brak / invalid token)

### 403 Forbidden (tylko jeśli wdrożymy Podejście B)

- konwersacja istnieje, ale nie należy do użytkownika
- response: `jsonError(403, "Forbidden", "Conversation does not belong to the user")`

### 404 Not Found

- konwersacja nie istnieje **lub** (w Podejściu A) nie należy do usera
- response: `jsonError(404, "Not Found", "Conversation not found")`

### 500 Internal Server Error

- błąd zapytania Supabase (np. `.maybeSingle()` lub select messages)
- log **regular**:
  - `route`, `method`, `status`, `supabase_error_code`
- response: `jsonError(500, "Internal Server Error", "An unexpected error occurred")`

### Logging severity (jawna decyzja)

- **regular**:
  - każdy błąd Supabase (`error` z query)
  - “fallback / unexpected shape” (jeśli pojawi się) jako `console.warn`
- **CRITICAL**:
  - stan nieoczekiwany typu:
    - brak `conversation` bez błędu w sytuacji, gdy wcześniej uznaliśmy zasób za istniejący (dotyczyłoby Podejścia B)
    - `getConversationMessages()` zwraca `data: null` bez `error` (analogicznie do `src/pages/api/conversations/[id]/messages.ts`, gdzie to jest CRITICAL)

## 8. Wydajność (WYMAGANE)

- **Database query complexity**:
  - lookup konwersacji po `id` (PK) → \(O(1)\)
  - pobranie wiadomości po `conversation_id` → \(O(n)\) po liczbie wiadomości w konwersacji \(n\)
- **Number of DB roundtrips**:
  - rekomendowana implementacja: **2** roundtripy:
    - 1. conversation
    - 2. messages (z joinem participant summary)
  - (opcjonalnie) 1 roundtrip przez nested select z `conversations(messages(...))`, ale komplikuje sortowanie/normowanie (patrz kroki implementacji).
- **External API latency**:
  - brak (endpoint nie woła OpenRouter)
- **Worst-case total latency calculation**:
  - ~ \(T \approx T_{conv\_select} + T_{messages\_select}\)
  - dla dużego \(n\): dominuje transfer payload + sort po stronie DB (jeśli brak dobrego indeksu na `(conversation_id, created_at)`).
- **Index usage (które indeksy są używane dla tego endpointu)**:
  - `conversations_pkey(id)` — lookup po `id`
  - `messages`:
    - indeks po FK `conversation_id` (typowo istnieje) — filtr `.eq("conversation_id", id)`
    - rekomendowany (jeśli nie istnieje): composite `(conversation_id, created_at)` — wspiera filtr + `ORDER BY created_at ASC`

## 9. Kroki implementacji (WYMAGANE)

### 9.1. Serwis (warstwa usług)

1. **Zaktualizować plik** `src/lib/services/conversations.service.ts`
   - Dodać funkcję serwisową do pobrania “conversation shell” (bez messages):
     - `getConversationForUserById({ supabase, userId, conversationId })`
   - **Sygnatura** (object params dla spójności z istniejącymi funkcjami w tym pliku):
     - params: `{ supabase: SupabaseClient; userId: string; conversationId: string }`
     - return: `Promise<{ data: ConversationDTO | null; error: { message: string; code?: string } | null }>`
   - **Zapytanie**:
     - `.from("conversations")`
     - `.select("id,user_id,title,created_at,updated_at")`
     - `.eq("id", conversationId)`
     - `.eq("user_id", userId)` (defense-in-depth)
     - `.maybeSingle()`
   - **Decyzja `.single()` vs `.maybeSingle()`**:
     - `.maybeSingle()` ponieważ rekord **nie jest gwarantowany** (może nie istnieć / nie należeć do usera).
   - **Relacja do istniejącej funkcji `assertConversationOwnedByUser()`**:
     - Obie funkcje używają tego samego wzorca query: `.eq("id", ...).eq("user_id", ...).maybeSingle()`
     - `assertConversationOwnedByUser()` selectuje tylko `"id"` i zwraca boolean (`owned`) — jest optymalna dla endpointów, które nie potrzebują metadanych konwersacji (np. `POST /api/conversations/:id/messages`)
     - `getConversationForUserById()` zwraca pełny row (`ConversationDTO`) — potrzebne dla `GET /api/conversations/:id`
     - **Jawna decyzja (MVP)**: **nie refaktorujemy** `assertConversationOwnedByUser()` w tym EP (minimalny scope, brak churnu w istniejących endpointach). Duplikacja jest mała i czytelna; ewentualny refactor rozważyć dopiero, gdy >1 endpoint będzie potrzebował “shell” konwersacji.
       - W szczególności: **nie zmieniamy** implementacji ani zachowania `POST /api/conversations/:id/messages` (`src/pages/api/conversations/[id]/messages.ts`) — nadal korzysta z `assertConversationOwnedByUser()` bez zmian.

2. **Nie implementować** orkiestratora `getConversationDetailsForUser(...)` w MVP:
   - 1 consumer, ~5 linii kompozycji w handlerze → YAGNI (zgodnie z feedbackiem).

### 9.2. Endpoint (Astro API route)

3. **Dodać nowy plik** `src/pages/api/conversations/[id].ts`
   - `export const prerender = false;`
   - `const route = "/api/conversations/:id";`
   - Skopiować `jsonError()` helper:
     - najlepiej z `src/pages/api/conversations/[id]/messages.ts` (ten sam poziom i shape)
   - Dodać `paramsSchema` inline:
     - skopiować z `src/pages/api/conversations/[id]/messages.ts`
   - Dodać handler:
     - `export const GET = async (context: APIContext) => { ... }`

4. **Implementacja handlera `GET`** (orkiestracja):
   - Guard `locals.user` → `401` (skopiować z `src/pages/api/user-settings.ts` lub `src/pages/api/conversations.ts`)
   - Walidacja params → `400` (skopiować z `src/pages/api/conversations/[id]/messages.ts`)
   - Pobranie konwersacji:
     - call `getConversationForUserById({ supabase: locals.supabase, userId: locals.user.id, conversationId: id })`
     - jeśli `error` → log (regular) + `500`
     - jeśli `data === null` → `404` (w MVP, Podejście A)
   - Pobranie wiadomości:
     - call `getConversationMessages({ supabase: locals.supabase, conversationId: id })`
     - jeśli `error` → log (regular) + `500`
     - jeśli `data === null` bez error → log (CRITICAL) + `500`
   - Złożyć `ConversationDetailsDTO` i zwrócić `200`:
     - `Cache-Control: no-store`
     - `Content-Type: application/json; charset=utf-8`

### 9.3. (Opcjonalnie) Praca DB pod spec `403` vs `404`

5. Jeśli wymagane jest literalne spełnienie `403 Forbidden` dla “not owned”, dodać osobny task na DB:
   - zaprojektować mechanizm existence check bez ujawniania treści (Podejście B z sekcji 5)
   - ocenić ryzyko enumeracji i zgodność z “RLS isolation”

### 9.4. Smoke testy (manualne)

6. Dodać/uzupełnić wpis w `.sketch/curl_-_smoke_testy_API.md` (jeśli ten plik jest używany jako checklista):
   - `GET /api/conversations/:id` z poprawnym tokenem i własnym `id` → `200`
   - `GET /api/conversations/:id` z poprawnym tokenem i nieistniejącym `id` → `404`
   - `GET /api/conversations/:id` bez tokena → `401`
   - invalid uuid → `400`
   - `GET /api/conversations/:id` dla konwersacji zawierającej wiadomość `role="assistant"` po usuniętym participant → weryfikacja, że `ai_participant: null` (i `ai_participant_id: null`) jest poprawnie zwracane

## Checklist końcowy (z promptu)

- [ ] All Zod schemas have explicit location (inline vs helper with rationale)
- [ ] All database operations specify `.single()` or `.maybeSingle()` with rationale based on invariants
- [ ] All service function signatures are explicit (async, params, return type)
- [ ] Section 8 (Performance) includes all WYMAGANE elements
- [ ] Section 9 (Implementation steps) uses “Skopiować … z …” for reused patterns
- [ ] All logging statements specify severity (regular vs CRITICAL)
- [ ] Security section addresses Content-Type validation for POST/PUT endpoints (N/A dla GET — jawnie pominięte)
- [ ] Error scenarios include exact HTTP status codes from API specification (or noted MVP deviation for 403/404)
