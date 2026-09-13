## API Endpoint Implementation Plan: `GET /api/conversations`

## 1. Przegląd punktu końcowego

- **Metoda HTTP**: `GET`
- **URL**: `/api/conversations`
- **Cel**: Zwrócić listę konwersacji zalogowanego użytkownika (MVP: bez pagination), posortowaną po `updated_at DESC`.
- **Autoryzacja**: **Wymagana** (`context.locals.user` + `context.locals.supabase` ustawiane przez `src/middleware/index.ts`).
- **Wymóg spec**: pole `message_count` jest **computed field** (COUNT z `messages`), a nie kolumną w tabeli `conversations`.

## 2. Szczegóły żądania

- **Headers**:
  - `Authorization: Bearer <token>` (wymagane; endpoint dodatkowo trzyma guard `locals.user` jak inne endpointy)
- **Query params**:
  - Brak (MVP: „load all”, brak pagination)
- **Walidacja (Zod)**:
  - **Brak schematu wejścia** (endpoint nie przyjmuje body ani parametrów zapytania w MVP).
  - Jawna decyzja: nie odrzucamy nieznanych query params (ignorujemy), bo spec ich nie definiuje i w MVP nie ma potrzeby komplikować DX.

## 3. Wykorzystywane typy (DTO / Command Models)

- `ConversationListItemDTO` — `src/types.ts` (zawiera `message_count: number` jako computed field)
- `ApiErrorResponseDTO` — `src/types.ts`

## 4. Szczegóły odpowiedzi

