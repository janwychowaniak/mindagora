# DB Plan - MindAgora

## 1. Przegląd architektury

Baza danych projektu MindAgora opiera się na PostgreSQL w wersji dostarczonej przez Supabase. Schemat wspiera wielomodelowe konwersacje AI z pełną persystencją historii, izolacją danych między użytkownikami oraz bezpiecznym przechowywaniem kluczy API.

**Kluczowe założenia projektowe:**

- Wykorzystanie `auth.users` z Supabase Auth (brak własnej tabeli users)
- Hard delete dla uczestników AI z zachowaniem historii wiadomości
- Row-Level Security (RLS) dla pełnej izolacji danych użytkowników
- Minimalistyczne indeksy oparte o faktyczne query patterns
- Business logic w aplikacji, nie w constraintach bazy
- YAGNI principle - brak over-engineeringu w MVP

## 2. Tabele

### 2.1. auth.users (Zarządzana przez Supabase Auth)

**Uwaga:** Tabela `auth.users` jest częścią schematu `auth` Supabase i jest automatycznie zarządzana przez Supabase Auth. Nie tworzymy własnej tabeli `public.users`. Wszystkie odniesienia do użytkowników używają foreign keys wskazujących na `auth.users(id)`.

**Wykorzystywane pola:**

- `id` (UUID) - identyfikator użytkownika
- `email` (TEXT) - adres email
- `created_at` (TIMESTAMPTZ) - data utworzenia konta

### 2.2. user_settings

Przechowuje ustawienia użytkownika, w tym klucz OpenRouter API. Relacja 1:1 z `auth.users`. Rekord tworzony automatycznie przez trigger przy rejestracji użytkownika.

| Kolumna            | Typ         | Ograniczenia                                                  | Opis                                                   |
| ------------------ | ----------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| id                 | UUID        | PRIMARY KEY, DEFAULT gen_random_uuid()                        | Unikalny identyfikator rekordu                         |
| user_id            | UUID        | NOT NULL, UNIQUE, REFERENCES auth.users(id) ON DELETE CASCADE | Powiązanie z użytkownikiem                             |
| openrouter_api_key | TEXT        | NULL                                                          | Klucz OpenRouter API (plaintext w MVP, RLS protection) |
| created_at         | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                                       | Data utworzenia ustawień                               |

**Uwagi:**

- Klucz API nie jest szyfrowany w MVP (zabezpieczony przez RLS policies)
- Brak kolumny `updated_at` - nie potrzebna w MVP
- Szyfrowanie pgcrypto zarezerwowane na V2

### 2.3. ai_participants

Przechowuje definicje uczestników AI (alias, model, kolor) należących do użytkownika. Relacja 1:many z `auth.users`.

