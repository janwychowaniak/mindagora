# REST API Plan - MindAgora

## 1. Zasoby

### 1.1. User Settings

**Tabela:** `user_settings`  
**Opis:** Ustawienia użytkownika, w tym klucz OpenRouter API

### 1.2. AI Participants

**Tabela:** `ai_participants`  
**Opis:** Definicje uczestników AI należących do użytkownika (alias, model, kolor)

### 1.3. Conversations

**Tabela:** `conversations`  
**Opis:** Konwersacje użytkownika z historią wiadomości

### 1.4. Messages

**Tabela:** `messages`  
**Opis:** Wiadomości w konwersacjach (user i assistant)

### 1.5. OpenRouter Models

**Źródło:** OpenRouter API (proxy endpoint)  
**Opis:** Lista dostępnych modeli z OpenRouter

### 1.6. Auth

**Źródło:** Supabase Auth (`auth.users`, poza schematem aplikacji)  
**Opis:** Sesja przeglądarkowa (logowanie, rejestracja, wylogowanie) — endpointy pośredniczące, §2.6

---

## 2. Punkty końcowe

### 2.1. User Settings

#### GET /api/user-settings

**Opis:** Pobierz ustawienia aktualnie zalogowanego użytkownika

**Autoryzacja:** Required (Supabase Auth)

**Parametry zapytania:** Brak

**Struktura odpowiedzi:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "openrouter_api_key": "string | null",
  "created_at": "ISO 8601 datetime"
}
```

**Kody sukcesu:**

- `200 OK` - Ustawienia pobrane pomyślnie

**Kody błędów:**

- `401 Unauthorized` - Brak lub nieprawidłowy token autoryzacyjny
- `404 Not Found` - Ustawienia nie istnieją (nie powinno się zdarzyć jeśli trigger działa)
- `500 Internal Server Error` - Błąd serwera

---

#### PUT /api/user-settings

**Opis:** Aktualizuj ustawienia użytkownika (głównie klucz OpenRouter API)

**Autoryzacja:** Required

**Payload żądania:**

```json
{
  "openrouter_api_key": "string"
}
```

**Walidacja:**

- `openrouter_api_key`: required, string, walidacja przez API ping do OpenRouter (timeout 10s)
- Hard block zapisu przy błędzie walidacji

**Struktura odpowiedzi:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "openrouter_api_key": "string",
  "created_at": "ISO 8601 datetime"
}
```

**Kody sukcesu:**

- `200 OK` - Ustawienia zaktualizowane pomyślnie

**Kody błędów:**

- `400 Bad Request` - Nieprawidłowe dane wejściowe lub walidacja klucza nieudana
  ```json
  {
    "error": "Invalid API key",
    "details": "OpenRouter API key validation failed: [message from OpenRouter]"
  }
  ```
- `408 Request Timeout` - Timeout walidacji klucza (>10s)
  ```json
  {
    "error": "Validation timeout",
    "details": "OpenRouter API key validation timed out after 10 seconds"
  }
  ```
- `401 Unauthorized` - Brak autoryzacji
- `500 Internal Server Error` - Błąd serwera

---

### 2.2. AI Participants

#### GET /api/ai-participants

**Opis:** Pobierz listę uczestników AI użytkownika

**Autoryzacja:** Required

**Parametry zapytania:**

- Brak. Odpowiedź jest posortowana alfabetycznie po aliasie po stronie bazy (`ORDER BY alias ASC`, wykorzystuje indeks `UNIQUE(user_id, alias)`); klient nie sortuje.

**Struktura odpowiedzi:**

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

**Kody sukcesu:**

- `200 OK` - Lista uczestników pobrana pomyślnie (może być pusta)

**Kody błędów:**

- `401 Unauthorized` - Brak autoryzacji
- `500 Internal Server Error` - Błąd serwera

---

#### POST /api/ai-participants

**Opis:** Utwórz nowego uczestnika AI

**Autoryzacja:** Required

**Payload żądania:**

```json
{
  "alias": "string",
  "model_id": "string",
  "color": "string (hex)"
}
```

**Walidacja:**

- `alias`: required, max 30 znaków, alfanumeryczne + spacje + znaki (-, _, .), co najmniej jeden znak alfanumeryczny, unique per user
- `model_id`: required, max 150 znaków, walidacja wyłącznie formatu. Istnienie modelu gwarantuje dropdown w UI zasilany z `GET /api/openrouter-models`; API świadomie NIE pobiera ponownie listy modeli przy POST (patrz §4.1)
- `color`: required, format hex #RRGGBB

**Struktura odpowiedzi:**

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

**Kody sukcesu:**

- `201 Created` - Uczestnik utworzony pomyślnie

**Kody błędów:**

- `400 Bad Request` - Nieprawidłowe dane wejściowe
  ```json
  {
    "error": "Validation error",
    "details": {
      "alias": "Invalid alias format" | "Max 30 characters" | "Required"
    }
  }
  ```
- `401 Unauthorized` - Brak autoryzacji
- `409 Conflict` - Alias już istnieje (duplicate, wykryte przez `UNIQUE(user_id, alias)`)
  ```json
  {
    "error": "Conflict",
    "details": { "alias": "Alias already exists" }
  }
  ```
- `500 Internal Server Error` - Błąd serwera

---

#### DELETE /api/ai-participants/:id

**Opis:** Usuń uczestnika AI (hard delete)

**Autoryzacja:** Required

**Parametry URL:**

- `id` (uuid) - Identyfikator uczestnika

**Struktura odpowiedzi:**

```json
{
  "message": "AI participant deleted successfully"
}
```

**Kody sukcesu:**

- `200 OK` - Uczestnik usunięty pomyślnie

**Kody błędów:**

- `401 Unauthorized` - Brak autoryzacji
- (brak `403`) Uczestnik innego użytkownika → `404 Not Found`, nieodróżnialne od nieistniejącego (anti-enumeration, §8.6)
- `404 Not Found` - Uczestnik nie istnieje
- `500 Internal Server Error` - Błąd serwera

**Uwaga:** Po usunięciu uczestnika, wszystkie jego wiadomości w konwersacjach mają `ai_participant_id` ustawione na NULL (ON DELETE SET NULL).