- **200 OK** (success; lista może być pusta):

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "title": "string",
    "created_at": "ISO 8601 datetime",
    "updated_at": "ISO 8601 datetime",
    "message_count": 0
  }
]
```

- **Headers**:
  - `Content-Type: application/json; charset=utf-8`
  - `Cache-Control: no-store` (odpowiedź jest user-specific)

## 5. Przepływ danych (end-to-end)

1. **Auth guard**:
   - jeśli `!locals.user` → `401 Unauthorized` (skopiować wzorzec z `src/pages/api/user-settings.ts` lub `src/pages/api/conversations.ts`).
2. **Pobranie listy konwersacji + computed `message_count`**:
   - wywołać serwis `listConversationsForUserWithMessageCount()` z `src/lib/services/conversations.service.ts`.
   - Serwis wykonuje zapytanie do `conversations` filtrowane po `user_id` (defense-in-depth), sortuje `updated_at DESC` i mapuje wynik do `ConversationListItemDTO[]` (w tym computed `message_count`, patrz decyzje poniżej).
3. **Return 200**:
   - zwrócić tablicę `ConversationListItemDTO[]` (nawet gdy pusta) + `Cache-Control: no-store`.

### Decyzje projektowe (computed `message_count`) — 3 podejścia i trade-offy

- **Podejście A (wybrane w tym planie, NO RPC)**: jeden `select()` z embedded count relacji w PostgREST (bez zmian w DB).
  - Przykład selektu (concept-only): `message_count:messages(count)` jako embedded resource aliasowany do pola `message_count`.
  - **Plusy**: brak RPC; 1 roundtrip; brak N+1; minimalny transfer (tylko count).
  - **Minusy**: zależne od możliwości/kształtu odpowiedzi PostgREST; wymaga mapowania wyniku do `number`.
- **Podejście B (fallback, NO RPC i bez N+1 roundtripów)**: 2 zapytania:
  - 1. pobrać konwersacje (`id,...`) dla usera,
  - 2. pobrać wszystkie `messages(conversation_id)` dla tych `id` i policzyć w aplikacji.
  - **Plusy**: 2 roundtripy (nie N+1); brak RPC; deterministyczne.
  - **Minusy**: transfer \(O(n)\) po liczbie wiadomości (MVP „load all”).
- **Podejście C (fallback MVP-only, najgorsze wydajnościowo)**: N+1 przez `head: true, count: "exact"` per conversation (możliwie równolegle z limitem concurrency).
  - **Plusy**: niezależne od embedded count.
  - **Minusy**: \(1 + k\) roundtripów; słaba skalowalność.

## 6. Względy bezpieczeństwa

- **Supabase authed client**:
  - wszystkie operacje wykonywać przez `context.locals.supabase` (zgodnie z `.cursor/rules/backend.mdc`).
- **Defense-in-depth**:
  - mimo że RLS izoluje dane, endpoint i serwis dodatkowo filtrują `.eq("user_id", locals.user.id)` — nie da się „poprosić” o cudze konwersacje.
- **Anty-enumeration**:
  - endpoint zwraca wyłącznie listę zalogowanego usera; brak możliwości wyboru zasobu po id w tym endpointcie.
- **Cache**:
  - `Cache-Control: no-store` dla odpowiedzi.
- **Logowanie bez danych wrażliwych**:
  - nie logować tytułów ani zawartości wiadomości; logować co najwyżej `userId` oraz `supabase_error_code`.

## 7. Obsługa błędów

### 401 Unauthorized

- `locals.user` falsy (brak/invalid token).

### 500 Internal Server Error

- błąd zapytania Supabase:
  - log **regular**:
    - `route`, `method`, `status`, `supabase_error_code`
  - zwrócić user-friendly `"An unexpected error occurred"`.

### Logging severity (jawna decyzja)

- **regular**:
  - każdy błąd Supabase (select)
- **CRITICAL**:
  - (nie dotyczy tego endpointu) — brak invariantu typu „record MUST exist” jak w `user_settings`.

## 8. Wydajność (WYMAGANE)

- **Database query complexity**:
  - listowanie konwersacji usera po indeksie `(user_id, updated_at DESC)` → \(O(k)\) dla liczby konwersacji użytkownika \(k\)
  - `message_count` (Podejście A) liczone po stronie DB jako agregat po relacji `messages`:
    - oczekiwane użycie indeksu po `messages.conversation_id` (plan zależny od Postgres/PostgREST)
    - w razie fallbacku Podejście B: DB \(O(k)\) (conversations) + \(O(n)\) (messages dla tych konwersacji), aplikacja \(O(n)\) na zliczenie
- **Number of DB roundtrips**:
  - Podejście A (embedded count): **1** roundtrip
  - Podejście B (2 zapytania): **2** roundtripy
  - Podejście C (N+1): **1 + k** roundtripów
- **External API latency**:
  - brak (endpoint nie wywołuje OpenRouter ani innych usług zewnętrznych).
- **Worst-case total latency calculation**:
  - podejście A: 1 DB roundtrip + koszt agregacji COUNT → typowo setki ms (zależnie od \(k\) i liczby wiadomości)
  - podejście B: 2 DB roundtripy + transfer \(O(n)\) wiadomości → może być większe niż A, ale bez N+1
  - podejście C: \((1 + k)\) DB roundtripów → latencja rośnie liniowo z \(k\)
- **Index usage (które indeksy wspierają ten endpoint)**:
  - `idx_conversations_user_updated(user_id, updated_at DESC)` — sortowanie i filtr po użytkowniku (zgodnie ze wzorcem przywołanym w planach EP)
  - `idx_messages_conversation_id(conversation_id)` (i/lub composite `idx_messages_conversation_created(conversation_id, created_at ASC)`) — wsparcie dla `COUNT(*) WHERE conversation_id = ...`

## 9. Kroki implementacji (WYMAGANE)

### 9.1. Serwis (warstwa usług)

1. **Zaktualizować plik** `src/lib/services/conversations.service.ts`
   - Dodać funkcję:
     - `listConversationsForUserWithMessageCount({ supabase, userId }): Promise<{ data: ConversationListItemDTO[] | null; error: { message: string; code?: string } | null }>`
     - **Decyzja o sygnaturze**: object params (mimo ≤3 parametrów) dla spójności z istniejącymi funkcjami w tym pliku (`assertConversationOwnedByUser`, `getConversationMessages`, itd.).
     - **Odchylenie od reguły ogólnej**: reguła mówi „positional dla ≤3 params”, ale w `conversations.service.ts` istniejące funkcje używają object params — wybieramy spójność wewnątrz pliku serwisowego.
   - Implementacja (NO RPC, Podejście A):
     - query:
       - `.from("conversations")`
       - `.select("id,user_id,title,created_at,updated_at,message_count:messages(count)")`
       - `.eq("user_id", userId)`
       - `.order("updated_at", { ascending: false })`
     - mapowanie `message_count`:
       - `message_count` przychodzi jako embedded zasób (to-many) — mapować do liczby:
         - `const count = row.message_count?.[0]?.count ?? 0`
       - **Defensywne logowanie shape’u embedded count (regular)**:

```typescript
const rawCount = row.message_count?.[0]?.count;
if (rawCount === undefined || rawCount === null) {
  console.warn(
    `[GET /api/conversations] Unexpected embedded count shape for conversation ${row.id}. ` +
      `Raw value: ${JSON.stringify(row.message_count)}. Defaulting to 0.`
  );
}
const messageCount: number = typeof rawCount === "number" ? rawCount : 0;
```

     - błędy:
       - jeśli `error` → `{ data: null, error: { message: error.message, code: error.code } }`
       - jeśli `data === null` → `{ data: null, error: { message: "Conversation list lookup returned null data." } }`

- Fallback (jeśli embedded count nie działa / shape jest niezgodny):
  - wdrożyć Podejście B (2 zapytania) albo Podejście C (N+1 head+count), zgodnie z sekcją 5.

### 9.2. Endpoint (Astro API route)

2. **Zaktualizować plik** `src/pages/api/conversations.ts`
   - Dodać `export const GET = async (context: APIContext) => { ... }`
   - Uwaga o istniejącym kodzie:
     - Plik zawiera już handler `export const POST` oraz helper `jsonError()`.
     - **Nie tworzyć nowego helpera** — reuse istniejącego `jsonError()` z tego samego pliku.
   - Skopiować patterny:
     - `jsonError()` + spójny shape `ApiErrorResponseDTO` — już istnieje w pliku, reuse
     - guard `if (!locals.user) return jsonError(401, ...)` — skopiować 1:1 z `POST` w tym samym pliku
     - logowanie Supabase error (regular) — skopiować styl z `countAiParticipants` / `getUserSettings` w `POST`
   - Orkiestracja:
     - call `listConversationsForUserWithMessageCount({ supabase: locals.supabase, userId: locals.user.id })`
     - przy błędzie → `500`
     - sukces → `200` + JSON array + `"Cache-Control": "no-store"`

### 9.3. Checklist końcowy (z promptu)

- [ ] Zod schemas: jawnie zaznaczone „brak” + uzasadnienie (brak inputu)
- [ ] DB operations: jawne podejście do `message_count` (NO RPC: embedded count + fallback) + uzasadnienie
- [ ] Sygnatury serwisów jawne (async, params, return type)
- [ ] Sekcja 8 zawiera: complexity, roundtrips, external latency, worst-case, index usage
- [ ] Kroki implementacji używają “Skopiować … z …” dla reuse patternów
- [ ] Logowanie ma jawne „regular vs CRITICAL” i nie loguje treści/tajnych danych
