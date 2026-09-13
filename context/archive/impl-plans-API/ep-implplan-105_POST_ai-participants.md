## API Endpoint Implementation Plan: POST /api/ai-participants

## 1. Przegląd punktu końcowego

Endpoint tworzy nowego **uczestnika AI** (alias + model_id + kolor) należącego do aktualnie zalogowanego użytkownika.

> Spec (źródło: `.sketch/impl-planing/make-PLAN-implementacji-epa-api_105_POST_ai-participants.md`):
>
> - "**Opis:** Utwórz nowego uczestnika AI"
> - "**Autoryzacja:** Required"
> - payload: `{ "alias": "...", "model_id": "...", "color": "#RRGGBB" }`
> - walidacja: `alias` (format + max 30 + unique per user), `model_id` (max 150 + walidacja przez OpenRouter), `color` (hex `#RRGGBB`)
> - sukces: `201 Created` (zwraca pełny obiekt uczestnika)

> **Uwaga (decyzja w planie)**: mimo że spec sugeruje walidację istnienia `model_id` „przez OpenRouter”, w tym endpointcie robimy tylko walidację **formatu** (Zod).  
> Walidacja istnienia modelu następuje dopiero przy **użyciu** modelu (sekcja 2.2).

- **Metoda**: `POST`
- **Ścieżka**: `/api/ai-participants`
- **Autoryzacja**: wymagana (Supabase Auth; `locals.user` i authed `locals.supabase` ustawiane przez middleware `src/middleware/index.ts`)
- **Źródło danych**: tabela `public.ai_participants`
- **Walidacja `model_id`**:
  - format walidowany w tym endpointcie (Zod),
  - istnienie modelu **nie** jest walidowane w tym endpointcie (rationale w sekcji 2.2) — weryfikacja następuje przy użyciu modelu (np. wysyłka do OpenRouter).
- **Dane wrażliwe**:
  - endpoint nie dotyka sekretów użytkownika,
  - nigdy nie logować nagłówka `Authorization` (JWT).

## 2. Szczegóły żądania

- **Metoda HTTP**: `POST`
- **URL**: `/api/ai-participants`
- **Parametry**:
  - **Wymagane**: brak (wszystko w body)
  - **Opcjonalne**: brak
- **Nagłówki**:
  - **Wymagane**:
    - `Authorization: Bearer <access_token>` (obsługiwane przez middleware; w handlerze dostępne jako `locals.user`)
    - `Content-Type: application/json`
  - **Opcjonalne**: `Accept: application/json`

### 2.1. Request Body

```json
{
  "alias": "string",
  "model_id": "string",
  "color": "string (hex)"
}
```

### 2.2. Walidacja wejścia (Zod)

Zgodnie z zasadami repo (`.ai/impl-plans-API/Uwagi implementacyjne do planów EP.md`):

- **TAK używaj Zod** dla user input (POST body).
- **Zod schema location**: **inline w pliku endpointu** (`src/pages/api/ai-participants.ts`) — walidacja jest specyficzna dla tego endpointu (re-use ≤ 1).

Walidacja pól:

- `alias`:
  - required
  - `.trim()` (usuń spacje brzegowe; spacje w środku dozwolone)
  - max 30 znaków
  - regex: alfanumeryczne + spacje + `- _ .` (ASCII), np. `^(?=.*[A-Za-z0-9])[A-Za-z0-9 _.-]+$`
    - **Uwaga (zamierzone)**: lookahead `(?=.*[A-Za-z0-9])` wymaga co najmniej 1 znaku alfanumerycznego  
      (lepszy UX — blokuje aliasy typu `"_"`, `"..."`, `"---"`).
  - uniqueness per user: gwarantowane przez DB constraint `UNIQUE(user_id, alias)`; błąd mapujemy na `409`.
- `model_id`:
  - required
  - `.trim()`
  - max 150 znaków
  - **bez walidacji istnienia w OpenRouter na etapie CREATE** (tylko walidacja formatu; patrz poniżej)