---

### 2.3. OpenRouter Models

#### GET /api/openrouter-models

**Opis:** Pobierz listę dostępnych modeli z OpenRouter API (proxy endpoint)

**Autoryzacja:** Required. Wymaga skonfigurowanego klucza OpenRouter w `user_settings` (inaczej `412`). To bramka onboardingu (klucz = krok 1, uczestnicy = krok 2), nie walidacja: OpenRouter `GET /models` jest publiczny i klucza nie sprawdza, więc nieprawidłowy (niepusty) klucz nie powoduje błędu na tym endpoincie (decyzja 2026-09-09)

**Parametry zapytania:** Brak

**Struktura odpowiedzi:**

```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "pricing": {
        "prompt": "string",
        "completion": "string"
      }
    }
  ]
}
```

**Kody sukcesu:**

- `200 OK` - Lista modeli pobrana pomyślnie

**Kody błędów:**

- `401 Unauthorized` - Brak autoryzacji
- `412 Precondition Failed` - Brak skonfigurowanego klucza OpenRouter w user_settings (użytkownik uwierzytelniony, ale nie spełnił warunku wstępnego onboardingu; 401 jest zarezerwowane dla braku/nieważności sesji)
  ```json
  {
    "error": "No API key",
    "details": "OpenRouter API key not configured. Please add it in Settings."
  }
  ```
- `500 Internal Server Error` - Błąd komunikacji z OpenRouter lub błąd serwera
- `502 Bad Gateway` - OpenRouter API niedostępne

---

### 2.4. Conversations

#### GET /api/conversations

**Opis:** Pobierz listę konwersacji użytkownika

**Autoryzacja:** Required

**Parametry zapytania:**

- Brak pagination w MVP (load all)

**Sortowanie:** Server-side sortowanie po `updated_at DESC` (most recent first)

**Struktura odpowiedzi:**

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "title": "string",
    "created_at": "ISO 8601 datetime",
    "updated_at": "ISO 8601 datetime",
    "message_count": "integer"
  }
]
```

**Uwaga:** `message_count` jest computed field (COUNT z messages table), nie kolumna w bazie.

**Kody sukcesu:**

- `200 OK` - Lista konwersacji pobrana pomyślnie (może być pusta)

**Kody błędów:**

- `401 Unauthorized` - Brak autoryzacji
- `500 Internal Server Error` - Błąd serwera

---

#### GET /api/conversations/:id

**Opis:** Pobierz szczegóły konwersacji wraz z wszystkimi wiadomościami

**Autoryzacja:** Required

**Parametry URL:**

- `id` (uuid) - Identyfikator konwersacji

**Struktura odpowiedzi:**

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
      } | null,
      "created_at": "ISO 8601 datetime"
    }
  ]
}
```

**Uwaga:**

- Wszystkie wiadomości ładowane na raz (brak pagination w MVP)
- Sortowanie wiadomości po `created_at ASC` (chronologicznie)
- Dla `role='user'`, `ai_participant_id` i `ai_participant` są zawsze `null`
- Dla `role='assistant'` z usuniętym uczestnikiem, `ai_participant_id` jest `null` i `ai_participant` jest `null`

**Kody sukcesu:**

- `200 OK` - Konwersacja pobrana pomyślnie

**Kody błędów:**

- `401 Unauthorized` - Brak autoryzacji
- (brak `403`) Konwersacja innego użytkownika → `404 Not Found`, nieodróżnialne od nieistniejącej (anti-enumeration, §8.6)
- `404 Not Found` - Konwersacja nie istnieje
- `500 Internal Server Error` - Błąd serwera

---

#### POST /api/conversations

**Opis:** Utwórz nową konwersację z pierwszą wymianą (user message + AI response)

**Autoryzacja:** Required

**Payload żądania:**

```json
{
  "title": "string (optional)",
  "user_message": "string",
  "ai_participant_id": "uuid"
}
```

**Walidacja:**

- `title`: optional, max 100 znaków; jeśli brak - auto-generated: pierwsze 50 znaków `user_message`, z "..." tylko gdy `user_message` jest dłuższy niż 50 znaków (krótka wiadomość = tytuł bez wielokropka)
- `user_message`: required, max 10,000 znaków, not empty after trim
- `ai_participant_id`: required, must belong to user, must exist

**Logika biznesowa:**

1. Walidacja inputu
2. Sprawdzenie czy użytkownik ma minimum 2 uczestników AI
3. Załadowanie pełnej historii konwersacji (jeśli kontynuacja) - w tym przypadku nowa konwersacja więc pusta
4. Wywołanie OpenRouter API z kontekstem:
   ```json
   {
     "model": "model_id from ai_participant",
     "messages": [{ "role": "user", "content": "user_message" }]
   }
   ```
5. Jeśli sukces - sekwencyjne zapisy z kompensacją (NO RPC, patrz §4.4):
   - INSERT conversation
   - INSERT user message
   - INSERT AI response message
6. Return created conversation z messages

**Struktura odpowiedzi:**

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
        "color": "string (hex)"
      },
      "created_at": "ISO 8601 datetime"
    }
  ]
}
```

**Kody sukcesu:**

- `201 Created` - Konwersacja utworzona pomyślnie

**Kody błędów:**

- `400 Bad Request` - Nieprawidłowe dane wejściowe lub użytkownik ma <2 uczestników
  ```json
  {
    "error": "Validation error",
    "details": "User must have at least 2 AI participants to start a conversation"
  }
  ```
- `401 Unauthorized` - Brak autoryzacji
- `412 Precondition Failed` - Brak skonfigurowanego klucza OpenRouter (`"No API key"`)
- (brak `403`) AI participant innego użytkownika → `404 Not Found` (anti-enumeration, §8.6)
- `404 Not Found` - AI participant nie istnieje
- `500 Internal Server Error` - Błąd serwera lub błąd 4xx z OpenRouter API (świadome mapowanie, patrz §7.1)
  ```json
  {
    "error": "OpenRouter API error",
    "details": "[message from OpenRouter]"
  }
  ```
- `502 Bad Gateway` - Problem z komunikacją z OpenRouter
- `504 Gateway Timeout` - Timeout komunikacji z OpenRouter

---

#### PUT /api/conversations/:id

**Opis:** Aktualizuj tytuł konwersacji (inline editing)

**Autoryzacja:** Required

**Parametry URL:**

- `id` (uuid) - Identyfikator konwersacji

**Payload żądania:**

```json
{
  "title": "string"
}
```

**Walidacja:**

- `title`: required, max 100 znaków, not empty after trim

**Struktura odpowiedzi:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "string",
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime"
}
```

