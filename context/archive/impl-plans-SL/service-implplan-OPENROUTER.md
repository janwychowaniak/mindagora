## Service Implementation Plan: OpenRouter Service (Service Layer)

### 1. Przegląd serwisu

- **Cel**: `OpenRouterService` jest **bezstanowym (stateless)** adapterem (anti-corruption layer) zapewniającym type-safe dostęp do OpenRouter API dla backendu MindAgora.
- **Używające endpointy (backend)**:
  - **PUT** `/api/user-settings` → `validateApiKey()` (walidacja klucza przed zapisaniem w DB)
  - **GET** `/api/openrouter-models` → `getModels()` (proxy listy modeli do dropdownu)
  - **POST** `/api/conversations` → `sendChatCompletion()` (pierwsza wymiana)
  - **POST** `/api/conversations/:id/messages` → `sendChatCompletion()` (kontynuacja rozmowy)
- **Wymagania niefunkcjonalne (MVP)**:
  - **Stateless**: brak cache, brak przechowywania credentials, brak utrzymywania sesji.
  - **Dependency injection klucza**: `apiKey` przekazywany **parametrem do każdej metody** (nie constructor i nie stan obiektu).
  - **Fail fast**: brak retry logic w MVP.
  - **fetch() + timeouts**: każde wywołanie HTTP ma jawny timeout; `validateApiKey()` ma **twardy timeout 10s**.
  - **Non-streaming**: `sendChatCompletion()` w MVP działa bez SSE (bez `stream: true`).
  - **Błędy**: odpowiedzi błędów z OpenRouter są tłumaczone do `ApiErrorResponseDTO`, a `error.message` z OpenRouter jest przekazywany **1:1** (bez modyfikacji).

### 2. Publiczne metody serwisu

> Wskazówka implementacyjna: preferuj moduł z funkcjami (`export async function ...`) zamiast klasy. To naturalnie wymusza brak stanu i ułatwia testy (mock `fetch`).

#### 2.1 `validateApiKey(apiKey: string): Promise<boolean>`

- **Cel**: potwierdzić, że klucz API użytkownika jest poprawny zanim zostanie zapisany do tabeli `user_settings`.
- **Wywołuje OpenRouter**: `GET /api/v1/key`
- **Timeout**: **10_000 ms (hard requirement)**.
- **Input**:
  - `apiKey`: string (wymagane), traktowany jako sekret.
- **Output**:
  - Zwraca `true` wyłącznie przy potwierdzeniu poprawności (HTTP 200).
- **Throws**:
  - `OpenRouterServiceError` (lub analogiczny błąd domeny serwisu) na:
    - brak/niepoprawny format `apiKey` (guard clause, bez calla HTTP),
    - timeout (abort),
    - błąd sieciowy,
    - odpowiedź OpenRouter != 2xx (np. 401).
- **Kontrakt błędów**:
  - Jeżeli OpenRouter zwraca JSON error z `error.message`, to **ten string** trafia do `ApiErrorResponseDTO.details` **1:1**.

#### 2.2 `getModels(apiKey: string): Promise<OpenRouterModelListDTO>`

- **Cel**: pobrać listę modeli i pricing do UI (tworzenie AI participant).
- **Wywołuje OpenRouter**: `GET /api/v1/models`
- **Timeout**: standardowy timeout serwisu (rekomendacja: `OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000`).
- **Output**:
  - Zwraca `OpenRouterModelListDTO` (lista w polu `data`), filtrowana/normalizowana do pól: `id`, `name`, `pricing.prompt`, `pricing.completion`.
- **Uwagi o kompatybilności payloadu**:
  - Dokumentacja OpenRouter pokazuje **dwie spotykane formy**:
    - tablica modeli `[...]` (API reference),
    - obiekt `{ "data": [...] }` (inne materiały / guide).
  - Serwis powinien obsłużyć **obie** i znormalizować do `OpenRouterModelListDTO` (czyli zawsze zwrócić `{ data: [...] }`).
- **Throws**:
  - `OpenRouterServiceError` na timeout, błąd sieci, non-2xx, nieprawidłowy JSON / niezgodny kształt.

#### 2.3 `sendChatCompletion(apiKey: string, request: OpenRouterChatRequest): Promise<string>`