- `color`:
  - required
  - `.trim()`
  - regex: `^#[0-9A-Fa-f]{6}$`

#### Walidacja `model_id` — decyzja architektoniczna (bez OpenRouter call w tym endpointcie)

- **Format validation (Zod)**:
  - required, trim, max 150 chars
- **Existence validation**:
  - ❌ NIE pobierać listy modeli z OpenRouter w `POST /api/ai-participants`
  - ✅ Frontend używa `GET /api/openrouter-models` do wypełnienia dropdowna
  - ✅ Backend zakłada, że `model_id` pochodzi z dropdowna i przechodzi walidację formatu
  - ✅ Walidacja istnienia następuje **przy użyciu modelu** (np. w endpointach rozmów / wysyłce do OpenRouter)

**Rationale**:

- **Performance**: eliminuje ~500–2000ms latency + worst-case timeout 30s
- **Architektura**: rozdział odpowiedzialności (proxy dla UI vs CRUD)
- **UX**: szybka odpowiedź na create
- **Trust model**: błędy nieprawidłowego `model_id` wychodzą w momencie użycia, nie tworzenia rekordu

Przykładowy snippet (z komentarzem dot. lookahead):

```typescript
const createAiParticipantSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(1, "Required")
    .max(30, "Max 30 characters")
    // Regex requires at least one alphanumeric character (positive lookahead).
    // Prevents nonsensical aliases like "_", "...", or "---".
    // Allowed: letters, digits, spaces, and special chars: - _ .
    .regex(/^(?=.*[A-Za-z0-9])[A-Za-z0-9 _.-]+$/, "Invalid alias format"),
  model_id: z.string().trim().min(1, "Required").max(150, "Max 150 characters"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
});
```

Decyzje dot. formatowania błędów Zod:

- Skopiować `formatZodErrors()` z `src/pages/api/user-settings.ts` (flatten `fieldErrors` → `{ [field]: firstMessage }`).
- Zwracać `400` z `ApiErrorResponseDTO.details` jako obiekt mapujący nazwy pól.

## 3. Wykorzystywane typy

Z `src/types.ts`:

- **DTO**: `AiParticipantDTO`
- **Command model**: `CreateAiParticipantCommand` (`{ alias, model_id, color }`)
- **Response DTO**: `CreateAiParticipantResponseDTO` (alias `AiParticipantDTO`)
- **Błąd standardowy**: `ApiErrorResponseDTO`

Z serwisów:

- `createAiParticipant({ supabase, userId, command })` — nowa funkcja w `src/lib/services/ai-participants.service.ts`

Nowa funkcja serwisowa (do dodania do istniejącego pliku):

- `createAiParticipant({ supabase, userId, command }): Promise<{ data: CreateAiParticipantResponseDTO | null; error: { message: string; code?: string } | null }>`

## 4. Szczegóły odpowiedzi

### 4.1. Sukces

- **Status**: `201 Created`
- **Body** (`application/json`): `CreateAiParticipantResponseDTO` / `AiParticipantDTO`

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "alias": "string",
  "model_id": "string",
  "color": "string (hex)",
  "created_at": "ISO 8601 datetime"
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

Statusy wg spec:

- `400 Bad Request` — nieprawidłowe dane wejściowe (np. format/length pól, zły `Content-Type`, invalid JSON)
- `401 Unauthorized` — brak autoryzacji
- `409 Conflict` — alias już istnieje (duplicate)
- `500 Internal Server Error` — błąd serwera (DB / invariant violation)

## 5. Przepływ danych

### 5.1. Przepływ wysokopoziomowy

1. **Middleware** (`src/middleware/index.ts`) weryfikuje `Authorization: Bearer <token>` i ustawia:
   - `locals.user`,
   - `locals.supabase` (authed Supabase client z JWT użytkownika; RLS działa automatycznie).