**Kody sukcesu:**

- `200 OK` - Tytuł zaktualizowany pomyślnie

**Uwaga:** edycja tytułu NIE zmienia `updated_at` — kolumna oznacza datę ostatniej wiadomości (aktualizowana triggerem przy INSERT do `messages`), więc zmiana nazwy nie przesuwa konwersacji na górę listy „ostatnio aktywne".

**Kody błędów:**

- `400` - `"Bad Request"` (struktura: zły Content-Type, nieparsowalny JSON, zły UUID w ścieżce) lub `"Validation error"` (pusty tytuł po trim, >100 znaków; `details` per pole)
- `401 Unauthorized` - Brak autoryzacji
- (brak `403`) Konwersacja innego użytkownika → `404 Not Found`, nieodróżnialne od nieistniejącej (anti-enumeration, §8.6)
- `404 Not Found` - Konwersacja nie istnieje
- `500 Internal Server Error` - Błąd serwera

---

#### DELETE /api/conversations/:id

**Opis:** Usuń konwersację (hard delete z wszystkimi wiadomościami)

**Autoryzacja:** Required

**Parametry URL:**

- `id` (uuid) - Identyfikator konwersacji

**Struktura odpowiedzi:**

```json
{
  "message": "Conversation deleted successfully"
}
```

**Kody sukcesu:**

- `200 OK` - Konwersacja usunięta pomyślnie

**Kody błędów:**

- `401 Unauthorized` - Brak autoryzacji
- (brak `403`) Konwersacja innego użytkownika → `404 Not Found`, nieodróżnialne od nieistniejącej (anti-enumeration, §8.6)
- `404 Not Found` - Konwersacja nie istnieje
- `500 Internal Server Error` - Błąd serwera

**Uwaga:** CASCADE delete automatycznie usuwa wszystkie messages w konwersacji.

---

### 2.5. Messages

#### POST /api/conversations/:id/messages

**Opis:** Dodaj nową wiadomość do istniejącej konwersacji i otrzymaj odpowiedź AI

**Autoryzacja:** Required

**Parametry URL:**

- `id` (uuid) - Identyfikator konwersacji (nazwa parametru ujednolicona z pozostałymi endpointami `:id`)

**Payload żądania:**

```json
{
  "content": "string",
  "ai_participant_id": "uuid"
}
```

**Walidacja:**

- `content`: required, max 10,000 znaków, not empty after trim
- `ai_participant_id`: required, must belong to user, must exist

**Logika biznesowa:**

1. Walidacja inputu i autoryzacji (czy konwersacja należy do użytkownika)
2. Załadowanie PEŁNEJ historii konwersacji z bazy (wszystkie messages w tej conversation)
3. Konstrukcja kontekstu dla OpenRouter:
   ```json
   {
     "model": "model_id from ai_participant",
     "messages": [
       { "role": "user", "content": "..." }, // historyczne
       { "role": "assistant", "content": "..." }, // historyczne
       { "role": "user", "content": "..." }, // historyczne
       { "role": "assistant", "content": "..." }, // historyczne
       { "role": "user", "content": "NEW_MESSAGE" } // nowa wiadomość
     ]
   }
   ```
4. Wywołanie OpenRouter API
5. Jeśli sukces - sekwencyjne zapisy z kompensacją (NO RPC, patrz §4.4):
   - INSERT user message
   - INSERT AI response message
   - Trigger automatycznie aktualizuje `conversations.updated_at`
6. Return obie nowe wiadomości

**Struktura odpowiedzi:**

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

**Kody sukcesu:**

- `201 Created` - Wiadomości dodane pomyślnie

**Kody błędów:**

- `400 Bad Request` - Nieprawidłowe dane wejściowe
  ```json
  {
    "error": "Validation error",
    "details": "Message content cannot be empty"
  }
  ```
- `401 Unauthorized` - Brak autoryzacji
- `412 Precondition Failed` - Brak skonfigurowanego klucza OpenRouter (`"No API key"`)
- (brak `403`) Konwersacja lub AI participant innego użytkownika → `404 Not Found` (anti-enumeration, §8.6)
- `404 Not Found` - Konwersacja lub AI participant nie istnieją
- `500 Internal Server Error` - Błąd serwera lub błąd 4xx z OpenRouter API (świadome mapowanie, patrz §7.1)
  ```json
  {
    "error": "OpenRouter API error",
    "details": "[exact message from OpenRouter]"
  }
  ```
  lub
  ```json
  {
    "error": "Invalid response",
    "details": "Received invalid response from OpenRouter. Please try again."
  }
  ```
- `502 Bad Gateway` - Problem z komunikacją z OpenRouter
- `504 Gateway Timeout` - Timeout komunikacji z OpenRouter

**Uwaga krytyczna:**

- **PEŁEN KONTEKST:** Endpoint MUSI załadować ALL messages z conversation i wysłać jako kontekst do OpenRouter
- **NIE-STREAMING:** OpenRouter API call używa non-streaming mode
- **AUTO-SAVE:** para wiadomości (user + AI) zapisywana sekwencyjnie z kompensacją przy błędzie (NO RPC, §4.4); nic nie jest zapisywane przed sukcesem OpenRouter

---

### 2.6. Auth (sesja przeglądarkowa)

Endpointy pośredniczące między formularzami a Supabase Auth (decyzja 2026-09-12, E3, lekcja 3x1). Ustawiają i kasują cookies sesji przez `@supabase/ssr`; kod w przeglądarce nigdy nie rozmawia z Supabase Auth bezpośrednio, więc klient Supabase i klucz anon nie trafiają do JavaScriptu strony. Szczegóły mechanizmu: §3.1; architektura: ap6.

