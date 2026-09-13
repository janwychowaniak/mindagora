## API Endpoint Implementation Plan: GET /api/user-settings

## 1. Przegląd punktu końcowego

Endpoint zwraca ustawienia **aktualnie zalogowanego użytkownika** z tabeli `public.user_settings` (relacja 1:1 z `auth.users`). Rekord `user_settings` powinien istnieć zawsze, bo jest automatycznie tworzony przez trigger po rejestracji.

- **Metoda**: GET
- **Ścieżka**: `/api/user-settings`
- **Autoryzacja**: wymagana (Supabase Auth)
- **Źródło danych**: `public.user_settings`
- **Wrażliwe dane**: `openrouter_api_key` (secret użytkownika; zwracamy go tylko właścicielowi)

### Wykorzystywane typy (DTO / Command)

- **DTO**:
  - `UserSettingsDTO` (z `src/types.ts`; alias do `Tables<"user_settings">`)
  - `ApiErrorResponseDTO` (z `src/types.ts`; standard błędów dla 4xx/5xx)
- **Command modele**: brak (GET nie ma body)
- **Opcjonalnie (dla czytelności API)**:
  - `GetUserSettingsResponseDTO = UserSettingsDTO` (alias w `src/types.ts`)

## 2. Szczegóły żądania

- **Metoda HTTP**: `GET`
- **URL**: `/api/user-settings`
- **Parametry**:
  - **Wymagane**: brak
  - **Opcjonalne**: brak
- **Request Body**: brak
- **Nagłówki**:
  - **Wymagane**: `Authorization: Bearer <access_token>` (JWT z Supabase Auth)
  - **Opcjonalne**: `Accept: application/json`

> Źródło w repo (ustalony kontrakt auth): `.ai/ap5-api-plan-pl.md` → "Token przekazywany w header: `Authorization: Bearer <token>`".

## 3. Szczegóły odpowiedzi

### 3.1. Sukces