| Kolumna    | Typ          | Ograniczenia                                          | Opis                              |
| ---------- | ------------ | ----------------------------------------------------- | --------------------------------- |
| id         | UUID         | PRIMARY KEY, DEFAULT gen_random_uuid()                | Unikalny identyfikator uczestnika |
| user_id    | UUID         | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Właściciel uczestnika             |
| alias      | VARCHAR(30)  | NOT NULL                                              | Nazwa uczestnika (max 30 znaków)  |
| model_id   | VARCHAR(150) | NOT NULL                                              | Identyfikator modelu z OpenRouter |
| color      | VARCHAR(7)   | NOT NULL                                              | Kolor w formacie hex (#RRGGBB)    |
| created_at | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                               | Data utworzenia uczestnika        |

**Constraints:**

- `UNIQUE(user_id, alias)` - alias musi być unikalny per użytkownik
- Brak CHECK constraints - walidacja w aplikacji
- Brak kolumny `updated_at` - brak edit w MVP

**Strategia usuwania:**

- Hard delete (fizyczne usunięcie z bazy)
- `messages.ai_participant_id` ustawia się na NULL przez `ON DELETE SET NULL`
- Alias ponownie dostępny po usunięciu

### 2.4. conversations

Przechowuje konwersacje użytkownika. Relacja 1:many z `auth.users`.

| Kolumna    | Typ          | Ograniczenia                                          | Opis                                               |
| ---------- | ------------ | ----------------------------------------------------- | -------------------------------------------------- |
| id         | UUID         | PRIMARY KEY, DEFAULT gen_random_uuid()                | Unikalny identyfikator konwersacji                 |
| user_id    | UUID         | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Właściciel konwersacji                             |
| title      | VARCHAR(100) | NOT NULL                                              | Tytuł konwersacji (auto-generated lub user-edited) |
| created_at | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                               | Data rozpoczęcia konwersacji                       |
| updated_at | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                               | Data ostatniej wiadomości                          |

**Uwagi:**

- Tytuł generowany w aplikacji: pierwsze 50 znaków user message, z "..." tylko gdy wiadomość była dłuższa (max 53 znaki, mieści się w VARCHAR(100))
- `updated_at` aktualizowany automatycznie przez trigger przy INSERT message; edycja tytułu (PUT) świadomie go nie zmienia — `updated_at` = data ostatniej wiadomości
- Brak DEFAULT dla `title` - wartość zawsze ustawiana przez aplikację
- Konwersacja tworzona dopiero po pierwszej pomyślnej wymianie (user + AI response)

### 2.5. messages

Przechowuje wiadomości w konwersacjach. Relacje many:1 z `conversations` i `ai_participants`.

| Kolumna           | Typ          | Ograniczenia                                             | Opis                                          |
| ----------------- | ------------ | -------------------------------------------------------- | --------------------------------------------- |
| id                | UUID         | PRIMARY KEY, DEFAULT gen_random_uuid()                   | Unikalny identyfikator wiadomości             |
| conversation_id   | UUID         | NOT NULL, REFERENCES conversations(id) ON DELETE CASCADE | Przynależność do konwersacji                  |
| role              | message_role | NOT NULL                                                 | Rola: 'user' lub 'assistant'                  |
| content           | TEXT         | NOT NULL                                                 | Treść wiadomości (max 10k znaków w aplikacji) |
| ai_participant_id | UUID         | NULL, REFERENCES ai_participants(id) ON DELETE SET NULL  | Uczestnik AI (tylko dla role='assistant')     |
| created_at        | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                                  | Timestamp wiadomości                          |

**Logika `ai_participant_id`:**

- `role='user'` → `ai_participant_id IS NULL` (zawsze)
- `role='assistant'` + aktywny uczestnik → `ai_participant_id IS NOT NULL`
- `role='assistant'` + usunięty uczestnik → `ai_participant_id IS NULL` (przez ON DELETE SET NULL)

**Uwagi:**

- Brak kolumny `updated_at` - wiadomości są immutable
- Walidacja max 10,000 znaków w aplikacji, nie w bazie

### 2.6. message_role (ENUM Type)

Typ wyliczeniowy definiujący rolę wiadomości.

```sql
CREATE TYPE message_role AS ENUM ('user', 'assistant');
```

**Zalety:**

- Type-safe na poziomie bazy
- Automatyczna walidacja wartości
- Oszczędność pamięci (2 bytes vs TEXT)

## 3. Relacje między tabelami

```
auth.users (1) ────┬──── (1) user_settings
                   │
                   ├──── (many) ai_participants
                   │
                   └──── (many) conversations
                                    │
                                    └──── (many) messages
                                                    │
ai_participants (1) ─────────────────────────────┘ (many)
```

**Kardynalność:**

- `auth.users` → `user_settings`: **1:1** (auto-create przez trigger)
- `auth.users` → `ai_participants`: **1:many** (użytkownik może mieć wielu uczestników)
- `auth.users` → `conversations`: **1:many** (użytkownik może mieć wiele konwersacji)
- `conversations` → `messages`: **1:many** (konwersacja zawiera wiele wiadomości)
- `ai_participants` → `messages`: **1:many** (uczestnik może mieć wiele wiadomości)

**Foreign Key Strategies:**

| Relacja                      | ON DELETE | Uzasadnienie                                |
| ---------------------------- | --------- | ------------------------------------------- |
| user_settings → auth.users   | CASCADE   | Usuń ustawienia razem z użytkownikiem       |
| ai_participants → auth.users | CASCADE   | Usuń uczestników razem z użytkownikiem      |
| conversations → auth.users   | CASCADE   | Usuń konwersacje razem z użytkownikiem      |
| messages → conversations     | CASCADE   | Usuń wiadomości razem z konwersacją         |
| messages → ai_participants   | SET NULL  | Zachowaj wiadomości po usunięciu uczestnika |

## 4. Indeksy

Minimalistyczne podejście - indeksy tylko dla faktycznych query patterns zgodnie z YAGNI principle.
Poniżej wymienione są tylko explicit indexes, które należy utworzyć osobno w migracji.

### 4.1. Indeksy dla user_settings

Brak explicit indexes.
Implicit index z UNIQUE constraint na `user_id` (automatycznie tworzony przez PostgreSQL).

### 4.2. Indeksy dla ai_participants

Brak explicit indexes.
Implicit unique index z composite UNIQUE constraint na `(user_id, alias)` (automatycznie tworzony).

**Brak indeksu na:**

- `model_id` - nie filtrujemy po modelu
- `color` - tylko display property

### 4.3. Indeksy dla conversations

```sql
-- Index dla query: lista konwersacji użytkownika
CREATE INDEX idx_conversations_user_id ON conversations(user_id);

-- Composite index dla query: lista konwersacji sorted by last updated DESC
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
```

### 4.4. Indeksy dla messages

```sql
-- Index dla query: wszystkie wiadomości konwersacji
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- Composite index dla query: wiadomości konwersacji w kolejności chronologicznej
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at ASC);

-- Partial index pod ON DELETE SET NULL przy usuwaniu uczestnika (bez niego DELETE uczestnika
-- skanuje całą tabelę messages). Dodany przy implementacji DELETE /api/ai-participants/:id.
CREATE INDEX IF NOT EXISTS idx_messages_ai_participant_id
ON messages(ai_participant_id) WHERE ai_participant_id IS NOT NULL;
```

**Uwaga:** PostgreSQL NIE tworzy automatycznie indeksów na kolumnach FOREIGN KEY (tylko na PRIMARY KEY i UNIQUE).
Dlatego indeksy na `conversations.user_id`, `messages.conversation_id` i `messages.ai_participant_id` są jawne;
`ai_participants.user_id` pokrywa wiodąca kolumna indeksu z `UNIQUE(user_id, alias)`, a `user_settings.user_id` — jego UNIQUE.

## 5. Row-Level Security (RLS) Policies

Wszystkie tabele w schemacie `public` mają włączony RLS dla pełnej izolacji danych między użytkownikami.

### 5.1. user_settings

```sql
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: użytkownik widzi tylko swoje ustawienia
CREATE POLICY "Users can view own settings"
ON user_settings FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: użytkownik może utworzyć tylko swoje ustawienia
CREATE POLICY "Users can insert own settings"
ON user_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: użytkownik może aktualizować tylko swoje ustawienia
CREATE POLICY "Users can update own settings"
ON user_settings FOR UPDATE
USING (auth.uid() = user_id);

-- DELETE: DENY (brak potrzeby usuwania ustawień w MVP)
-- (Brak policy = brak dostępu)
```

### 5.2. ai_participants

```sql
ALTER TABLE ai_participants ENABLE ROW LEVEL SECURITY;

-- SELECT: użytkownik widzi tylko swoich uczestników
CREATE POLICY "Users can view own participants"
ON ai_participants FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: użytkownik może tworzyć tylko swoich uczestników
CREATE POLICY "Users can insert own participants"
ON ai_participants FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: użytkownik może aktualizować tylko swoich uczestników
CREATE POLICY "Users can update own participants"
ON ai_participants FOR UPDATE
USING (auth.uid() = user_id);

-- DELETE: użytkownik może usuwać tylko swoich uczestników
CREATE POLICY "Users can delete own participants"
ON ai_participants FOR DELETE
USING (auth.uid() = user_id);
```

### 5.3. conversations

```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- SELECT: użytkownik widzi tylko swoje konwersacje
CREATE POLICY "Users can view own conversations"
ON conversations FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: użytkownik może tworzyć tylko swoje konwersacje
CREATE POLICY "Users can insert own conversations"
ON conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: użytkownik może aktualizować tylko swoje konwersacje
CREATE POLICY "Users can update own conversations"
ON conversations FOR UPDATE
USING (auth.uid() = user_id);

-- DELETE: użytkownik może usuwać tylko swoje konwersacje
CREATE POLICY "Users can delete own conversations"
ON conversations FOR DELETE
USING (auth.uid() = user_id);
```

### 5.4. messages

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- SELECT: użytkownik widzi wiadomości ze swoich konwersacji
CREATE POLICY "Users can view messages from own conversations"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);