2. **Endpoint** (`POST /api/ai-participants`) wykonuje guard clauses:
   - jeśli `!locals.user` → `401 Unauthorized` (defense‑in‑depth; wzorzec z `src/pages/api/user-settings.ts`).
   - sprawdza `Content-Type` i parsuje JSON (wzorzec z `PUT` w `src/pages/api/user-settings.ts`).
3. Endpoint waliduje body przez Zod:
   - jeśli error → `400` + `details` z `formatZodErrors()`.
4. Endpoint tworzy rekord w DB:
   - wywołuje serwis `createAiParticipant({ supabase: locals.supabase, userId: locals.user.id, command })`.
   - `user_id` jest **implicit** z `locals.user.id` (NIE pochodzi z request body).
5. Endpoint zwraca `201` z utworzonym `AiParticipantDTO`.

### 5.2. Decyzje dot. service layer

- **DB insert do serwisu**: dodać `createAiParticipant()` do `src/lib/services/ai-participants.service.ts` (spójnie z `getAiParticipants()` i patternem z `src/lib/services/user-settings.service.ts`).
- **Sygnatura serwisu (positional vs object params)**:
  - **Decyzja**: object params `{ supabase, userId, command }` (**>3 parametry**; zgodnie z regułą z prompta).
- **Database query method (`.single()` vs `.maybeSingle()`)**:
  - `createAiParticipant()` ma używać `.select(...).single()` — insert ma zwrócić dokładnie 1 rekord; brak danych bez error to **CRITICAL**.
- **Zod schema location**: inline w `src/pages/api/ai-participants.ts`.

## 6. Względy bezpieczeństwa

- **Autoryzacja**:
  - chronione przez middleware; dodatkowy `if (!locals.user)` jako defense‑in‑depth.
- **RLS i izolacja danych**:
  - wszystkie operacje DB przez `locals.supabase` (authed client; bez service role key),
  - `createAiParticipant()` ustawia `user_id` z `locals.user.id` (nie z inputu), co zapobiega IDOR.
- **Content-Type i parsowanie**:
  - wymagać `Content-Type: application/json` przed `request.json()` (wzorzec z `PUT /api/user-settings`).
- **Sekrety i logowanie**:
  - nie logować `Authorization` ani raw body requestów,
  - logować jedynie metadane: `route`, `method`, `status`, `supabase_error_code` (bez payloadów).
- **Zachowanie przy invalid model**:
  - istnienie `model_id` nie jest walidowane przy CREATE; ewentualne problemy wyjdą przy użyciu modelu.

## 7. Obsługa błędów

### 7.1. Scenariusze błędów i statusy (wraz z severity)

- **401 Unauthorized**:
  - warunek: `!locals.user`
  - response: `jsonError(401, "Unauthorized", "Missing or invalid authentication token")`
  - logging: brak (expected flow)

- **400 Bad Request** (input / request-level):
  - **Content-Type != application/json**:
    - response: `jsonError(400, "Bad Request", "Content-Type must be application/json")`
    - logging: brak (expected)
  - **Invalid JSON**:
    - response: `jsonError(400, "Bad Request", "Invalid JSON body")`
    - logging: brak (expected)
  - **Zod validation failed** (`alias/model_id/color`):
    - response: `jsonError(400, "Validation error", formatZodErrors(zodError))`
    - logging: brak (expected)

- **409 Conflict** (duplicate alias):
  - źródło: insert do DB narusza `UNIQUE(user_id, alias)`
  - implementacja:
    - rozpoznawać unique violation defensywnie (multi-signal), np.:
      - `error.code === "23505"` lub `error.code === 23505`
      - `error.message` zawiera `"duplicate key"` / `"unique constraint"` (case-insensitive)
    - przykładowy snippet (docelowo w `src/pages/api/ai-participants.ts`):