- **Status**: `200 OK`
- **Body** (`application/json`):

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "openrouter_api_key": "string | null",
  "created_at": "ISO 8601 datetime"
}
```

- **Nagłówki (zalecane)**:
  - `Content-Type: application/json; charset=utf-8`
  - `Cache-Control: no-store` (bo odpowiedź zawiera secret)

### 3.2. Błędy

Wszystkie odpowiedzi błędów powinny zwracać `ApiErrorResponseDTO`:

```json
{
  "error": "string",
  "details": "string | { [field: string]: string }"
}
```

- `401 Unauthorized` — brak lub nieprawidłowy token
- `404 Not Found` — ustawienia nie istnieją (edge-case; trigger powinien temu zapobiec)
- `500 Internal Server Error` — błąd serwera / Supabase

## 4. Przepływ danych

### 4.1. Przepływ wysokopoziomowy

1. **Endpoint** odbiera request i odczytuje nagłówek `Authorization`.
2. Parsuje i waliduje format `Bearer <token>`.
3. **Weryfikuje token** w Supabase Auth (żeby rozróżnić 401 vs inne błędy) i pobiera `user.id`.
4. Wykonuje SELECT na `user_settings` dla bieżącego użytkownika.
5. Zwraca `200` z rekordem lub odpowiedni błąd.

### 4.2. Krytyczny detal: RLS i „authed Supabase client”

Tabela `user_settings` ma RLS policy: `auth.uid() = user_id` (z migracji `supabase/migrations/20250114120800_enable_rls.sql`). Żeby SELECT zadziałał, zapytanie do bazy **musi być wykonane w kontekście JWT użytkownika**.

Zalecany wzorzec (żeby nie powielać logiki w każdym endpointzie):

- **Service/helper** tworzy per-request Supabase client skonfigurowany z nagłówkiem `Authorization: Bearer <token>` (bez używania service-role key).
- Endpoint używa tego klienta do zapytań DB, dzięki czemu RLS działa „z automatu”.

## 5. Względy bezpieczeństwa

- **Sekret w odpowiedzi**: `openrouter_api_key` to wrażliwa wartość.
  - Ustaw `Cache-Control: no-store`.
  - Nie loguj wartości klucza (maskuj/usuń z logów).
- **Autoryzacja**:
  - Wymagaj `Authorization: Bearer ...`.
  - Nie ujawniaj szczegółów walidacji tokena w odpowiedzi (wystarczy spójny komunikat 401).
- **Izolacja danych**:
  - Nie używaj `SUPABASE_SERVICE_ROLE_KEY` do tego endpointu.
  - Polegaj na RLS (`auth.uid() = user_id`) i dodatkowym `eq('user_id', user.id)` jako „belt & suspenders”.
- **Minimalizacja ekspozycji**:
  - `select()` tylko wymagane kolumny (`id`, `user_id`, `openrouter_api_key`, `created_at`).

## 6. Obsługa błędów

### 6.1. Scenariusze i mapowanie na statusy

- **Brak nagłówka `Authorization` lub zły format** → `401 Unauthorized`
  - `error`: "Unauthorized"
  - `details`: "Missing or invalid Authorization header"
- **Token wygasły / nieprawidłowy** (Supabase Auth zwraca błąd walidacji) → `401 Unauthorized`
  - `error`: "Unauthorized"
  - `details`: "Invalid or expired token"
- **Brak rekordu w `user_settings`** (nie powinno się zdarzyć) → `404 Not Found`
  - `error`: "Not found"
  - `details`: "User settings not found"
- **Błąd Supabase/DB/Unexpected error** → `500 Internal Server Error`
  - `error`: "Internal Server Error"
  - `details`: krótki, niesekretny opis (bez tokenów/kluczy)

### 6.2. Logowanie błędów

W aktualnym schemacie/migracjach nie ma tabeli do logowania błędów (w `.ai/ap5-api-plan-pl.md` MVP zakłada "Error logging do console/stdout").

- Loguj po stronie serwera (`console.error`) w formie ustrukturyzowanej:
  - `route`, `method`, `status`, `supabase_error_code` (jeśli jest), `request_id` (jeśli dodamy)
  - **bez** `Authorization` header i bez `openrouter_api_key`

## 7. Wydajność

- **Jednoznaczny lookup** po `user_id` (UNIQUE constraint → indeks automatyczny). Zapytanie powinno być O(1).
- Brak pagination i brak joinów.
- Brak cache (celowo), bo zwracamy secret.

## 8. Kroki implementacji

1. **Dodaj brakującą zależność do walidacji**
   - Zainstaluj `zod` (wymagane przez zasady projektu: "Use Zod schemas to validate data exchanged with the backend").

2. **Utwórz strukturę dla endpointów API**
   - Dodaj katalog: `src/pages/api/` (obecnie nie istnieje).

3. **Ujednolić typ Supabase client (zgodnie z zasadami backend)**
   - W `src/db/supabase.client.ts` wyeksportuj projektowy typ `SupabaseClient` (zamiast importowania typu bezpośrednio z `@supabase/supabase-js` w innych miejscach).
   - Zaktualizuj `src/env.d.ts`, aby `App.Locals.supabase` używał tego typu.

4. **Dodaj serwis do obsługi auth (re-używalny dla wszystkich endpointów)**
   - Utwórz `src/lib/services/auth.service.ts` (i katalog `src/lib/services/`, jeśli brak).
   - Funkcje:
     - `extractBearerToken(request)` → zwraca token lub `null`.
     - `getAuthenticatedUser({ supabase, token })` → weryfikuje token w Supabase Auth i zwraca `user`.
     - `createAuthedSupabaseClient(token)` (lub analogiczna fabryka) → zwraca Supabase client z JWT w nagłówku dla RLS.

5. **Dodaj serwis domenowy dla user settings**
   - Utwórz `src/lib/services/user-settings.service.ts`.
   - Funkcja: `getUserSettings({ supabase, userId })`:
     - `select('id,user_id,openrouter_api_key,created_at')`
     - `eq('user_id', userId)`
     - `maybeSingle()` / `single()` z obsługą błędów

6. **Zaimplementuj endpoint Astro**
   - Plik: `src/pages/api/user-settings.ts`
   - Wymagania frameworkowe:
     - `export const prerender = false`
     - `export async function GET(context)` (uppercase)
   - Flow w handlerze:
     - Guard: brak/format tokena → 401
     - `getAuthenticatedUser(...)` → 401 przy błędzie
     - `getUserSettings(...)` → 404 jeśli null
     - 200 + JSON
     - Catch-all → 500 + log

7. **Spójność odpowiedzi i statusów**
   - Zawsze zwracaj JSON dla błędów (`ApiErrorResponseDTO`).
   - Dla sukcesu zwracaj dokładnie pola ze specyfikacji (bez dodatkowych pól).

8. **Checkpoints jakości (przed merge)**
   - Lokalnie: zweryfikuj, że użytkownik po rejestracji ma rekord `user_settings` (trigger `handle_new_user`).
   - Sprawdź scenariusze:
     - brak tokena → 401
     - nieprawidłowy token → 401
     - poprawny token → 200 i poprawna struktura
     - zasymulowany brak rekordu `user_settings` → 404
   - Uruchom `npm run lint`.