-- INSERT: użytkownik może dodawać wiadomości do swoich konwersacji
CREATE POLICY "Users can insert messages to own conversations"
ON messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);

-- UPDATE: DENY (wiadomości są immutable w MVP)
-- (Brak policy = brak dostępu)

-- DELETE: użytkownik może usuwać wiadomości ze swoich konwersacji
CREATE POLICY "Users can delete messages from own conversations"
ON messages FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);
```

## 6. Triggers i funkcje PostgreSQL

### 6.1. Auto-create user_settings przy rejestracji

**Cel:** Automatyczne tworzenie rekordu `user_settings` dla każdego nowo zarejestrowanego użytkownika.

```sql
-- Funkcja tworząca user_settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger na auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

**Uwagi:**

- `SECURITY DEFINER` - funkcja wykonuje się z uprawnieniami definiującego (pozwala na INSERT do `public.user_settings` mimo RLS)
- `SET search_path = public` - zabezpieczenie przed schema poisoning
- Trigger reaguje na każdy INSERT w `auth.users` (rejestracja użytkownika)

### 6.2. Auto-update conversations.updated_at przy nowej wiadomości

**Cel:** Automatyczna aktualizacja `conversations.updated_at` przy każdym INSERT do `messages`.

```sql
-- Funkcja aktualizująca timestamp konwersacji
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Trigger na messages
CREATE TRIGGER message_updates_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_timestamp();
```