#### POST /api/auth/login

**Opis:** Logowanie e-mail + hasło (`signInWithPassword`); przy sukcesie odpowiedź niesie `Set-Cookie` z sesją

**Autoryzacja:** Public

**Payload żądania:**

```json
{
  "email": "string",
  "password": "string"
}
```

**Walidacja:**

- `email`: required, trim, format e-mail
- `password`: required, min 6 znaków (`minimum_password_length` w Supabase)

**Struktura odpowiedzi:**

```json
{
  "user": {
    "id": "uuid",
    "email": "string"
  }
}
```

**Kody sukcesu:**

- `200 OK` - Zalogowano, cookies sesji ustawione

**Kody błędów:**

- `400 Bad Request` - Zły `Content-Type` lub nieparsowalny JSON (konwencja globalna, §5.2)
- `400 Validation error` - `details` per pole (`email`, `password`)
- `401 Unauthorized` - Nieprawidłowe dane logowania albo konto niepotwierdzone; `details` = komunikat Supabase 1:1 (np. `Invalid login credentials`, `Email not confirmed`)
- `500 Internal Server Error` - Błąd serwera

**Uwaga UI:** jedyny przypadek, w którym `401` nie znaczy „idź do logowania" — użytkownik już jest na stronie logowania; formularz pokazuje `details` inline.

---

#### POST /api/auth/register

**Opis:** Rejestracja e-mail + hasło (`signUp` z `emailRedirectTo = <origin>/login`)

**Autoryzacja:** Public

**Payload żądania:** jak `POST /api/auth/login`

**Walidacja:** jak `POST /api/auth/login`

**Struktura odpowiedzi:**

```json
{
  "user": {
    "id": "uuid",
    "email": "string"
  },
  "confirmation_required": false
}
```

- `confirmation_required = false` (weryfikacja e-mail wyłączona, local dev): sesja ustawiona w cookies, użytkownik od razu zalogowany
- `confirmation_required = true` (produkcja): brak sesji; użytkownik potwierdza adres i loguje się. Przy włączonej weryfikacji Supabase zwraca sukces także dla już zarejestrowanego adresu (własny anti-enumeration) — endpoint tego nie „poprawia"

**Kody sukcesu:**

- `201 Created` - Konto utworzone

**Kody błędów:**

- `400 Bad Request` - Zły `Content-Type` lub nieparsowalny JSON
- `400 Validation error` - `details` per pole; także reguły hasła egzekwowane przez Supabase (`details` 1:1)
- `409 Conflict` - Adres już zarejestrowany (kod Supabase `user_already_exists`; występuje tylko przy wyłączonej weryfikacji)
- `500 Internal Server Error` - Błąd serwera

---

#### POST /api/auth/logout

**Opis:** Wylogowanie (`signOut`); kasuje cookies sesji

**Autoryzacja:** Required (cookie lub Bearer)

**Payload żądania:** Brak. Wyjątek od wymogu `Content-Type: application/json` — endpoint nie czyta body (komentarz w kodzie)

**Struktura odpowiedzi:**

```json
{
  "message": "Logged out successfully"
}
```

**Kody sukcesu:**

- `200 OK` - Wylogowano

**Kody błędów:**

- `401 Unauthorized` - Brak sesji
- `500 Internal Server Error` - Błąd serwera

---

## 3. Uwierzytelnianie i autoryzacja

### 3.1. Mechanizm uwierzytelniania

**Typ:** Supabase Auth (JWT). Dwa nośniki tokenu (decyzja 2026-09-12, E3, lekcja 3x1):

1. **Sesja cookie (przeglądarka)** — cookies `HttpOnly` ustawiane i czytane wyłącznie po stronie serwera przez `@supabase/ssr` (`createServerClient`, wyłącznie `getAll`/`setAll`). Middleware buduje klienta z cookies żądania i woła `auth.getUser()`; przy wygasłym access tokenie klient odświeża sesję refresh tokenem i zapisuje nowe cookies w odpowiedzi. Strony Astro (SSR) mają użytkownika w `Astro.locals.user` już przy renderze.
2. **Nagłówek `Authorization: Bearer <token>`** — klienci nieprzeglądarkowi (smoke testy curl, przyszłe integracje). Middleware weryfikuje token przez `auth.getUser(token)` i buduje klienta Supabase z tym tokenem.

Kolejność w middleware: nagłówek Bearer ma pierwszeństwo; w jego braku sprawdzana jest sesja cookie. Obie ścieżki kończą się identycznie: `locals.user` + `locals.supabase` działający w kontekście użytkownika (RLS przez `auth.uid()`).

**Token:** `sub` = `user_id` (UUID); ważność 1 h (`jwt_expiry`); rotacja refresh tokenów włączona (`supabase/config.toml`).

**Refresh token:**

- ścieżka cookie — odświeżanie serwerowe w middleware (biblioteka), bez udziału kodu strony
- ścieżka Bearer — odpowiedzialność klienta (`POST /auth/v1/token?grant_type=refresh_token`)

**Żądanie bez sesji:** `/api/*` → `401` JSON; strona → `302` na `/login`. Zalogowany na `/login` lub `/register` → `302` na `/`.

