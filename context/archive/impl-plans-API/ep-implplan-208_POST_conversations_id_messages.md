## API Endpoint Implementation Plan: `POST /api/conversations/:id/messages`

## 1. Przegląd punktu końcowego

- **Metoda HTTP**: `POST`
- **URL**: `/api/conversations/:id/messages`
- **Cel**: Dodać nową wiadomość użytkownika do istniejącej konwersacji i zwrócić odpowiedź AI.
- **Autoryzacja**: **Wymagana** (user JWT → `context.locals.user` + `context.locals.supabase` ustawiane przez `src/middleware/index.ts`).
- **Uwaga krytyczna (spec)**: endpoint MUSI załadować **PEŁNĄ historię** konwersacji i wysłać ją jako kontekst do OpenRouter (non-streaming).
- **Ograniczenia implementacyjne**:
  - **NO RPC**: nie używamy `rpc()` do transakcji.
  - Zapis do bazy realizujemy jako **sekwencyjne `.insert()` + cleanup** (best-effort „atomiczność” na poziomie aplikacji).

## 2. Szczegóły żądania

- **Headers**:
  - `Authorization: Bearer <token>` (wymagane; middleware zwraca 401 dla braku/invalid token, ale endpoint trzyma guard `locals.user` jak inne endpointy)
  - `Content-Type: application/json` (wymagane; walidować przed `request.json()`)
- **Path params**:
  - `id` (uuid) — identyfikator konwersacji
- **Request body**:

```json
{
  "content": "string",
  "ai_participant_id": "uuid"
}
```

- **Walidacja (Zod, inline w pliku endpointu)**:
  - `params.id`:
    - required
    - `uuid("Invalid id")` (skopiować pattern z `src/pages/api/ai-participants/[id].ts`)
  - `content`:
    - required
    - `trim()`
    - min 1 znak po trim (nie może być puste)
    - max 10_000 znaków
  - `ai_participant_id`:
    - required
    - `uuid("Invalid ai_participant_id")`

## 3. Wykorzystywane typy (DTO / Command Models)

- `CreateMessageCommand` — `src/types.ts`
- `CreateMessageResponseDTO` — `src/types.ts`
- `ConversationMessageDTO` — `src/types.ts` (historyczne wiadomości + join `ai_participant`)
- `OpenRouterChatRequest`, `OpenRouterMessageContext` — `src/types.ts`
- `ApiErrorResponseDTO` — `src/types.ts`

## 4. Szczegóły odpowiedzi

- **201 Created** (success):

```json
{
  "user_message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "role": "user",
    "content": "string",
    "ai_participant_id": null,
    "ai_participant": null,
    "created_at": "ISO 8601 datetime"
  },
  "ai_message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "role": "assistant",
    "content": "string",
    "ai_participant_id": "uuid",
    "ai_participant": {
      "id": "uuid",
      "alias": "string",
      "model_id": "string",
      "color": "string (hex)"
    },
    "created_at": "ISO 8601 datetime"
  }
}
```

## 5. Przepływ danych (end-to-end)

1. **Auth guard**:
   - jeśli `!locals.user` → `401` (skopiować pattern z `src/pages/api/user-settings.ts` / `src/pages/api/conversations.ts`).
2. **Walidacja params (`id`)**:
   - `safeParse(context.params)` → `400 Bad Request` przy nieprawidłowym UUID (pattern z `src/pages/api/ai-participants/[id].ts`).
3. **Walidacja `Content-Type` + JSON parse**:
   - jeśli `Content-Type` nie zawiera `application/json` → `400` (skopiować z `src/pages/api/user-settings.ts`)
   - try/catch `await request.json()` → `400` dla invalid JSON.
4. **Walidacja body (Zod)**:
   - `safeParse(body)` → `400 Validation error` + `formatZodErrors()` (skopiować helper z `src/pages/api/ai-participants.ts`).
5. **Równoległy batch read-only (`Promise.all`)**:
   - Cztery zapytania read-only są niezależne i mogą lecieć równolegle:
     - **ownership check**: czy konwersacja istnieje i należy do usera (defense-in-depth)
     - **full history load**: wszystkie `messages` konwersacji (wymagane przez spec)
     - **AI participant summary**: `ai_participant_id` (model + pola summary)
     - **user settings**: `openrouter_api_key`
   - Uruchomić je w jednym batchu:
     - `Promise.all([ownershipResult, historyResult, participantResult, settingsResult])`
   - Uwaga: mimo równoległości, dalsza logika **nadal** mapuje te same warunki na 404/500 — zmienia się tylko latency (sekcja 8).