**Uwagi:**

- Trigger reaguje tylko na INSERT (wiadomości są immutable)
- Aktualizuje `updated_at` każdej konwersacji gdy pojawia się nowa wiadomość
- Umożliwia sortowanie konwersacji "most recent first"

## 7. Strategia migracji

### 7.1. Konwencja nazewnictwa

Supabase używa konwencji `YYYYMMDDHHmmss_short_description.sql` dla plików migracji.

**Przykład:** `20250114120000_create_enums.sql`

### 7.2. Kolejność migracji (atomiczne pliki)

1. **20250114120000_enable_extensions.sql**
   - `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (zarezerwowane na V2)

2. **20250114120100_create_enums.sql**
   - `CREATE TYPE message_role AS ENUM ('user', 'assistant');`

3. **20250114120200_create_user_settings.sql**
   - Tabela `user_settings` z foreign key do `auth.users`

4. **20250114120300_create_ai_participants.sql**
   - Tabela `ai_participants` z UNIQUE constraint `(user_id, alias)`

5. **20250114120400_create_conversations.sql**
   - Tabela `conversations`

6. **20250114120500_create_messages.sql**
   - Tabela `messages` z foreign keys:
     - `conversation_id` → `conversations(id) ON DELETE CASCADE`
     - `ai_participant_id` → `ai_participants(id) ON DELETE SET NULL`

7. **20250114120600_create_indexes.sql**
   - Explicit indexes dla `conversations` (2 indexes)
   - Explicit indexes dla `messages` (3 indexes, w tym partial index na `ai_participant_id`)

8. **20250114120700_create_functions_and_triggers.sql**
   - Funkcja `handle_new_user()` + trigger `on_auth_user_created`
   - Funkcja `update_conversation_timestamp()` + trigger `message_updates_conversation`

9. **20250114120800_enable_rls.sql**
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
   - Wszystkie `CREATE POLICY` dla każdej tabeli

### 7.3. Uruchamianie migracji

```bash
# Lokalne środowisko
supabase migration up

