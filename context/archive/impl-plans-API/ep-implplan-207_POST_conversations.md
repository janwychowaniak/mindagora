## API Endpoint Implementation Plan: `POST /api/conversations`

## 1. Przegląd punktu końcowego

- **Metoda HTTP**: `POST`
- **URL**: `/api/conversations`
- **Cel**: Utworzenie nowej konwersacji wraz z pierwszą wymianą (wiadomość użytkownika + odpowiedź AI).
- **Autoryzacja**: **Wymagana** (user JWT → `context.locals.user` ustawiany przez `src/middleware/index.ts`).
- **Kluczowe reguły biznesowe**:
  - Użytkownik **musi mieć min. 2 AI participants** przed rozpoczęciem konwersacji.
  - `ai_participant_id` musi istnieć i (logicznie) należeć do użytkownika.
  - Konwersacja powinna powstać **dopiero po udanej odpowiedzi z OpenRouter** (brak “pustych” konwersacji).
  - **NO RPC**: brak transakcji przez `rpc()`; użyć **sekwencyjnych `.insert()` + cleanup** (kasowanie w razie błędu).

## 2. Szczegóły żądania

- **Headers**:
  - `Authorization: Bearer <token>` (wymagane; w praktyce egzekwowane przez middleware, ale endpoint robi guard jak w istniejących implementacjach)
  - `Content-Type: application/json` (wymagane; walidować jak w `src/pages/api/user-settings.ts`)
- **Request body**:

```json
{
  "title": "string (optional)",
  "user_message": "string",
  "ai_participant_id": "uuid"
}
```

- **Walidacja (Zod, inline w pliku endpointu)**:
  - `title`:
    - optional
    - `trim()`
    - max 100 znaków
    - jeśli po `trim()` pusty → traktować jak `undefined` (jak “brak”)
  - `user_message`:
    - required
    - `trim()`
    - min 1 znak po trim (nie może być puste)
    - max 10_000 znaków
  - `ai_participant_id`:
    - required
    - `uuid()`
- **Generowanie tytułu**:
  - jeśli `title` nie podano lub jest pusty po trim:

```typescript
const autoTitle = user_message_trimmed.slice(0, 50) + "...";
```

- Zawsze dodajemy `"..."` zgodnie z literal spec ("50 znaków + ...")
- Edge case: krótkie wiadomości (≤50 znaków) będą miały `"..."` na końcu (np. `"Hi"...`)

## 3. Wykorzystywane typy

- **Command model**: `CreateConversationCommand` z `src/types.ts`
- **Response DTO**: `CreateConversationResponseDTO` (= `ConversationDetailsDTO`) z `src/types.ts`
- **OpenRouter request**: `OpenRouterChatRequest` / `OpenRouterMessageContext` z `src/types.ts`
- **Błędy**: `ApiErrorResponseDTO` z `src/types.ts`

## 4. Szczegóły odpowiedzi