6. **Autoryzacja zasobu (czy konwersacja należy do użytkownika)**:
   - (w ramach batcha) Query: `conversations` po `id` + `user_id` (defense-in-depth):
     - `.from("conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle()`
     - `.maybeSingle()` bo konwersacja może nie istnieć.
   - Jeśli `null` → **404 Not Found** `"Conversation not found"`.
     - Uwaga: RLS + authed client sprawia, że konwersacja innego usera jest „niewidoczna”; zwracamy 404 (anty-enumeration, spójnie z `DELETE /api/ai-participants/:id`).
7. **Pobranie pełnej historii konwersacji** (WYMAGANE przez spec):
   - (w ramach batcha) Query do `messages` po `conversation_id` + sort ASC:
     - `.from("messages")`
     - `.select("id,conversation_id,role,content,ai_participant_id,created_at,ai_participant:ai_participants(id,alias,model_id,color)")`
     - `.eq("conversation_id", conversationId)`
     - `.order("created_at", { ascending: true })`
   - Zwracamy tablicę `ConversationMessageDTO[]`:
     - `ai_participant` będzie `null` dla roli `user` oraz gdy participant usunięty (FK `ON DELETE SET NULL`).
8. **Pobranie AI participant (model + summary) z `ai_participant_id`**:
   - (w ramach batcha) użyć `getAiParticipantSummary(locals.supabase, aiParticipantId)` z `src/lib/services/ai-participants.service.ts`
   - Jeśli `error` → log (regular) + `500`
   - Jeśli `data === null` → **404 Not Found** `"AI participant not found"`
     - Uwaga: **RLS zapewnia izolację** — participant innego usera zwróci `null` przez authed client, co mapujemy na 404 (anty-enumeration, spójnie z `DELETE /api/ai-participants/:id`).
9. **Pobranie OpenRouter API key**:
   - (w ramach batcha) `getUserSettings({ supabase: locals.supabase, userId })` (jak w `src/pages/api/openrouter-models.ts`)
   - jeśli `error` → log (regular) + `500`
   - jeśli `data === null` → log **CRITICAL** + `500` (naruszenie invariantu triggera)
   - jeśli `openrouter_api_key` pusty/whitespace → `401` `"No API key"` (skopiować `noApiKeyError()` z `src/pages/api/openrouter-models.ts` / `src/pages/api/conversations.ts`)
10. **Budowa kontekstu dla OpenRouter**:

- Zmapować historyczne `ConversationMessageDTO[]` do `OpenRouterMessageContext[]`:
  - `{ role: message.role, content: message.content }`
- Dodać na końcu nową wiadomość usera (jeszcze nie zapisaną w DB):
  - `{ role: "user", content: newContentTrimmed }`
- Request:
  - `{ model: participant.model_id, messages: [...historyContexts, newUserContext] }`

11. **Wywołanie OpenRouter** (non-streaming):
    - `sendChatCompletion(openrouterApiKey, requestPayload)` z `src/lib/services/openrouter.service.ts` (serwis sam ustawia `stream: false`)
    - Mapowanie błędów wg wzorca z `src/pages/api/conversations.ts`:
      - `OpenRouterTimeoutError` → `504 Gateway Timeout`
      - `OpenRouterNetworkError` → `502 Bad Gateway` (details: `"OpenRouter request failed"`)
      - `OpenRouterInvalidResponseError` → `502` z payloadem zgodnym ze spec (hardcoded, nie pass-through):
        - `error`: `"Invalid response"`
        - `details`: `"Received invalid response from OpenRouter. Please try again."`
      - `OpenRouterHttpError`:
        - status \(\ge 500\) lub 502/503 → `502`
        - w przeciwnym razie → `500` z `"OpenRouter API error"` i `details` 1:1 z `error.apiError.details` (spec: „exact message from OpenRouter”)
      - Inne → `500`
12. **Zapis pary wiadomości w DB (NO RPC, sekwencyjne `.insert()` + cleanup)**:
    - Wykonać dopiero po uzyskaniu `aiContent` (brak „sierot” przy błędach OpenRouter).
    - Sekwencja:
      1. `INSERT messages` (user) dla `conversation_id`:
         - `.single()` (INSERT zwraca dokładnie 1 row)
      2. `INSERT messages` (assistant) dla `conversation_id` i `ai_participant_id`:
         - `.single()`
    - **Cleanup**:
      - jeśli insert assistant fail po udanym insercie usera → `DELETE FROM messages WHERE id = <userMessageId>` (best-effort)
      - jeśli cleanup fail → log **CRITICAL** (ryzyko pozostawienia „połówki” wymiany)
      - (opcjonalnie) best-effort korekta `conversations.updated_at` po cleanup:
        - po usunięciu user message pobrać ostatnią wiadomość konwersacji (ORDER BY created_at DESC LIMIT 1) i ustawić `conversations.updated_at` na wartość zgodną z tym stanem.
        - Uwaga: to jest heurystyka bez transakcji; celem jest minimalizacja błędnego „bump” `updated_at` w przypadku rollbacku.