# Wyświetlenie statusu migracji
supabase migration list
```

## 8. Workflow tworzenia konwersacji

**Zgodnie z PRD - konwersacja zapisuje się dopiero po pierwszej pomyślnej wymianie:**

1. User klika "+ New conversation"
2. Draft conversation w React state (NIE zapisany w bazie)
3. User wpisuje wiadomość + wybiera AI participant
4. API call do OpenRouter
5. **Jeśli sukces** → sekwencyjne zapisy z aplikacji (bez transakcji DB i bez RPC — patrz uwaga niżej):
   ```sql
   INSERT INTO conversations (user_id, title) VALUES (...) RETURNING id;
   INSERT INTO messages (conversation_id, role, content, ai_participant_id) VALUES (...); -- user message
   INSERT INTO messages (conversation_id, role, content, ai_participant_id) VALUES (...); -- AI response
   ```
   Przy błędzie dowolnego INSERT po utworzeniu konwersacji: kompensacja `DELETE FROM conversations WHERE id = ...`
   (CASCADE usuwa wiadomości). Nieudany cleanup jest logowany jako CRITICAL.
6. Auto-scroll, aktualizacja UI

**Rezultat:** Baza nie zawiera orphaned conversations bez wiadomości (gwarancja aplikacyjna, nie transakcyjna).

**Decyzja projektowa — NO RPC:** MVP nie używa funkcji RPC ani transakcji po stronie bazy dla zapisów wieloetapowych.
Zamiast tego: sekwencyjne `.insert()` przez Supabase client + jawny cleanup przy błędzie. Powód: prostota i czytelna
ścieżka błędu. Konsekwencja: atomowość jest aplikacyjna — przy padzie procesu między insertami cleanup może się nie
wykonać. Świadomy trade-off, akceptowalny w MVP single-user; przy skalowaniu wraca jako dług techniczny.

## 9. Handling usuniętych uczestników AI

### 9.1. Strategia delete

- **Hard delete** z bazy danych (fizyczne usunięcie rekordu)
- Foreign key `messages.ai_participant_id` z `ON DELETE SET NULL`
- Po usunięciu: wiadomości pozostają, ale `ai_participant_id IS NULL`

### 9.2. Wyświetlanie w UI

**Logika aplikacji:**

```typescript
if (message.role === "assistant" && message.ai_participant_id === null) {
  // Usunięty uczestnik
  displayName = "(Deleted Participant)";
  color = "#808080"; // gray
}
```

**Brak przechowywania:**

- Nie zapisujemy aliasu usuniętego uczestnika
- Nie zapisujemy koloru usuniętego uczestnika
- Wszystkie usunięte wyglądają tak samo: "(Deleted Participant)" w szarym

**Zaleta:** Prostszy schemat bazy, alias ponownie dostępny po delete.

## 10. Walidacja i constraints

### 10.1. Constraints w bazie danych

**Zaimplementowane w schemacie:**

- PRIMARY KEY na wszystkich tabelach
- FOREIGN KEY z odpowiednimi ON DELETE
- UNIQUE constraints: `user_settings(user_id)`, `ai_participants(user_id, alias)`
- NOT NULL na kluczowych kolumnach

**NIE zaimplementowane (świadoma decyzja):**

- CHECK constraints na długość stringów
- CHECK constraints na format (hex color, email)
- CHECK constraints na biznes logic (min 2 participants)

### 10.2. Walidacja w aplikacji

**Przerzucona na warstwę aplikacyjną:**

- Długość aliasu (max 30 znaków)
- Długość tytułu konwersacji (max 100 znaków)
- Długość wiadomości (max 10,000 znaków)
- Format hex color (#RRGGBB)
- Alfanumeryczne + spacje + znaki specjalne (-, _, .) dla aliasu
- Walidacja model_id przez dropdown z OpenRouter API
- Minimum 2 uczestników do rozpoczęcia konwersacji

**Uzasadnienie:** Elastyczność, łatwiejsze zmiany reguł, lepsze komunikaty błędów dla użytkownika.

## 11. Kwestie bezpieczeństwa

### 11.1. Przechowywanie klucza OpenRouter API

**MVP Solution:**

- Typ: `TEXT` (plaintext)
- Ochrona: Strong RLS policies (`auth.uid() = user_id`)
- Brak szyfrowania pgcrypto

**V2 Consideration:**

- Szyfrowanie: `pgp_sym_encrypt(key, passphrase)`
- Typ: `BYTEA`
- Deszyfrowanie: `pgp_sym_decrypt(encrypted_key, passphrase)`

### 11.2. RLS jako główna linia obrony

**Każda tabela chroniona przez:**

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- Policies oparte o `auth.uid()` lub `EXISTS` subquery
- Brak dostępu do danych innych użytkowników na poziomie bazy

### 11.3. Triggers SECURITY DEFINER

**Trigger `handle_new_user()`:**

- `SECURITY DEFINER` - wykonuje się z uprawnieniami definiującego
- `SET search_path = public` - zabezpieczenie przed schema poisoning
- Pozwala na INSERT do `user_settings` mimo RLS

## 12. Performance i skalowalność

### 12.1. MVP Assumptions

- Single-user testing (lokalny dev)
- Brak limitów na ilość konwersacji/wiadomości per user
- Load ALL messages at once (bez pagination)
- Brak partycjonowania tabel
- Brak monitoring query performance

### 12.2. Indeksy dla wydajności

**Zaimplementowane:**

- Composite index `conversations(user_id, updated_at DESC)` dla "most recent first" sorting
- Composite index `messages(conversation_id, created_at ASC)` dla chronologicznego ładowania
- Indeksy na kolumnach FK jawne — PostgreSQL nie tworzy ich automatycznie (patrz uwaga w §4.4)

### 12.3. PostgreSQL Optimizations

- **UUID jako PRIMARY KEY**: Bezpieczniejsze niż sequential integers, lepsze dla distributed systems
- **TIMESTAMPTZ**: Zawsze z timezone dla globalnej aplikacji
- **ENUM type**: 2 bytes vs TEXT, type-safe, automatyczna walidacja
- **TEXT dla content**: Unlimited length (w praktyce do 1GB w PostgreSQL)

### 12.4. Future Scalability (post-MVP)

**Jeśli wystąpią problemy wydajnościowe:**

1. Pagination dla conversations (LIMIT/OFFSET lub cursor-based)
2. Pagination dla messages (ładowanie po N ostatnich)
3. Partycjonowanie `messages` jeśli > 100k per user
4. Monitoring query performance przez `pg_stat_statements`
5. Materialized views dla analytics (jeśli potrzebne)

## 13. Podsumowanie kluczowych decyzji

1. **Supabase Auth Integration**: Wykorzystanie `auth.users` zamiast własnej tabeli users
2. **Hard Delete Strategy**: Fizyczne usunięcie uczestników z SET NULL dla messages
3. **Security-First**: Strong RLS policies na wszystkich tabelach public
4. **YAGNI Principle**: Brak partycjonowania, soft delete, zbędnych indexów, unnecessary updated_at
5. **Business Logic w Aplikacji**: CHECK constraints i walidacja w kodzie, nie w bazie
6. **PostgreSQL Native Features**: ENUM types, triggers, TIMESTAMPTZ, UUID
7. **Minimalistyczne Indeksy**: Tylko dla faktycznych query patterns
8. **Auto-Automation**: Triggers dla user_settings creation i conversations.updated_at
9. **No Orphaned Data**: Konwersacje tworzone dopiero po pierwszej pomyślnej wymianie
10. **Plaintext API Key**: RLS protection w MVP, szyfrowanie pgcrypto odłożone na V2