```typescript
const looksLikeUniqueViolation = (error: { code?: unknown; message?: string }): boolean => {
  const code = error.code;
  const message = (error.message ?? "").toLowerCase();

  return (
    code === "23505" || code === 23505 || message.includes("duplicate key") || message.includes("unique constraint")
  );
};

if (looksLikeUniqueViolation(error)) {
  return jsonError(409, "Conflict", { alias: "Alias already exists" });
}

// Unexpected DB error format / unknown DB error
console.error("AI participant create failed", {
  route,
  method: "POST",
  status: 500,
  severity: "CRITICAL",
  supabase_error_code: error.code,
});
return jsonError(500, "Internal Server Error", "An unexpected error occurred");
```

- response: `jsonError(409, "Conflict", { alias: "Alias already exists" })`
- logging: brak (expected user error) albo minimalny regular bez danych wrażliwych

- **500 Internal Server Error**:
  - **DB error** (insert/select):
    - logging: **regular** `console.error(...)` w stylu istniejących endpointów (`src/pages/api/ai-participants.ts`, `src/pages/api/user-settings.ts`):
      - `route`, `method`, `status`, `supabase_error_code`
    - response: `jsonError(500, "Internal Server Error", "An unexpected error occurred")`
  - **Nieoczekiwany format błędu DB**:
    - logging: **CRITICAL** (diagnostycznie; bez sekretów), np. `{ code: error.code, message: error.message }`
    - response: `jsonError(500, "Internal Server Error", "An unexpected error occurred")`

### 7.2. Wzorce do skopiowania (konkretne referencje)

- Skopiować walidację `Content-Type` + `request.json()` z `PUT` w `src/pages/api/user-settings.ts`.
- Skopiować `formatZodErrors()` z `src/pages/api/user-settings.ts`.
- Reużyć istniejący helper `jsonError()` z `src/pages/api/ai-participants.ts` (już zdefiniowany dla GET).
- Skopiować styl logowania błędów Supabase z `src/pages/api/ai-participants.ts` (obiektowe logi, bez sekretów; z `severity: "CRITICAL"` dla invariant violations).

### 7.3. Rejestrowanie błędów w tabeli (jeśli dotyczy)

- W dostarczonych zasobach DB/spec nie ma tabeli do trwałego logowania błędów requestów dla tego endpointa, więc w MVP logujemy przez `console.error` (jak istniejące endpointy).

## 8. Wydajność

WYMAGANE:

- **Database query complexity**:
  - `insert ai_participants`: \(O(\log N)\) ze względu na utrzymanie indeksów (w tym `UNIQUE(user_id, alias)`)
- **Number of DB roundtrips**: 1
  - 1× `INSERT ... RETURNING` do `ai_participants`
- **External API latency**: 0 (brak wywołań do OpenRouter w tym endpointcie)
- **Worst-case total latency calculation**:
  - \(T_{worst} \approx T_{db} + T_{serialize}\)
  - Przy założeniu \(T_{db} \approx 10\text{–}50ms\), \(T_{serialize} < 5ms\) → ok. **15–55ms** (pomijając narzut sieciowy klienta)
- **Index usage**:
  - `ai_participants`: indeks z `UNIQUE(user_id, alias)` (egzekwuje unikalność i wspiera lookupy per user)

Uwagi:

- Brak wywołań do OpenRouter w `POST /api/ai-participants` celowo eliminuje duże i zmienne opóźnienia sieciowe.

## 9. Kroki implementacji

1. **Rozszerz endpoint o handler `POST`**
   - Plik: `src/pages/api/ai-participants.ts`
   - Dodać importy:
     - `z` z `zod`
     - `createAiParticipant` z `src/lib/services/ai-participants.service.ts`
     - typy: `CreateAiParticipantCommand`, `CreateAiParticipantResponseDTO`, `ApiErrorResponseDTO`
   - Zostawić `export const prerender = false` (już istnieje).
   - Reużyć istniejący `jsonError()` helper (już w pliku).