13. **Return 201**:
    - Zwrócić `CreateMessageResponseDTO`:
      - `user_message`: insert user + `ai_participant: null`
      - `ai_message`: insert assistant + `ai_participant: participantSummary`
    - Headers: `"Cache-Control": "no-store"` (jak w innych endpointach)

## 6. Względy bezpieczeństwa

- **RLS + authed client**:
  - Wszystkie zapytania wykonywać przez `context.locals.supabase` (zgodnie z `.cursor/rules/backend.mdc`).
  - Dodatkowo filtrować `.eq("user_id", locals.user.id)` tam gdzie ma to sens (conversations check) jako defense-in-depth.
- **Anty-enumeration**:
  - Dla zasobów chronionych RLS (conversations, ai_participants) preferujemy 404 gdy rekord jest niewidoczny (istnieje lub nie) — zgodnie z istniejącym `DELETE /api/ai-participants/:id`.
- **Content-Type validation**:
  - Wymagana dla POST (pattern z `src/pages/api/user-settings.ts`).
- **Ochrona sekretów i danych wrażliwych**:
  - Nie logować `openrouter_api_key`.
  - Nie logować pełnego `content` (można logować `content_length` i identyfikatory).
- **Limity wejścia**:
  - `content` max 10k znaków (ochrona kosztów i nadużyć).
- **Cache**:
  - `Cache-Control: no-store` dla odpowiedzi.

## 7. Obsługa błędów

### 400 Bad Request

- `Content-Type` ≠ `application/json`
- invalid JSON body
- invalid path param `id` (uuid)
- walidacja body (`content`, `ai_participant_id`) — `Validation error` + `formatZodErrors()`

### 401 Unauthorized

- brak/invalid token (`locals.user` falsy)

### 401 No API key

- brak skonfigurowanego `openrouter_api_key` (spójnie z `src/pages/api/openrouter-models.ts`)

### 404 Not Found

- konwersacja nie istnieje / nie jest widoczna dla usera (RLS)
- AI participant nie istnieje / nie jest widoczny dla usera (RLS)

### 500 Internal Server Error

- błędy Supabase (logować `supabase_error_code`, zwracać user-friendly message)
- brak `user_settings` mimo invariantu triggera → log **CRITICAL**
- `OpenRouterHttpError` dla statusów nie-mapowanych do 502/504 → `500` z `"OpenRouter API error"` i `details` z OpenRouter

### 502 Bad Gateway

- `OpenRouterNetworkError`
- `OpenRouterInvalidResponseError` (zwrócić hardcoded payload ze spec, nie pass-through):
  - `error`: `"Invalid response"`
  - `details`: `"Received invalid response from OpenRouter. Please try again."`
- `OpenRouterHttpError` z `status >= 500` lub 502/503

### 504 Gateway Timeout

- `OpenRouterTimeoutError`

### Logging severity (wymagane decyzje)

- **regular**:
  - supabase select/insert errors
  - OpenRouter errors (z `openrouter_status` w logach)
- **CRITICAL**:
  - `user_settings` missing (`getUserSettings()` zwraca `data: null`)
  - cleanup nieudany po częściowym zapisie pary wiadomości

## 8. Rozważania dotyczące wydajności (WYMAGANE)

- **Database query complexity**:
  - conversation ownership check po PK `conversations.id` (+ filtr po `user_id`) → \(O(1)\)
  - full history load: `messages` po `conversation_id` + sort po `created_at` → \(O(n)\) względem liczby wiadomości w konwersacji (to jest wymagane przez spec)
  - insert 2 wiadomości → \(O(1)\)
- **Liczba roundtripów do DB (typowo)**:
  - **Batch równoległy (1× `Promise.all`)**:
    - 1x select conversation (ownership)
    - 1x select messages history
    - 1x select ai_participant summary
    - 1x select user_settings
  - **Sekwencyjne inserty**:
    - 2x insert messages (user + assistant)
  - **Razem**: 6 roundtripów (4 równolegle + 2 sekwencyjnie)
  - **Effective DB latency** (happy path): ~**3 „sloty” roundtripów**:
    - 1x równoległy batch SELECT
    - 2x sekwencyjny INSERT
  - Cleanup (tylko w błędzie): +1 delete message (i opcjonalnie +2 do korekty `updated_at`)
- **External API latency (OpenRouter)**:
  - 1 request `POST /chat/completions`
  - timeout wg `OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000` z `src/lib/services/openrouter.service.ts`