- **Cel**: wysłać pełen kontekst rozmowy do OpenRouter i otrzymać odpowiedź AI jako string.
- **Wywołuje OpenRouter**: `POST /api/v1/chat/completions`
- **Timeout**: standardowy timeout serwisu (rekomendacja: 30_000 ms; jeśli w praktyce modele przekraczają, podnieść do 60_000 ms i monitorować).
- **Input**:
  - `request.model`: identyfikator modelu (np. `openai/gpt-4o`, `anthropic/claude-...`).
  - `request.messages`: tablica `{ role, content }` reprezentująca pełną historię rozmowy.
  - MVP: `role` tylko `user` / `assistant` (OpenRouter wspiera też `system`, ale obecne typy MindAgora nie przewidują system message).
- **Behavior**:
  - Serwis zawsze wysyła `stream: false` (jawnie), niezależnie od tego czy pole jest obecne w input.
  - Zwraca `choices[0].message.content` jako string.
- **Throws**:
  - `OpenRouterServiceError` na timeout, błąd sieci, non-2xx, brak `choices[0].message.content` mimo 200, lub invalid JSON.

### 3. External API Integration

#### 3.1 Base URL i auth

- **Base URL**: `https://openrouter.ai/api/v1`
- **Authentication**: nagłówek `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Headers**:
  - **Wymagane**:
    - `Authorization: Bearer ...`
    - `Content-Type: application/json` (dla POST)
  - **Opcjonalne (rekomendowane przez OpenRouter do rankingów)**:
    - `HTTP-Referer: <site-url>`
    - `X-Title: <site-name>`
  - MVP: te opcjonalne nagłówki mogą być ustawiane globalnie (np. z `import.meta.env`) i nie są powiązane z kluczem użytkownika.

#### 3.2 Kontrakty endpointów (OpenRouter)

##### GET `/api/v1/key` (walidacja klucza)

- **Request**:
  - Method: `GET`
  - URL: `https://openrouter.ai/api/v1/key`
  - Headers: `Authorization: Bearer <apiKey>`
- **Response 200 (przykładowy kształt)**:
  - JSON: `{ "data": { "hash": "...", "name": "...", "disabled": false, "limit_remaining": 74.5, ... } }`
- **Response errors (typowo)**:
  - `401 Unauthorized` (invalid/missing key)
  - Format błędu: patrz sekcja 5.

##### GET `/api/v1/models` (lista modeli)

- **Request**:
  - Method: `GET`
  - URL: `https://openrouter.ai/api/v1/models`
  - Headers: `Authorization: Bearer <apiKey>`
- **Response 200**:
  - Najczęściej: `[...]` tablica obiektów modelu (m.in. `id`, `name`, `context_window`, `pricing`).
  - Alternatywnie spotykane: `{ "data": [...] }`.
- **Response errors (typowo)**:
  - `401`, `429`, `500` (jak w sekcji 5).

##### POST `/api/v1/chat/completions` (chat)

- **Request**:
  - Method: `POST`
  - URL: `https://openrouter.ai/api/v1/chat/completions`
  - Headers:
    - `Authorization: Bearer <apiKey>`
    - `Content-Type: application/json`
  - Body (MVP minimal):

```json
{
  "model": "openai/gpt-4o",
  "messages": [{ "role": "user", "content": "Hello!" }],
  "stream": false
}
```

- **Response 200 (MVP minimal, zgodnie z typami MindAgora)**:

```json
{
  "choices": [{ "message": { "role": "assistant", "content": "..." } }]
}
```

#### 3.3 Rate limiting

- **Status**: OpenRouter zwraca `429 Too Many Requests` przy przekroczeniu limitów.
- **Nagłówki limitów**: w dostępnej dokumentacji nie ma jednoznacznej, stabilnej listy nagłówków typu `X-RateLimit-*`. Serwis nie powinien polegać na headerach; jedynie:
  - propagować błąd (fail fast),
  - opcjonalnie odczytać `Retry-After` jeśli wystąpi (tylko do logów/telemetrii, bez retry w MVP).

### 4. Wykorzystywane typy

#### 4.1 Typy istniejące w `src/types.ts` (sekcja OPENROUTER)

- **Public (proxy models)**:
  - `OpenRouterModelDTO`
  - `OpenRouterModelListDTO`
- **Internal (chat integration)**:
  - `OpenRouterMessageContext`
  - `OpenRouterChatRequest`
  - `OpenRouterChatResponse`
- **Wspólny typ błędu API**:
  - `ApiErrorResponseDTO`

#### 4.2 Typy wymagane w serwisie (propozycja dodania / lokalnie w module)

> Rekomendacja: typy strict dla payloadów OpenRouter trzymać lokalnie w `openrouter.service.ts` (jako typy prywatne), chyba że będą współdzielone przez wiele warstw.

