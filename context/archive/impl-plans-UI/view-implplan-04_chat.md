# Plan implementacji widoku Czat (`/conversations/new`, `/conversations/:id`)

## 1. Przegląd

Rdzeń produktu: pełna historia konwersacji i wysyłka wiadomości do świadomie wybranego uczestnika, który dostaje cały
kontekst (US-015, US-016, US-019…US-030). Jedna wyspa `ChatView` obsługuje szkic (`conversationId = null`) i istniejącą
konwersację; po pierwszej udanej wymianie szkic staje się konwersacją bez przeładowania (`history.replaceState`).

## 2. Routing widoku

- `src/pages/conversations/new.astro` — za sesją i bramką onboardingu; `ChatView conversationId={null}`.
- `src/pages/conversations/[id].astro` — j.w.; `id` niebędące UUID → `404` (odpowiedź bez treści; nie ujawniamy nic
  więcej); poprawny format → `ChatView conversationId={id}` (istnienie i własność sprawdza API: `404` → karta „not found").
  Obie strony: `Layout` bez paddingu głównego kontenera dla czatu? Nie — zostaje standardowy `main`; czat sam zajmuje
  wysokość `calc(100vh - nagłówek - odstępy)` kolumną flex: nagłówek czatu, lista wiadomości (`flex-1 overflow-y-auto`),
  kompozytor u dołu.

## 3. Struktura komponentów

```
new.astro / [id].astro
└── Layout (user)
    └── ChatView conversationId (client:load)     src/components/chat/ChatView.tsx
        ├── ChatHeader („← List”, tytuł | „New conversation”)   src/components/chat/ChatHeader.tsx
        ├── MessageList (ref przewijania)                       src/components/chat/MessageList.tsx
        │   ├── DateSeparator                                   src/components/chat/DateSeparator.tsx
        │   ├── MessageItem ×n                                  src/components/chat/MessageItem.tsx
        │   ├── PendingReply (gdy trwa wysyłka)                 src/components/chat/PendingReply.tsx
        │   └── EmptyState (szkic bez wiadomości)
        ├── Composer                                            src/components/chat/Composer.tsx
        │   ├── Textarea + licznik + podpowiedź klawiszy
        │   ├── ParticipantPicker (Select + Tooltip)            src/components/chat/ParticipantPicker.tsx
        │   └── Button „Send”
        └── ErrorDialog („Message not sent”)
```

## 4. Szczegóły komponentów

### ChatView

- Opis: spina hook `useConversation`, stany ładowania (`Skeleton`), `not-found` (karta z linkiem do listy), błąd
  ładowania (komunikat + „Try again"), oraz dialog błędu wysyłki.
- Propsy: `conversationId: string | null`.

### ChatHeader

- Elementy: link „← List" (`href="/"`, `data-testid="back-to-list"`), `h1` z tytułem konwersacji lub „New conversation".

### MessageList

- Opis: kontener przewijany; grupuje wiadomości po dniu (`isSameDay`), wstawia `DateSeparator` (`formatDay`), renderuje
  `MessageItem`, na końcu `PendingReply`; `useAutoScroll` przewija na dół przy wejściu i po nowych wiadomościach tylko,
  gdy użytkownik był na dole (próg 32 px; US-024).
- Propsy: `messages: ConversationMessageDTO[]`, `pending: PendingReply | null`, `emptyState?: ReactNode`.

### MessageItem

- Opis: jedna wiadomość w układzie stack (US-023). `user`: jaśniejsze tło (`bg-muted/40`), prefiks „User"; `assistant`:
  tło bazowe, `border-left` 3 px w kolorze uczestnika, prefiks „AI - [alias]" w kolorze; uczestnik usunięty
  (`ai_participant === null`): prefiks „(Deleted Participant)" i border w `#808080` (US-027). Czas `formatTime`.
  Treść jako tekst z `whitespace-pre-wrap break-words`.
- Propsy: `message: ConversationMessageDTO`. `data-testid="message-item"`, `data-role`.

### PendingReply

- Opis: wiersz w miejscu przyszłej odpowiedzi: spinner + „AI - [alias] is thinking…", `role="status"`,
  `aria-live="polite"`, border w kolorze uczestnika. `data-testid="pending-reply"`.
- Propsy: `participant: AiParticipantDTO`.

### Composer

- Opis: formularz wysyłki. `Textarea` (`maxLength=10000`, 3 wiersze, `max-h-48 overflow-y-auto`), licznik
  „N/10000" widoczny od 9000 (US-022), `ParticipantPicker`, przycisk „Send", podpowiedź „Enter to send, Shift+Enter for
  a new line" (`aria-describedby`).
- Interakcje: `canSend = text.trim().length > 0 && participantId !== null && !busy && participants.length >= 2`;
  klik Send lub Enter (bez Shift, bez `isComposing`) → `onSend(text, participantId)`; Shift+Enter → nowa linia.
  Podczas `busy` pole i picker `disabled`, tekst zostaje. Po sukcesie: tekst pusty, picker zresetowany (US-026: bez
  pamięci wyboru). Po błędzie: tekst i wybór zostają.
- Propsy: `participants: AiParticipantDTO[]`, `busy: boolean`, `onSend: (content, participantId) => Promise<boolean>`
  (`true` = sukces → wyczyść).

### ParticipantPicker

- Opis: shadcn `Select` z uczestnikami posortowanymi po aliasie (kolejność z API), placeholder „Choose a participant",
  kropka koloru przy pozycji. Gdy `participants.length < 2`: `disabled` + `Tooltip` „Add at least 2 AI participants in
  Settings" (US-012; wyzwalacz owinięty w `span`, bo `disabled` nie emituje zdarzeń).
- Propsy: `participants`, `value: string | null`, `onChange`, `disabled`. `data-testid="participant-select"`.

## 5. Typy

Z `types.ts`: `ConversationDetailsDTO`, `ConversationMessageDTO`, `AiParticipantDTO`, `CreateConversationCommand`,
`CreateConversationResponseDTO`, `CreateMessageCommand`, `CreateMessageResponseDTO`. Lokalny typ widoku:
`PendingReply { participant: AiParticipantDTO }` (nie ViewModel wiadomości — DTO wystarcza; etykietę i kolor liczy
`MessageItem` z `ai_participant`).

## 6. Zarządzanie stanem

`useConversation(conversationId)` (`src/components/hooks/useConversation.ts`):

- `status: "loading" | "ready" | "not-found" | "error"`, `conversation: ConversationDetailsDTO | null`,
  `participants: AiParticipantDTO[]`, `pending: PendingReply | null`, `loadError`.
- Ładowanie równoległe: `GET /api/ai-participants` zawsze; `GET /api/conversations/:id` gdy `conversationId`.
- `send(content, participantId)`: ustawia `pending`; szkic → `POST /api/conversations` (bez `title` → auto) →
  `conversation = odpowiedź`, `history.replaceState(null, "", "/conversations/<id>")`; istniejąca →
  `POST /api/conversations/:id/messages` → dopisanie `user_message` i `ai_message`, `updated_at` z `ai_message.created_at`.
  Zwraca `ApiFailure | null`; `pending` czyszczony w obu przypadkach.
  `useAutoScroll(ref, dependency)` (`src/components/hooks/useAutoScroll.ts`): śledzi `atBottom` na `scroll`, przewija po
  zmianie zależności, gdy `atBottom`; pierwsze wypełnienie zawsze na dół.

## 7. Integracja API

| Akcja            | Wywołanie                              | Żądanie                                                           | Odpowiedź                                    |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| uczestnicy       | `GET /api/ai-participants`             | —                                                                 | `AiParticipantDTO[]`                         |
| konwersacja      | `GET /api/conversations/:id`           | —                                                                 | `ConversationDetailsDTO` (`404` → not-found) |
| pierwsza wymiana | `POST /api/conversations`              | `CreateConversationCommand` (`user_message`, `ai_participant_id`) | `CreateConversationResponseDTO` (201)        |
| kolejna wymiana  | `POST /api/conversations/:id/messages` | `CreateMessageCommand`                                            | `CreateMessageResponseDTO` (201)             |

## 8. Interakcje użytkownika

1. Wejście na szkic: pusty obszar z `EmptyState` „Send a message to one of your AI participants to start", kompozytor.
2. Wpisanie tekstu, wybór uczestnika, Enter → picker i pole zablokowane, `PendingReply` z aliasem; po odpowiedzi dwie
   nowe wiadomości, pole puste, picker pusty, przewinięcie na dół (jeśli byliśmy na dole).
3. Druga wiadomość do innego uczestnika → odpowiedź uwzględnia poprzednią (pełny kontekst, US-025).
4. Błąd (OpenRouter/sieć/…): dialog „Message not sent" z komunikatem 1:1; tekst i wybór zostają.
5. „← List" → `/`.
6. Wejście na `/conversations/:id` z historią: przewinięcie na dół, separatory dni, prefiksy i kolory.

## 9. Warunki i walidacja

Tekst niepusty po `trim`, ≤ 10 000 (atrybut + licznik), uczestnik wybrany, ≥ 2 uczestników (picker `disabled` +
tooltip). API waliduje ponownie (`400 Validation error`).

## 10. Obsługa błędów

Wg ap7 §6: `401` → `/login`; `412` → `/settings?notice=api-key`; `404` konwersacji przy wejściu → karta not-found;
`404` uczestnika/konwersacji przy wysyłce, `400` (string), `500 OpenRouter API error`, `502`, `504`, sieć → `ErrorDialog`
z `failure.message`; odpowiedź poza kontraktem → komunikat generyczny.

## 11. Kroki implementacji

1. `useAutoScroll`, `useConversation`.
2. `MessageItem`, `DateSeparator`, `PendingReply`, `MessageList`.
3. `ParticipantPicker`, `Composer` (klawisze, licznik, blokady).
4. `ChatHeader`, `ChatView`, strony `new.astro` i `[id].astro` z bramką i walidacją UUID.
5. `data-testid`, lint, tsc, build; Chrome: szkic → wiadomość do A → do B z odwołaniem → „← List" → otwarcie → historia,
   separator dnia (konwersacja starsza), „(Deleted Participant)" po usunięciu uczestnika w ustawieniach; błąd OpenRoutera
   przez zły klucz w bazie (dialog, tekst zachowany).