2. **Dodać walidację requestu (Content-Type + JSON + Zod)**
   - Plik: `src/pages/api/ai-participants.ts`
   - Skopiować walidację `Content-Type` i parsowanie JSON z `PUT` w `src/pages/api/user-settings.ts`.
   - Zdefiniować inline Zod schema, np. `createAiParticipantSchema = z.object({ ... })`.
     - Dodać komentarz o lookahead w regex dla `alias` (zamierzone; patrz sekcja 2.2).
   - Skopiować `formatZodErrors()` z `src/pages/api/user-settings.ts`.
   - W przypadku błędu walidacji zwracać:
     - `400` + `jsonError(400, "Validation error", detailsObject)`

3. **Dodać serwis do insertu uczestnika**
   - Plik: `src/lib/services/ai-participants.service.ts`
   - Dodać funkcję `createAiParticipant({ supabase, userId, command })`:
     - query:
       - `.from("ai_participants")`
       - `.insert({ user_id: userId, ...command })`
       - `.select("id,user_id,alias,model_id,color,created_at")`
       - `.single()` (**Decyzja `.single()`**: insert ma zwrócić dokładnie 1 wiersz)
     - error handling:
       - jeśli `error` → zwrócić `{ data: null, error: { message, code } }`
       - jeśli `!data` bez error → zwrócić `{ data: null, error: { message: "AI participant insert returned null data." } }`

4. **Zaimplementować mapowanie błędów DB na 409 dla duplicate alias**
   - Plik: `src/pages/api/ai-participants.ts`
   - Po wywołaniu `createAiParticipant()`:
     - jeśli błąd wygląda jak unique violation (multi-signal, patrz sekcja 7.1) → `409 Conflict` z `{ alias: "Alias already exists" }`
     - w pozostałych błędach → `500`
   - Logging:
     - duplicate: brak lub minimalny regular (expected)
     - inne DB error: **regular**

5. **Zwrócić odpowiedź 201**
   - Plik: `src/pages/api/ai-participants.ts`
   - `return new Response(JSON.stringify(data satisfies CreateAiParticipantResponseDTO), { status: 201, headers: { "Content-Type": "...", "Cache-Control": "no-store" } })`

6. **(Opcjonalnie) Smoke testy curl**
   - Plik: `.sketch/curl_-_smoke_testy_API.md`
   - Dodać sekcję `POST /api/ai-participants` z przypadkami:
     - 401: brak Authorization
     - 400: brak Content-Type
     - 400: invalid JSON
     - 400: alias invalid / color invalid / model_id invalid (format/length)
     - 201: poprawny request
     - 409: duplicate alias (wykonać dwa razy z tym samym `alias`)

### Service Implementation Pattern (user_id jest IMPLICIT)

**`createAiParticipant()` — konstrukcja payloadu insertu**:

```typescript
{
  user_id: userId, // IMPLICIT from locals.user.id (NOT from request body)
  ...command, // alias, model_id, color from validated request
}
```

**Security note**:

- `user_id` jest brany z kontekstu autoryzacji (`locals.user.id`), więc użytkownik nie może tworzyć participantów dla innych userów
- przy `INSERT` nie ma sensu `.eq("user_id", userId)` (w przeciwieństwie do SELECT/UPDATE/DELETE)
- RLS dodatkowo egzekwuje izolację danych

### Checklist przed finalizacją

- [ ] Zod schema: **inline w `src/pages/api/ai-participants.ts`** (re-use ≤ 1)
- [ ] DB operations: każda operacja ma jawnie określone `.single()` / `.maybeSingle()` z uzasadnieniem
- [ ] Service function signature: `createAiParticipant({ supabase, userId, command })` + jawny typ zwrotu
- [ ] Wydajność: sekcja 8 zawiera wszystkie elementy WYMAGANE
- [ ] Reused patterns: kroki zawierają „Skopiować … z …”
- [ ] Logging: każda ścieżka błędu ma określone severity (regular vs CRITICAL) i nie loguje sekretów
- [ ] Security: jest walidacja `Content-Type` dla POST
- [ ] Error scenarios: statusy 201/400/401/409/500 zgodne ze spec