- **Error payload z OpenRouter (pre-stream / non-streaming)**:

```ts
type OpenRouterErrorCode = number | string;

interface OpenRouterErrorPayload {
  code: OpenRouterErrorCode;
  message: string;
  metadata?: unknown;
}

interface OpenRouterErrorResponse {
  error: OpenRouterErrorPayload;
}
```

- **Key info response (minimal do walidacji)**:

```ts
interface OpenRouterKeyInfoResponse {
  data: {
    hash: string;
    disabled?: boolean;
    // ...pozostałe pola ignorowane przez MVP...
  };
}
```

- **Models response (normalizacja dwóch formatów)**:

```ts
type OpenRouterModelsResponse = OpenRouterModelDTO[] | { data: OpenRouterModelDTO[] };
```

> Uwaga: `OpenRouterModelDTO` w MindAgora ma tylko `id`, `name`, `pricing.{prompt,completion}` — serwis powinien mapować/wycinać resztę pól.

#### 4.3 Walidacja runtime (Zod)

- **Rekomendacja**: dodać schemy Zod do:
  - error response,
  - key info response (minimal),
  - models response (union),
  - chat completion response (minimal).
- **Cel**: jeśli OpenRouter zwróci nieoczekiwany kształt, serwis rzuci kontrolowany błąd `OpenRouterInvalidResponseError` (mapowany do 502).

### 5. Error Handling & Translation

#### 5.1 Model błędów w serwisie

- **Mechanizm**: serwis rzuca wyjątki, które endpointy mapują na `Response` z `ApiErrorResponseDTO`.
- **Rekomendowane typy wyjątków**:
  - `OpenRouterHttpError` (non-2xx z OpenRouter, zawiera status + `ApiErrorResponseDTO`)
  - `OpenRouterTimeoutError` (abort po timeout)
  - `OpenRouterNetworkError` (fetch rejected / DNS / TLS)
  - `OpenRouterInvalidResponseError` (200, ale niezgodny payload)

#### 5.2 Tłumaczenie OpenRouter → `ApiErrorResponseDTO`

- **Kiedy OpenRouter zwraca error JSON** (typowo: `{ "error": { "code": ..., "message": "..." } }`):
  - `ApiErrorResponseDTO.details` = `error.message` **1:1**
  - `ApiErrorResponseDTO.error` = sensowny label oparty o HTTP status, np.:
    - 400 → `Bad Request`
    - 401 → `Unauthorized`
    - 402 → `Payment Required`
    - 429 → `Too Many Requests`
    - 502 → `Bad Gateway`
    - 503 → `Service Unavailable`
    - inne → `OpenRouter Error`
- **Kiedy brak JSON error / nie da się sparsować**:
  - `details` = surowy tekst response (bez modyfikacji) lub fallback `"Unknown OpenRouter error"`
  - `error` = jak wyżej (status-based)
- **Timeout / network** (brak komunikatu OpenRouter):
  - `details` = kontrolowany komunikat systemowy (np. `"OpenRouter request timed out"` / `"Failed to reach OpenRouter"`)
  - `error` = `Gateway Timeout` (timeout) lub `Bad Gateway` (network)

#### 5.3 Brak retry (MVP)

- Serwis nie implementuje retry, exponential backoff ani circuit breaker.
- 429/5xx są propagowane jako wyjątek natychmiast po otrzymaniu response.

#### 5.4 Logging (bez wycieku sekretów)

- **Nigdy nie logować**:
  - `apiKey` ani nagłówka `Authorization`,
  - pełnych treści wiadomości (PII / prompty) w logach błędów.
- **Można logować**:
  - route (np. `"/api/v1/chat/completions"`), status, czas trwania, typ błędu,
  - opcjonalnie `error.code` i `Retry-After` (jeśli jest), ale bez danych wrażliwych.

### 6. Security Considerations

- **Ochrona API key**:
  - traktować jako sekret (jak hasło); zero logów, zero echo do klienta.
  - serwis nie przechowuje klucza; klucz przekazywany wyłącznie per-call.
- **Bezpieczeństwo transportu**:
  - OpenRouter używa HTTPS; nie wspierać downgrade / niestandardowych base URL od użytkownika.
- **Minimalizacja danych**:
  - do OpenRouter wysyłać wyłącznie to, co konieczne (MVP: `model`, `messages`, `stream:false`).
  - nie dołączać debug/metadata, jeśli nie jest wymagane.
- **DoS / nadużycia**:
  - timeouts ograniczają wiszące requesty,
  - endpointy powinny limitować wielkość `messages` (liczbę i rozmiar content) zanim trafią do serwisu.