- **Worst-case total latency**:
  - DB: 6 roundtripów, ale 4 z nich w równoległym batchu (typowo < ~0.5s DB overhead w typowej infra)
  - OpenRouter: do 30s przed timeoutem
  - **Worst-case**: ~30s + DB overhead (~0.3–0.5s) ⇒ ~30.3–30.5s
- **Index usage (istniejące, wg `.ai/ap4-db-plan-pl.md`)**:
  - `conversations.id` (PK)
  - `conversations.user_id` wspierane przez istniejący index `idx_conversations_user_id(user_id)` (ownership check i tak bazuje na PK; filtr po `user_id` to defense-in-depth)
  - `conversations(user_id, updated_at DESC)` istnieje jako `idx_conversations_user_updated(user_id, updated_at DESC)` (nie jest kluczowy dla tego endpointu, ale istnieje w schemacie)
  - `messages.conversation_id` wspierane przez `idx_messages_conversation_id(conversation_id)`
  - `messages(conversation_id, created_at ASC)` wykorzystuje istniejący composite index `idx_messages_conversation_created(conversation_id, created_at ASC)` dla chronologicznego ładowania historii
  - `ai_participants.id` (PK)
  - `user_settings.user_id` (UNIQUE → index)

## 9. Kroki implementacji (WYMAGANE)

### 9.1. Endpoint (Astro API route)

1. **Dodać plik** `src/pages/api/conversations/[id]/messages.ts`
   - `export const prerender = false;`
   - Skopiować `jsonError()` pattern z `src/pages/api/conversations.ts` (lub `src/pages/api/user-settings.ts`) — spójny `ApiErrorResponseDTO`
   - Skopiować `Content-Type` + JSON parse guards z `src/pages/api/user-settings.ts`
   - Skopiować `formatZodErrors()` z `src/pages/api/ai-participants.ts`
   - Skopiować walidację params (`z.object({ id: z.string().uuid(...) })`) z `src/pages/api/ai-participants/[id].ts`
   - Dodać inline Zod schema dla body (single-use, nie helper):
     - `content` trim + min(1) + max(10_000)
     - `ai_participant_id` uuid
   - Orkiestracja:
     - guard `locals.user`
     - walidacja params + body
     - uruchomienie 4 zapytań read-only w `Promise.all` (ownership + historia + settings + participant)
     - call `sendChatCompletion()` + mapowanie błędów (skopiować z `src/pages/api/conversations.ts`)
     - zapis pary wiadomości (serwis, patrz 9.2) + cleanup
     - return `201` + `Cache-Control: no-store`

### 9.2. Serwis: Conversation aggregate (DB queries + cleanup)

2. **Zaktualizować plik** `src/lib/services/conversations.service.ts`
   - Dodać funkcje (object params, bo >3 parametry i czytelność):
     - `assertConversationOwnedByUser({ supabase, userId, conversationId }): Promise<{ owned: boolean; error: { message: string; code?: string } | null }>`
       - query: `conversations` `.maybeSingle()`
       - rationale: record może nie istnieć
     - `getConversationMessages({ supabase, conversationId }): Promise<{ data: ConversationMessageDTO[] | null; error: { message: string; code?: string } | null }>`
       - query: `messages` + join `ai_participant` + `order(created_at ASC)`
       - rationale: musi zwrócić **pełną historię** (spec)
     - `createMessagePairWithCleanup({ supabase, conversationId, userContent, aiContent, aiParticipantId, participantSummary }): Promise<{ data: CreateMessageResponseDTO | null; error: { message: string; code?: string; cleanupFailed?: boolean; cleanupError?: { message: string; code?: string } } | null }>`
       - 2 sekwencyjne inserty w `messages` (oba `.single()`)
       - w razie błędu po insercie usera → delete user message (cleanup)
       - jeśli cleanup fail → ustaw `cleanupFailed: true` (endpoint loguje **CRITICAL**)

### 9.3. Checklist końcowy (z promptu)

- [ ] Zod schemas: inline w `src/pages/api/conversations/[id]/messages.ts` (single-use) + uzasadnienie
- [ ] Każda operacja DB ma jawne `.single()` vs `.maybeSingle()` + uzasadnienie
- [ ] Sygnatury serwisów są jawne (async, params, return type)
- [ ] Sekcja 8 zawiera: complexity, roundtrips, external latency, worst-case, index usage
- [ ] Kroki implementacji używają “Skopiować … z …” dla reuse patternów
- [ ] Logowanie ma „regular vs CRITICAL” opisane i spójne z istniejącymi endpointami
- [ ] POST ma Content-Type validation przed `request.json()`
