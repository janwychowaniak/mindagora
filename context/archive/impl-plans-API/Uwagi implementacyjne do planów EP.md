## Uwaga implementacyjna 1: Istniejący już wspólny fundament dla endpointów API (autoryzacja + Supabase)

- **Autoryzacja jest scentralizowana w middleware** (`src/middleware/index.ts`):
  - używa whitelisty publicznych ścieżek,
  - automatycznie przepuszcza assety (`/_astro/*`, `/assets/*`, `/favicon.ico`),
  - waliduje `Authorization: Bearer <token>` i zwraca spójne `401` w formacie `ApiErrorResponseDTO`.
- **Authed Supabase client i user są w `context.locals`**:
  - `locals.supabase` — klient z JWT użytkownika (RLS działa „z automatu”),
  - `locals.user` — pełny obiekt użytkownika z Supabase.
- **Serwis auth jest reużywalny** (`src/lib/services/auth.service.ts`):
  - do ekstrakcji tokena i weryfikacji tokena,
  - do tworzenia per‑request authed Supabase clienta.
- **Typy klienta są ujednolicone**:
  - korzystaj z typu `SupabaseClient` i `SupabaseUser` z `src/db/supabase.client.ts`,
  - `env.d.ts` ma już poprawny typ `locals`.

### Zalecany wzorzec nowego endpointu

1. **Nie waliduj tokena w handlerze** — to robi middleware.
2. **W handlerze używaj tylko `context.locals.supabase` i `context.locals.user`.**
3. **Logikę domenową przenieś do serwisów** w `src/lib/services/*`.
4. **Błędy zwracaj jako `ApiErrorResponseDTO`** (spójny format).

**Dodatkowy fundament (OpenRouter) dla tych endpointów, które będą go potrzebowały:**

- Istnieje stateless serwis `src/lib/services/openrouter.service.ts` z publicznymi metodami:
  - `validateApiKey(apiKey: string): Promise<boolean>`
  - `getModels(apiKey: string): Promise<OpenRouterModelListDTO>`
  - `sendChatCompletion(apiKey: string, request: OpenRouterChatRequest): Promise<string>`
- Serwis rzuca typed errors (`OpenRouter*Error`), które endpointy powinny mapować na `ApiErrorResponseDTO`.
  - W komunikatach błędów z OpenRouter `error.message` jest pass-through 1:1.

## Uwaga implementacyjna 2: Walidacja Zod - kiedy używać, a kiedy nie

**NIE używaj Zod dla:**

- ✗ **Danych z bazy (GET endpoints)** — trust database schema + TypeScript types z `database.types.ts`
  - PostgreSQL już waliduje, Supabase generuje type-safe types
  - Używaj type assertion: `data as UserSettingsDTO`

**TAK używaj Zod dla:**

- ✓ **User input (POST/PUT request body)** — ZAWSZE waliduj dane od użytkownika, user input NIGDY nie jest trusted
- ✓ **External API responses** (OpenRouter) — zewnętrzne API może zmienić format
  - Waliduj strukturę response przed użyciem
  - Graceful error handling gdy API zwraca unexpected format
- ✓ **Query params/path params** — jeśli występują i wymagają biznesowej walidacji poza type checking
  - Np. UUID format, enum values, numeric ranges