- **Pass-through message (ryzyko ujawnienia)**:
  - PRD wymaga przekazywania `error.message` 1:1; to może ujawniać szczegóły (np. billing). Potrzebna świadoma akceptacja i spójne mapowanie na `ApiErrorResponseDTO`.

### 7. Testing Strategy

#### 7.1 Poziomy testów

- **Unit tests (priorytet)**:
  - testy metod serwisu z mockowanym `fetch` (bez realnych calli).
  - testy helperów: timeout wrapper, parser error payload, normalizacja modeli.
- **Integration tests (opcjonalnie)**:
  - tylko lokalnie/manualnie (klucz testowy), bez CI (koszty i sekrety).

#### 7.2 Mockowanie OpenRouter API

- **Podejście**:
  - w Vitest: stub globalnego `fetch` (`vi.stubGlobal("fetch", ...)`) i zwracanie `Response` z odpowiednim body/status.
  - alternatywnie: MSW (jeśli projekt doda zależność).
- **Scenariusze testowe (minimum)**:
  - `validateApiKey`:
    - 200 + `{data:{hash:"..."}}` → `true`
    - 401 + `{error:{code:401,message:"Invalid API key"}}` → throw (details == `"Invalid API key"`)
    - timeout → throw (typ timeout)
    - fetch reject → throw (typ network)
  - `getModels`:
    - response jako `[...]` → normalizacja do `{data:[...]}`
    - response jako `{data:[...]}` → passthrough + mapowanie pól
    - 200 ale brak wymaganych pól → throw invalid response
  - `sendChatCompletion`:
    - 200 + `{choices:[{message:{content:"..."}}]}` → zwraca `"..."`.
    - 200 + `choices: []` / brak content → throw invalid response
    - 400/401/429 + error payload → throw http error (details 1:1)

#### 7.3 Testy timeoutów

- Użyć fake timers do deterministycznego testowania abort (np. `vi.useFakeTimers()`).
- Sprawdzić:
  - czy request jest abortowany po czasie,
  - czy timer jest czyszczony w happy-path (brak wycieków),
  - czy błąd timeout mapuje się do właściwego `ApiErrorResponseDTO`.

### 8. Kroki implementacji

1. **Utworzyć plik serwisu**: `src/lib/services/openrouter.service.ts`.
   - Export publicznych metod: `validateApiKey`, `getModels`, `sendChatCompletion`.
2. **Zdefiniować stałe konfiguracyjne**:
   - `OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"`
   - `OPENROUTER_VALIDATE_KEY_TIMEOUT_MS = 10_000`
   - `OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000` (i ewentualnie osobno dla chat, jeśli potrzebne)
3. **Zaimplementować helper `fetchWithTimeout()`** (wewnątrz serwisu albo jako prywatny moduł):
   - `AbortController`, `setTimeout`, `clearTimeout`.
4. **Zaimplementować budowanie nagłówków**:
   - `Authorization: Bearer ${apiKey}`
   - (POST) `Content-Type: application/json`
   - (opcjonalnie) `HTTP-Referer`, `X-Title` z env (bez danych użytkownika).
5. **Zaimplementować parser odpowiedzi i error translator**:
   - `parseJsonSafe(response)` + fallback na `response.text()`
   - Zod schemy dla minimalnych payloadów (błędy, key info, models, chat response)
   - rzutowanie do `ApiErrorResponseDTO` z pass-through `error.message`.
6. **Zaimplementować `validateApiKey()`**:
   - GET `/key`, timeout 10s.
   - 200 → return `true`.
   - non-2xx → throw `OpenRouterHttpError`.
7. **Zaimplementować `getModels()`**:
   - GET `/models`.
   - normalizacja `[...]` vs `{data:[...]}`.
   - mapowanie do `OpenRouterModelListDTO` (wycięcie pól).
8. **Zaimplementować `sendChatCompletion()`**:
   - POST `/chat/completions` z body: `{...request, stream:false}`.
   - parsowanie `choices[0].message.content`.
9. **Dodać testy jednostkowe serwisu**:
   - dodać runner testów (Vitest) do projektu, jeśli jeszcze nie istnieje,
   - testy w `src/lib/services/openrouter.service.test.ts`.
10. **Integracja w endpointach (poza samym SL, ale konieczna do domknięcia przepływu)**:

- endpointy łapią `OpenRouter*Error` i mapują na `ApiErrorResponseDTO` + odpowiedni status,
- w logach endpointów: brak `apiKey` i brak treści wiadomości.