**Historia:** do 2026-09-12 plan zakładał wyłącznie Bearer bez cookies („stateless", dawne §8.5) — model odpowiedni dla API, ale ślepy dla stron SSR i wymagający tokenu w JavaScripcie przeglądarki. Lekcja 3x1 i asset `supabase-auth.mdc` ustawiają sesję w cookies; Bearer zostaje jako drugi nośnik, żeby nie tracić 95 smoke testów curl.

### 3.2. Row-Level Security (RLS)

**Każdy endpoint API używa RLS policies na poziomie bazy danych:**

**user_settings:**

```sql
-- SELECT, INSERT, UPDATE (brak DELETE: rekord żyje z kontem, CASCADE z auth.users)
(auth.uid() = user_id)
```

**ai_participants:**

```sql
-- SELECT, INSERT, UPDATE, DELETE (UPDATE nieużywany w MVP — brak edycji uczestnika — ale polityka istnieje)
(auth.uid() = user_id)
```

**conversations:**

```sql
-- SELECT, INSERT, UPDATE, DELETE
(auth.uid() = user_id)
```

**messages:**

```sql
-- SELECT, INSERT, DELETE (brak UPDATE: wiadomości immutable; DELETE używany przez cleanup w POST /api/conversations/:id/messages)
EXISTS (
  SELECT 1 FROM conversations
  WHERE conversations.id = messages.conversation_id
  AND conversations.user_id = auth.uid()
)
```

**Bezpieczeństwo:**

- Użytkownik widzi TYLKO swoje dane
- Niemożliwy dostęp do danych innych użytkowników nawet przy błędzie w kodzie aplikacji
- RLS działa na poziomie bazy - dodatkowa warstwa ochrony

### 3.3. Autoryzacja na poziomie endpointów

**Wszystkie endpointy wymagają autoryzacji** z wyjątkiem:

- `POST /api/auth/login`, `POST /api/auth/register` (§2.6) — publiczne. `POST /api/auth/logout` wymaga sesji
- Bezpośrednie endpointy Supabase Auth (`/auth/v1/*`) — poza aplikacją; smoke testy pozyskują nimi token Bearer

**Middleware flow:**

1. Ścieżka publiczna (`/login`, `/register`, `/api/auth/login`, `/api/auth/register`, statyki `/_astro/*`, `/assets/*`, `/favicon.ico`) → przepuść bez użytkownika (na `/login` i `/register` strona sama sprawdza sesję cookie, żeby przekierować zalogowanego)
2. Nagłówek `Authorization: Bearer` → weryfikacja tokenu przez Supabase → `locals.user`, klient z tokenem
3. W przeciwnym razie klient cookie (`@supabase/ssr`) → `auth.getUser()` → `locals.user`, ten sam klient (z ewentualnym odświeżeniem cookies)
4. Brak użytkownika: `/api/*` → `401`, strona → redirect `/login`
5. RLS filtruje dane automatycznie (`auth.uid()` z tokenu)

---

## 4. Walidacja i logika biznesowa

### 4.1. Warunki walidacji per zasób

#### User Settings

- **openrouter_api_key:**
  - Typ: string
  - Required przy zapisie
  - Walidacja: API ping do OpenRouter (timeout 10s)
  - Hard block przy błędzie walidacji

#### AI Participants

- **alias:**
  - Typ: string
  - Required: true
  - Max length: 30 znaków
  - Pattern: alfanumeryczne + spacje + znaki (-, _, .) + wymagany co najmniej jeden znak alfanumeryczny (regex z lookaheadem; blokuje "___", "...")
  - Unique: per user
- **model_id:**
  - Typ: string
  - Required: true
  - Max length: 150 znaków
  - Walidacja: tylko format (string, max 150 znaków). Bez re-walidacji przez listę OpenRouter — dropdown w UI już ją wykonał, a ponowny fetch listy przy każdym POST (nawet ~30 s w najgorszym razie) łamałby separation of concerns. Decyzja z sesji planistycznych, potwierdzona przy implementacji endpointu.
- **color:**
  - Typ: string
  - Required: true
  - Pattern: hex format #RRGGBB
  - Generator: losowy w MVP

#### Conversations

- **title:**
  - Typ: string
  - Max length: 100 znaków
  - Default: auto-generated — pierwsze 50 znaków user message, "..." tylko gdy obcięto
  - Nie może być pusty (after trim)

#### Messages

- **content:**
  - Typ: string (TEXT w bazie)
  - Required: true
  - Max length: 10,000 znaków (walidacja w aplikacji)
  - Nie może być pusty (after trim)
- **ai_participant_id:**
  - Typ: UUID
  - Required: tylko dla role='assistant'
  - NULL dla role='user'
  - Must belong to current user
  - Must exist

### 4.2. Implementacja logiki biznesowej w API

#### Onboarding Flow

**Endpoint sprawdza completion status:**

- `GET /api/user-settings` → czy `openrouter_api_key IS NOT NULL`
- `GET /api/ai-participants` → czy count >= 2

**Business rule:** User nie może rozpocząć konwersacji jeśli ma <2 uczestników AI

#### Tworzenie konwersacji (POST /api/conversations)

**Workflow:**

1. Walidacja minimum 2 uczestników (business rule)
2. Generowanie tytułu z user message jeśli nie podany
3. API call do OpenRouter z kontekstem
4. Sekwencyjne zapisy z kompensacją (NO RPC, §4.4):
   - INSERT conversation
   - INSERT user message
   - INSERT AI response
5. Auto-update `conversations.updated_at` przez trigger

**Rezultat:** Baza nigdy nie zawiera orphaned conversations bez wiadomości

#### Dodawanie wiadomości (POST /api/conversations/:id/messages)

**Workflow - KRYTYCZNY DLA FUNKCJONALNOŚCI:**

1. Załadowanie WSZYSTKICH messages z conversation (ORDER BY created_at ASC)
2. Konstrukcja pełnego kontekstu dla OpenRouter:
   ```javascript
   const context = messages.map((msg) => ({
     role: msg.role,
     content: msg.content,
   }));
   context.push({ role: "user", content: newMessageContent });
   ```
3. API call do OpenRouter z PEŁNYM kontekstem
4. Sekwencyjne zapisy z kompensacją (NO RPC, §4.4):
   - INSERT user message
   - INSERT AI response
5. Trigger aktualizuje `conversations.updated_at`

**Uzasadnienie:** Każdy model AI musi widzieć PEŁNĄ historię konwersacji, niezależnie od tego który uczestnik odpowiadał wcześniej. To jest CORE VALUE PROPOSITION aplikacji - shared context między modelami.

#### Usuwanie uczestnika (DELETE /api/ai-participants/:id)

**Workflow:**

1. Hard delete z bazy
2. Foreign key `ON DELETE SET NULL` automatycznie ustawia `messages.ai_participant_id = NULL`
3. UI layer obsługuje displayName="(Deleted Participant)" w szarym kolorze

**Rezultat:** Historia konwersacji zachowana, alias ponownie dostępny

#### Walidacja klucza OpenRouter (PUT /api/user-settings)

**Workflow:**

1. API ping do OpenRouter z nowym kluczem
2. Timeout: 10 sekund
3. Hard block zapisu przy błędzie lub timeout
4. Return error z exact message z OpenRouter API

**Error handling:**

- Timeout → dialog z komunikatem o timeout
- Invalid key → dialog z message z OpenRouter
- Network error → generic network error message

#### Character counter w UI

**Logika:**

- Widoczny od 9000 znaków
- Format: "9000/10000"
- Hard limit: 10,000 (block input)
- Walidacja server-side również sprawdza max 10k

#### Obsługa błędów OpenRouter w konwersacji

**Uniwersalny mechanizm:**

- Jeden dialog dla wszystkich błędów
- Wyświetla message 1:1 z OpenRouter lub generic dla invalid format
- Input box NIE jest czyszczony (zachowuje tekst)
- User może retry z innym uczestnikiem lub poprawić błąd

**Typy błędów:**

- `timeout` → komunikat aplikacji: `OpenRouter request timed out` (504); przy walidacji klucza: `OpenRouter API key validation timed out after 10 seconds` (408). Przy timeoucie OpenRouter nie odpowiada, więc nie ma jego komunikatu
- `invalid/expired key` → message z OpenRouter
- `rate limit exceeded` → message z OpenRouter
- `invalid response format` → "Received invalid response from OpenRouter. Please try again."
- `network error` → "Network error - check your connection."

### 4.3. Business rules enforcement

**Minimum 2 uczestników:**

- Sprawdzane przy POST /api/conversations
- Dropdown disabled w UI gdy <2 participants (tooltip)
- Server-side hard block z 400 Bad Request

**Forced participant selection:**

- Dropdown NIE zapamiętuje ostatniego wyboru
- Użytkownik MUSI świadomie wybrać przy KAŻDEJ wiadomości
- Sortowanie alfabetyczne po aliasie (kolejność dostarczana przez `GET /api/ai-participants`, patrz §2.2)

**No orphaned conversations:**

- Konwersacja tworzona dopiero po pierwszej pomyślnej wymianie
- Jeśli OpenRouter API fail → konwersacja NIE jest zapisywana
- Zapisy sekwencyjne z cleanupem przy błędzie; nic nie jest zapisywane przed sukcesem OpenRouter (NO RPC, §4.4)

**Immutable messages:**

- Brak endpoint do edycji wiadomości
- Brak kolumny `updated_at` w messages table
- Messages są append-only

**Single-tab assumption:**

- Brak real-time sync między tabs
- Brak websockets
- User odpowiedzialny za refresh jeśli używa wielu tabs

### 4.4. Zapisy wieloetapowe: NO RPC

**Decyzja projektowa:** żadnych funkcji RPC w PostgreSQL ani transakcji po stronie bazy dla operacji zapisu.
Endpointy zapisujące więcej niż jeden wiersz (`POST /api/conversations`, `POST /api/conversations/:id/messages`)
wykonują sekwencyjne `.insert()` przez Supabase client i przy błędzie któregokolwiek kroku robią jawny cleanup:

- `POST /api/conversations`: błąd po INSERT conversation → `DELETE conversation` (CASCADE usuwa wiadomości)
- `POST /api/conversations/:id/messages`: błąd INSERT odpowiedzi AI → `DELETE` wiadomości użytkownika
- OpenRouter jest wywoływany PRZED pierwszym INSERT, więc błąd OpenRoutera nie wymaga cleanupu
- nieudany cleanup jest logowany z `severity: "CRITICAL"`

**Konsekwencja:** atomowość jest aplikacyjna, nie transakcyjna (przy padzie procesu między insertami cleanup może
się nie wykonać). Świadomy trade-off na rzecz prostoty MVP; przy skalowaniu wraca jako dług techniczny.
Ograniczenie dotyczy tylko zapisów — dla odczytów wolno używać embedded counts i JOIN-ów PostgREST.

---

## 5. Konwencje HTTP i formaty

### 5.1. HTTP Methods

- `GET` - Pobieranie zasobów
- `POST` - Tworzenie nowych zasobów
- `PUT` - Aktualizacja istniejących zasobów (full update)
- `DELETE` - Usuwanie zasobów

### 5.2. Status Codes

**Success:**

- `200 OK` - Sukces dla GET, PUT, DELETE
- `201 Created` - Sukces dla POST

**Client Errors:**

- `400 Bad Request` - Nieprawidłowe dane wejściowe. Konwencja globalna (nie powtarzana per endpoint): każdy endpoint przyjmujący body zwraca `400 "Bad Request"` przy braku/złym `Content-Type: application/json` i przy nieparsowalnym JSON; każdy endpoint z parametrem `:id` zwraca `400 "Bad Request"` przy złym formacie UUID (`details: { "id": "Invalid id" }`). Reguły biznesowe na poprawnym JSON: `400 "Validation error"` (§5.3)
- `401 Unauthorized` - Brak lub nieprawidłowy token; także nieudane logowanie na `POST /api/auth/login` (§2.6)
- `403 Forbidden` - NIEUŻYWANY: cudzy zasób zwraca `404` (anti-enumeration, §8.6)
- `404 Not Found` - Zasób nie istnieje
- `408 Request Timeout` - Timeout walidacji
- `409 Conflict` - Konflikt (duplicate alias; adres już zarejestrowany przy `POST /api/auth/register`)
- `412 Precondition Failed` - Brak skonfigurowanego klucza OpenRouter (`"No API key"`); 401 jest zarezerwowane dla braku/nieważności sesji, więc UI rozgałęzia po statusie (login vs ustawienia), nie po etykiecie

**Server Errors:**

- `500 Internal Server Error` - Ogólny błąd serwera
- `502 Bad Gateway` - Problem z external API (OpenRouter)
- `504 Gateway Timeout` - Timeout external API

### 5.3. Response Format

**Success response:**

```json
{
  // resource data lub array of resources
}
```

**Error response:**

```json
{
  "error": "Error type",
  "details": "Detailed error message" | { "field": "message" }
}
```

`details` jest stringiem (komunikat ogólny) albo mapą `pole → komunikat` (błędy walidacji per pole).

**Etykiety `error` — dualny standard dla 400:**

- `"Bad Request"` — problem **strukturalny**: brak/zły `Content-Type`, nieparsowalny JSON, zły format UUID w parametrze ścieżki. Klient wysłał coś, czego serwer nie umie przetworzyć.
- `"Validation error"` — dane strukturalnie poprawne, ale łamią **reguły biznesowe** (schemat Zod na body: za długie, puste po trim, zły format; reguły typu „min. 2 uczestników"). `details` to mapa per pole albo string dla reguły ogólnej.

To rozróżnienie mówi konsumentowi API, czy problem jest w _formie_ żądania, czy w _treści_ danych.
(Stan kodu: `PUT /api/user-settings` zwraca dziś `"Bad Request"` także dla błędów Zod na body — znany dług, do wyrównania.)

**Pozostałe etykiety w użyciu:** `"Unauthorized"` (401, brak/nieważny token; nieudane logowanie), `"No API key"` (412, brak skonfigurowanego klucza OpenRouter: uwierzytelniony, ale bez warunku wstępnego),
`"Invalid API key"` (400 przy PUT ustawień), `"Validation timeout"` (408), `"Not Found"` (404), `"Conflict"` (409),
`"OpenRouter API error"` (500, błąd 4xx z OpenRoutera, `details` 1:1), `"Bad Gateway"` (502), `"Gateway Timeout"` (504),
`"Internal Server Error"` (500).

### 5.4. Timestamps

- Format: ISO 8601 (UTC)
- Przykład: `2025-01-14T10:30:00.000Z`
- Wszystkie timestamps w PostgreSQL jako `TIMESTAMPTZ`

### 5.5. UUIDs

- Format: UUID v4
- Przykład: `550e8400-e29b-41d4-a716-446655440000`
- Generowane przez PostgreSQL: `gen_random_uuid()`

### 5.6. Nagłówki odpowiedzi

- `Content-Type: application/json; charset=utf-8` na każdej odpowiedzi
- `Cache-Control: no-store` na każdej odpowiedzi (sukces i błąd): dane są per użytkownik, a odpowiedź ustawień zawiera klucz API

---

## 6. Performance Considerations

### 6.1. Query Optimization

- Wykorzystanie composite indexes dla sortowania:
  - `conversations(user_id, updated_at DESC)`
  - `messages(conversation_id, created_at ASC)`
- Indeksy na kolumnach FK jawne (PostgreSQL nie tworzy ich automatycznie) — patrz plan bazy §4

### 6.2. N+1 Prevention

- JOIN messages z ai_participants przy GET /api/conversations/:id
- Single query zamiast N queries dla participants

### 6.3. Caching

- Brak caching w MVP (YAGNI). Każda odpowiedź API (sukces i błąd) niesie `Cache-Control: no-store` (§5.6). (Stan kodu: na części odpowiedzi błędów nagłówka jeszcze brakuje — znany dług, do wyrównania.)
- Future: cache dla OpenRouter models list

### 6.4. Rate Limiting

- Brak rate limiting w MVP po stronie aplikacji
- OpenRouter ma własne limits
- Future: implementacja rate limiting per user

---

## 7. External API Integration

### 7.1. OpenRouter API

**Base URL:** `https://openrouter.ai/api/v1`

**Używane endpointy:**

1. **POST /chat/completions** - Wysyłanie wiadomości do modelu
2. **GET /models** - Pobieranie listy dostępnych modeli (proxy endpoint)
3. **GET /key** - Walidacja klucza OpenRouter API użytkownika poprzez pobranie jego danych

**Authentication:**

- Header: `Authorization: Bearer <user's openrouter_api_key>`
- Klucz API z `user_settings.openrouter_api_key`

**Request format dla chat:**

```json
{
  "model": "model_id",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response format:**

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "AI response text"
      }
    }
  ]
}
```

**Error handling:**

- Parse exact error message z OpenRouter
- Timeout: 10 s dla walidacji klucza (`GET /key`), 30 s dla `GET /models` i `POST /chat/completions`
- Network errors: catch i przekaż generic message
- Błędy 4xx z OpenRoutera (401 nieważny/wygasły klucz, 402 brak środków, 429 limit) → nasze `500` z etykietą `"OpenRouter API error"` i `details` 1:1 z OpenRoutera. Świadoma decyzja MVP (2026-09-09): UI pokazuje treść w jednym dialogu, więc rozróżnienie po etykiecie wystarcza. Uwaga: to nie jest błąd serwera — w monitoringu odróżniać po etykiecie; kandydat na V2: `424 Failed Dependency`. Błędy 5xx OpenRoutera → `502 Bad Gateway`, timeout → `504 Gateway Timeout`

**Role wiadomości:** tylko `user` i `assistant`; rola `system` świadomie poza MVP.

**Non-streaming:**

- MVP używa non-streaming responses
- Brak Server-Sent Events (SSE)
- Future: implementacja streaming

---

## 8. Security Considerations

### 8.1. API Key Storage

**MVP:**

- Plaintext w bazie (`user_settings.openrouter_api_key`)
- Ochrona przez strong RLS policies

**V2:**

- Szyfrowanie pgcrypto: `pgp_sym_encrypt(key, passphrase)`
- Deszyfrowanie przy użyciu: `pgp_sym_decrypt(encrypted_key, passphrase)`

### 8.2. Input Validation

- Server-side walidacja ZAWSZE
- Client-side walidacja dla UX (nie dla security)
- Sanityzacja inputu przed zapisem do bazy
- Prepared statements (Supabase Client automatycznie)

### 8.3. SQL Injection Prevention

- Supabase Client używa prepared statements
- Brak raw SQL queries w aplikacji
- RLS jako dodatkowa warstwa ochrony

### 8.4. XSS Prevention

- Sanityzacja content przed renderowaniem w UI
- React automatycznie escape'uje text content
- Brak `dangerouslySetInnerHTML` w MVP

### 8.5. CSRF Protection

Sesja przeglądarkowa żyje w cookies (decyzja 2026-09-12, E3), więc CSRF wymaga jawnej obrony — trzy niezależne warstwy:

- Cookies sesji `HttpOnly`, `Secure`, `SameSite=Lax`: przeglądarka nie dołącza ich do cross-site `POST`/`PUT`/`DELETE` (dołącza do nawigacji `GET`, które w tym API nic nie zmienia)
- Każdy endpoint modyfikujący wymaga `Content-Type: application/json` (§5.2): formularz HTML wysłany cross-site (`application/x-www-form-urlencoded`, `multipart/form-data`) dostaje `400` zanim dotknie logiki, a JSON cross-origin z JavaScriptu wymaga preflightu CORS, na który serwer nie odpowiada zgodą (brak nagłówków CORS = same-origin only)
- Brak akcji zmieniających stan przez `GET`

Wyjątek `POST /api/auth/logout` (bez body, więc bez wymogu `Content-Type`): najgorszy skutek CSRF to wylogowanie użytkownika — akceptowalne, a `SameSite=Lax` i tak blokuje cross-site `POST`. Ścieżka Bearer jest stateless — CSRF jej nie dotyczy.

### 8.6. Anti-enumeration: 404 zamiast 403

Dla zasobów adresowanych po `:id` (uczestnik, konwersacja) API **nigdy nie zwraca `403`** dla cudzego zasobu.
„Nie istnieje" i „nie należy do Ciebie" dają identyczną odpowiedź `404 Not Found`.

**Powód:** różnica 403/404 to information disclosure — pozwala atakującemu enumerować istniejące UUID-y
i budować wiedzę „zasób X istnieje, ale należy do kogoś innego". Standard w REST API: 404 dla obu przypadków.

**Mechanizm:** RLS izoluje dane, więc authed client zwraca `null` dla cudzego zasobu tak samo jak dla
nieistniejącego; handler mapuje oba przypadki na `404`. Dodatkowo handlery filtrują jawnie po `user_id`
(defense-in-depth). Każde wystąpienie w kodzie ma komentarz z tym uzasadnieniem.

---

## 9. Testing Strategy

Stan 2026-09-12 (lekcja 3x2, decyzja E4). Pełny plan testów: `specs_ai/ap8-test-plan-pl.md`; konwencje w repo:
`.claude/rules/testing.md`.

### 9.1. Unit Tests (Vitest, bez sieci i bazy)

- Helpery i walidacja: `format.ts`, `color.ts`, `api-client.ts` (mapowanie błędów, 401 → `/login`, 412 → `/settings`),
  `authCredentialsSchema` + kliencki mirror, `extractBearerToken`, `onboarding-gate.ts`
- Logika serwisów bez zapytań: `resolveOnboardingStep`, `getOnboardingStatus` (serwisy zależne mockowane), serwis
  OpenRouter przez szew `fetch` (timeouty, klasy błędów, normalizacja odpowiedzi)
- Hooki widoków (jsdom, mock `api-client`): semantyka 404/412, stan `pending`, mutacje lokalne listy
- Po ekstrakcji (3x4, ap8 P4): `formatZodErrors`, `jsonError`, mapowanie błędów OpenRouter → HTTP, auto-tytuł
  (minimum 2 uczestników i tytuł z §2.4), budowa kontekstu (pełna historia), predykaty middleware

### 9.2. Integration Tests = smoke curl (`sketch/smoke-baseline.sh`, poza repo aplikacji)

- Realny serwer, Supabase lokalny, OpenRouter i RLS między kontami; obie ścieżki sesji (Bearer i cookie)
- Endpointy 1:1 z tym dokumentem: statusy, etykiety, walidacja, 412 bez klucza, 404 anti-enumeration, triggery,
  CASCADE / SET NULL; uruchamiany przed commitem zmian endpointów, serwisów lub migracji, wynik w `sketch/baseline-<data>.out`
- Testów endpointów z mockiem OpenRoutera w Vitest NIE piszemy (E4): dublowałyby smoke z gorszą wiernością
- Kompensacja przy błędzie zapisu (cleanup konwersacji / wiadomości użytkownika — atomowość aplikacyjna, nie
  transakcyjna) nie jest osiągalna curlem; kandydat na unit z fałszywym builderem Supabase (ap8 P2b, po 3x4)

### 9.3. E2E Tests (Playwright, lekcja 3x3)

- User flow: register/login → onboarding → create participant → new conversation → send message
- Error scenarios: invalid API key, network timeout
- Delete scenarios: conversation delete, participant delete
- Koszt wywołań OpenRoutera w E2E → decyzja o stubie w 3x3

---

## 10. API Versioning

### 10.1. MVP Strategy

- Brak versioning w MVP
- Wszystkie endpointy bez prefiksu `/v1`
- Future: wprowadzenie `/v1` przy breaking changes

### 10.2. Future Considerations

- Semantic versioning przy major changes
- Deprecation warnings przed usunięciem endpoint
- Backward compatibility gdzie możliwe

---

## 11. Monitoring i Logging

### 11.1. MVP Logging

- Error logging do console/stdout
- OpenRouter API errors z full message
- Database errors z sanitized messages (bez credentials)

### 11.2. Future Monitoring

- Request latency tracking
- Error rate monitoring
- OpenRouter API usage tracking
- Token consumption analytics

---

## 12. Documentation

### 12.1. API Documentation

- Ten dokument jako primary source
- Future: OpenAPI/Swagger specification
- Code comments w endpoint handlers

### 12.2. Developer Onboarding

- README z setup instructions
- Environment variables documentation
- Database migration guide

---

## Podsumowanie

Ten plan API zapewnia:
✅ **Pełną izolację danych** przez RLS policies  
✅ **Shared context** między modelami przez pełne ładowanie historii  
✅ **Business logic enforcement** (min 2 participants, no orphaned conversations)  
✅ **Bezpieczne przechowywanie** klucza OpenRouter API  
✅ **Walidację** na poziomie aplikacji z clear error messages  
✅ **Spójność zapisów wieloetapowych** przez sekwencyjne inserty z kompensacją (NO RPC — świadomy trade-off MVP)  
✅ **Extensibility** z clear separation of concerns