- **201 Created** (success):

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
      "role": "user",
      "content": "string",
      "ai_participant_id": null,
      "ai_participant": null,
      "created_at": "ISO 8601 datetime"
    },
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "role": "assistant",
      "content": "string",
      "ai_participant_id": "uuid",
      "ai_participant": {
        "id": "uuid",
        "alias": "string",
        "model_id": "string",
        "color": "string"
      },
      "created_at": "ISO 8601 datetime"
    }
  ]
}
```

- **Kolejność `messages` w response**:
  - User message **PRZED** assistant message (chronologicznie)
  - Budując array: `[userMsg, aiMsg]` zgodnie z kolejnością insercji

- **Uwaga dot. `updated_at`**:
  - w DB jest trigger aktualizujący `conversations.updated_at` przy insert message.
  - jeżeli endpoint buduje odpowiedź z wyników `.insert().select().single()` (bez dodatkowego SELECT) — `updated_at` może nie odzwierciedlać wartości po triggerze.
  - decyzja:
    - **preferowane**: po wstawieniu 2 wiadomości wykonać dodatkowy `SELECT conversations` po `id` (1 roundtrip) aby zwrócić finalne `updated_at`.

## 5. Przepływ danych

1. **Auth guard**:
   - jeżeli `!locals.user` → `401` (skopiować pattern z `src/pages/api/user-settings.ts`).
2. **Walidacja `Content-Type`**:
   - jeśli brak / nie zawiera `application/json` → `400` (skopiować pattern z `src/pages/api/ai-participants.ts` i `src/pages/api/user-settings.ts`).
3. **Parsowanie JSON**:
   - try/catch `await request.json()` → `400` dla invalid JSON.
4. **Walidacja Zod** (inline):
   - `safeParse`, błędy formatować helperem `formatZodErrors()` (skopiować pattern z `src/pages/api/ai-participants.ts`).
5. **Weryfikacja precondition: min 2 AI participants**:
   - query do `ai_participants` z `count: "exact", head: true` + `.eq("user_id", userId)`
   - jeśli `count < 2` → `400`:
     - `error`: `"Validation error"`
     - `details`: `"User must have at least 2 AI participants to start a conversation"`
6. **Pobranie `user_settings`**:
   - użyć `getUserSettings()` z `src/lib/services/user-settings.service.ts`
   - jeśli `error` → log (regular) + `500`
   - jeśli `data === null` → log **CRITICAL** + `500` (naruszenie invariantu).
   - jeśli `openrouter_api_key` pusty/whitespace → `401` `"No API key"` (skopiować zachowanie z `src/pages/api/openrouter-models.ts`).
7. **Pobranie AI participant**:
   - `.select("id,alias,model_id,color").eq("id", aiParticipantId).maybeSingle()`
   - jeśli `data === null` → `404 Not Found`
     - RLS policies uniemożliwiają odróżnienie "nie istnieje" vs "nie należy do usera"
     - To jest security feature (no user enumeration) — zgodne z `DELETE /api/ai-participants/:id`
   - jeśli `data !== null` → mamy participant (RLS gwarantuje ownership)
   - select bez `user_id`, bo:
     - RLS automatycznie filtruje po `auth.uid() = user_id`
     - `user_id` nie jest potrzebne w response (tylko pola summary)
8. **Wywołanie OpenRouter**:
   - `sendChatCompletion(openrouterApiKey, { model: participant.model_id, messages: [{ role: "user", content: user_message_trimmed }] })`
   - obsługa błędów wg sekcji 7 (mapowanie na 500/502/504).
9. **Zapis do DB (NO RPC, sekwencyjne `.insert()` z cleanup)**:
   - wykonać dopiero po uzyskaniu `aiContent` (unikamy pustych konwersacji przy błędach OpenRouter).
   - sekwencja:
     1. `INSERT conversations` (`user_id`, `title`)
     2. `INSERT messages` (user)
     3. `INSERT messages` (assistant, `ai_participant_id`)
   - jeśli 2) lub 3) fail → cleanup:
     - `DELETE FROM conversations WHERE id = <conversationId>` (CASCADE usuwa messages)
     - jeśli cleanup fail → log **CRITICAL** (ryzyko “pustej” konwersacji) + `500`.
10. **Budowa odpowiedzi**:
    - w odpowiedzi zwrócić `conversation` + `messages` (2 sztuki) z dołączonym:
      - dla user message: `ai_participant: null`
      - dla assistant message: `ai_participant` z participant summary (`id, alias, model_id, color`)
    - (opcjonalnie, preferowane) doładować finalne `updated_at` przez dodatkowy `SELECT conversations` po `id`.

## 6. Względy bezpieczeństwa

- **Autentykacja**:
  - Middleware już blokuje większość żądań bez tokenu, ale endpoint zachowuje guard `locals.user` jak w istniejących endpointach.
- **Autoryzacja / izolacja danych**:
  - używać `locals.supabase` (authed client z JWT) zgodnie z `.cursor/rules/backend.mdc`.
  - dodatkowy `.eq("user_id", locals.user.id)` jako defense-in-depth (zgodnie z invariants).
- **Content-Type validation**:
  - wymagana dla `POST` (zabezpiecza przed błędnymi payloadami i niejednoznacznością parsowania).
- **Nie logować sekretów**:
  - nie logować `openrouter_api_key`
  - nie logować pełnych treści `user_message` (można logować długość i `conversationId`).
- **Ograniczenia payloadu**:
  - max 10_000 znaków na `user_message` (ochrona przed nadużyciami i kosztami OpenRouter).
- **Cache**:
  - odpowiedzi `Cache-Control: no-store` (kopiować z istniejących endpointów).

## 7. Obsługa błędów

### Błędy wejścia / klienta

- **400 Bad Request**:
  - `Content-Type` nie jest `application/json`
  - invalid JSON body
  - błędy walidacji Zod (pola `title`, `user_message`, `ai_participant_id`)
  - użytkownik ma `<2` AI participants (zgodnie ze spec)
- **401 Unauthorized**:
  - brak/niepoprawny token (jak w `src/pages/api/user-settings.ts`)
  - (spójnie z `src/pages/api/openrouter-models.ts`) brak skonfigurowanego OpenRouter API key → `401` `"No API key"`
- **404 Not Found**:
  - `ai_participant_id` nie istnieje (lub niewidoczny dla użytkownika)

### Błędy serwera / integracji OpenRouter

- **504 Gateway Timeout**:
  - `OpenRouterTimeoutError`
- **502 Bad Gateway**:
  - `OpenRouterNetworkError`
  - `OpenRouterInvalidResponseError`
  - `OpenRouterHttpError` z `status >= 500` lub `status` w `{502, 503}`
- **500 Internal Server Error**:
  - błędy Supabase (`error.code` logować; nie zwracać surowych komunikatów)
  - naruszenie invariantu: `user_settings` missing → log **CRITICAL**
  - `OpenRouterHttpError` dla pozostałych statusów (np. 401/402/429) → zwrócić:
    - `error`: `"OpenRouter API error"`
    - `details`: komunikat z OpenRouter (np. `error.apiError.details`)

### Logging (wzorować na istniejących endpointach)

- **Regular**:
  - supabase query errors
  - openrouter errors z mapowaniem statusu
- **CRITICAL**:
  - `getUserSettings()` zwraca `data: null` (invariant violation)
  - cleanup po częściowej insercji nieudany (ryzyko pozostawienia niespójnych danych)

## 8. Rozważania dotyczące wydajności (WYMAGANE)

- **Database query complexity**:
  - count AI participants: \(O(1)\) dla selekcji po `user_id` z użyciem indeksu (np. `UNIQUE(user_id, alias)` wspiera filtr po `user_id`).
  - lookup AI participant po `id`: \(O(1)\) (PK index na `ai_participants.id`).
  - insert `conversations` + `messages`: \(O(1)\) (wstawienia po PK).
- **Liczba roundtripów do DB (szacunkowo)**:
  - 1x count ai_participants
  - 1x select ai_participant
  - 1x select user_settings
  - 3x insert (conversation, user message, assistant message)
  - +1x (preferowane) select conversation po insercji messages dla aktualnego `updated_at`
  - **Razem**: 6–7 DB roundtripów (bez cleanup).
  - Cleanup (tylko w błędzie): 1x delete conversation.
- **External API latency (OpenRouter)**:
  - 1 request `POST /chat/completions`
  - timeout wg `OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000` (z `src/lib/services/openrouter.service.ts`)
- **Worst-case total latency (górne oszacowanie)**:
  - DB: ~6–7 roundtripów (zwykle < 1s łącznie w typowej infra)
  - OpenRouter: do 30s przed timeoutem
  - **Worst-case**: ~30s + DB overhead (~0.5–1s) ⇒ ~31s
- **Index usage**:
  - `user_settings.user_id` (UNIQUE → index) dla pobrania ustawień
  - `ai_participants.id` (PK index) dla lookup uczestnika
  - `ai_participants(user_id, alias)` (UNIQUE → index) wspiera filtr po `user_id` (np. count)
  - `conversations.id` (PK index) dla ewentualnego reselect/cleanup

## 9. Kroki implementacji (WYMAGANE)

### 9.1. Nowy endpoint

1. **Dodać plik** `src/pages/api/conversations.ts`
   - `export const prerender = false;`
   - Skopiować `jsonError()` pattern z `src/pages/api/ai-participants.ts`
   - Skopiować `Content-Type` + JSON parse guards z `src/pages/api/user-settings.ts`
   - Skopiować `formatZodErrors()` pattern z `src/pages/api/ai-participants.ts`
   - Zdefiniować inline schema `createConversationSchema` (Zod) zgodnie z sekcją 2.
   - Obsłużyć `POST`:
     - guard `locals.user`
     - walidacja inputu (Zod)
     - precondition: min 2 AI participants (patrz 9.2)
     - pobranie user_settings → openrouter_api_key
     - pobranie ai_participant (model_id + summary)
     - `sendChatCompletion()` + mapowanie błędów (kopiować podejście z `src/pages/api/openrouter-models.ts`)
     - wywołać serwis DB do zapisu konwersacji i wiadomości (9.3)
     - zwrócić `201` + `Cache-Control: no-store`

### 9.2. Serwis: operacje na AI participants (count + lookup)

2. **Zaktualizować plik** `src/lib/services/ai-participants.service.ts`
   - Dodać:
     - `countAiParticipants(supabase: SupabaseClient, userId: string): Promise<{ count: number | null; error: { message: string; code?: string } | null }>`
       - Positional params (2 argumenty ≤3) — zgodnie z wzorcem `getUserSettings()`
       - implementacja: `.from("ai_participants").select("id", { count: "exact", head: true }).eq("user_id", userId)`
       - `.single()` **nie dotyczy** (to nie jest select row); użyć `count` z odpowiedzi.
     - `getAiParticipantSummary(supabase: SupabaseClient, participantId: string): Promise<{ data: AiParticipantSummaryDTO | null; error: { message: string; code?: string } | null }>`
       - Positional params (2 argumenty ≤3)
       - implementacja: `.select("id,alias,model_id,color").eq("id", participantId).maybeSingle()`
       - `.maybeSingle()` bo participant może nie istnieć
       - **Zwraca tylko summary fields** (zgodnie z sekcją 5/7 i `AiParticipantSummaryDTO` z types.ts)
       - **YAGNI**: nie fetchujemy `user_id` (RLS weryfikuje) ani `created_at` (niepotrzebne w response)

### 9.3. Serwis: zapis konwersacji + wiadomości (NO RPC)

3. **Dodać plik** `src/lib/services/conversations.service.ts`
   - Dodać funkcję:
     - `createConversationWithInitialExchange({ supabase, userId, title, userMessage, aiParticipantId, aiContent }): Promise<{ data: CreateConversationResponseDTO | null; error: { message: string; code?: string } | null }>`
   - Implementacja DB:
     - `INSERT conversations` → `.select("id,user_id,title,created_at,updated_at").single()`
       - **`.single()` bo INSERT zawsze zwraca exactly 1 row (albo rzuca error)**
     - `INSERT messages` (user) → `.select(...) .single()`
       - **`.single()` jak wyżej**
     - `INSERT messages` (assistant) → `.select(...) .single()`
       - **`.single()` jak wyżej**
     - **Cleanup**: przy błędzie w którymkolwiek insercie po utworzeniu konwersacji wykonać `DELETE conversations WHERE id = ...`
       - jeśli delete error → zwrócić błąd + endpoint loguje **CRITICAL**

**Implementation pattern (try/catch z cleanup):**

```typescript
let conversationId: string | null = null;

try {
  // Step 1: Create conversation
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id,user_id,title,created_at,updated_at")
    .single();

  if (convError) throw convError;
  conversationId = conv.id; // Track for cleanup

  // Step 2: Insert user message
  const { data: userMsg, error: userMsgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: userMessage,
      ai_participant_id: null,
    })
    .select("*")
    .single();

  if (userMsgError) throw userMsgError;

  // Step 3: Insert AI message
  const { data: aiMsg, error: aiMsgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: aiContent,
      ai_participant_id: aiParticipantId,
    })
    .select("*")
    .single();

  if (aiMsgError) throw aiMsgError;

  // Success: build response DTO
  return {
    data: {
      ...conv,
      messages: [
        { ...userMsg, ai_participant: null },
        { ...aiMsg, ai_participant: participantSummary },
      ],
    },
    error: null,
  };
} catch (err) {
  // Cleanup: delete orphaned conversation if it was created
  if (conversationId) {
    const { error: deleteError } = await supabase.from("conversations").delete().eq("id", conversationId);

    if (deleteError) {
      // CRITICAL: failed to cleanup orphaned conversation
      // eslint-disable-next-line no-console
      console.error("[CRITICAL] Failed to cleanup conversation after error", {
        conversationId,
        originalError: err.message,
        deleteError: deleteError.message,
      });
    }
  }

  return {
    data: null,
    error: {
      message: err.message || "Failed to create conversation",
      code: err.code,
    },
  };
}
```

**Uwaga:** Cleanup potrzebny TYLKO jeśli `conversationId !== null` (konwersacja powstała).  
Jeśli `INSERT conversations` fail → `conversationId` pozostaje `null` → brak cleanup.

- Budowa DTO:
  - Zwrócić `ConversationDetailsDTO` (conversation + messages)
  - `ai_participant` dla assistant message wypełnić w endpoint-cie (ma participant summary) albo w serwisie (wymaga podania summary).
- (Opcjonalnie, preferowane) dodać `getConversationById({ supabase, conversationId }): Promise<{ data: ConversationDTO | null; error: ... }>` do doładowania finalnego `updated_at`.

### 9.4. Mapowanie błędów OpenRouter w endpoint

4. **W `src/pages/api/conversations.ts`**:
   - Skopiować mapowanie OpenRouter errorów z `src/pages/api/openrouter-models.ts` i dostosować statusy do spec:
     - `OpenRouterTimeoutError` → `504`
     - `OpenRouterNetworkError` / `OpenRouterInvalidResponseError` → `502`
     - `OpenRouterHttpError`:
       - status \(\ge 500\) lub 502/503 → `502`
       - inaczej → `500` z `"OpenRouter API error"`

### 9.5. Checklist końcowy (zgodnie z prompt)

- [ ] Zod schema: inline w `src/pages/api/conversations.ts` (nie helper) + uzasadnienie: single-use
- [ ] Każda operacja DB ma wskazane `.single()` vs `.maybeSingle()` + uzasadnienie
- [ ] Sygnatury serwisów są jawne (`async`, parametry, typ zwrotny)
- [ ] Sekcja Performance zawiera: complexity, roundtrips, external latency, worst-case, index usage
- [ ] Kroki implementacji zawierają “Skopiować … z …” dla reuse patternów
- [ ] Logowanie ma określoną “regular vs CRITICAL” dla kluczowych przypadków
- [ ] POST ma Content-Type validation przed `request.json()`
