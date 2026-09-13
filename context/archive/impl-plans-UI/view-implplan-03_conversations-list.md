# Plan implementacji widoku Lista konwersacji (`/`)

## 1. Przegląd

Główny widok po zalogowaniu: konwersacje posortowane od ostatnio aktualizowanej, z tytułem edytowalnym inline, czasem
względnym, licznikiem wiadomości, usuwaniem z potwierdzeniem i wejściem do czatu; przycisk „+ New conversation".
Historyjki: US-014, US-015 (wejście), US-016, US-017, US-018, US-019 (powrót z czatu odświeża listę).

## 2. Routing widoku

`src/pages/index.astro` — za sesją i bramką onboardingu (już jest). Zastępuje placeholder z etapu auth.

## 3. Struktura komponentów

```
index.astro
└── Layout (user)
    └── ConversationListView (client:load)      src/components/conversations/ConversationListView.tsx
        ├── nagłówek: h1 „Conversations” + Button asChild <a href="/conversations/new">+ New conversation</a>
        ├── Skeleton ×3 | błąd inline | EmptyState (z tym samym przyciskiem)
        └── ul → ConversationListItem            src/components/conversations/ConversationListItem.tsx
            ├── InlineTitleEditor                src/components/conversations/InlineTitleEditor.tsx
            ├── czas względny, Badge message_count
            ├── Button asChild <a href="/conversations/:id">Open</a>
            └── ikona kosza → ConfirmDialog „Delete conversation '[title]'?”
```

## 4. Szczegóły komponentów

### ConversationListView

- Opis: pobiera listę, renderuje stany, deleguje mutacje do hooka.
- Elementy: nagłówek z przyciskiem (`data-testid="new-conversation-button"`), `ul` (`data-testid="conversation-list"`),
  `EmptyState` „No conversations yet" + „Start one by sending a message to your AI participants." + przycisk.
- Typy: `ConversationListItemDTO[]`.

### ConversationListItem

- Opis: wiersz listy.
- Elementy: `li` (`data-testid="conversation-item"`), lewa kolumna: `InlineTitleEditor` + `p` z `formatRelative(updated_at)`
  (`<time dateTime>`), prawa: `Badge` `message_count` (`aria-label` „N messages"), `Button variant="outline" size="sm" asChild`
  → link „Open" (`data-testid="open-conversation"`), `Button variant="ghost" size="icon-sm"` kosz (`aria-label` „Delete
  conversation [title]", `data-testid="delete-conversation"`), `ConfirmDialog` z tytułem dokładnie „Delete conversation
  '[title]'?" (PRD §3.5), akcja „Delete", błąd inline w dialogu.
- Interakcje: usunięcie → `onDelete(id)`; zmiana tytułu → `onRename(id, title)`.
- Propsy: `conversation: ConversationListItemDTO`, `onRename`, `onDelete` (oba zwracają `ApiFailure | null`).

### InlineTitleEditor

- Opis: tytuł jako przycisk; klik → `Input`; Enter zapisuje, Escape i blur anulują (blur = anuluj, żeby nie zapisywać
  przypadkiem; PRD wymienia tylko Enter/Escape).
- Elementy: `button` z tytułem (`data-testid="conversation-title"`, `title` „Click to rename"), `Input` (`autoFocus`,
  `maxLength={100}`, `aria-label` „Conversation title", `data-testid="title-input"`), błąd `role="alert"`.
- Walidacja: `trim().length > 0` („Title cannot be empty"), `≤ 100` (atrybut + komunikat z API). Niezmieniony tytuł →
  wyjście bez wywołania API.
- Stan: `editing`, `draft`, `saving`, `error`.
- Propsy: `title: string`, `onSave: (title: string) => Promise<ApiFailure | null>`.

## 5. Typy

`ConversationListItemDTO`, `UpdateConversationCommand`, `UpdateConversationResponseDTO`, `ApiSuccessResponseDTO`,
`ApiFailure`. Bez ViewModelu: `message_count` i `updated_at` są w DTO; czas względny liczony przy renderze.

## 6. Zarządzanie stanem

`useConversations()` (`src/components/hooks/useConversations.ts`): `status`, `conversations`, `loadError`,
`rename(id, title)` (PUT → podmiana tytułu w liście; `updated_at` bez zmian, więc kolejność zostaje),
`remove(id)` (DELETE → filtr). Edycja inline lokalnie w `InlineTitleEditor`.

## 7. Integracja API

| Akcja         | Wywołanie                       | Żądanie                     | Odpowiedź                                                   |
| ------------- | ------------------------------- | --------------------------- | ----------------------------------------------------------- |
| lista         | `GET /api/conversations`        | —                           | `ConversationListItemDTO[]` (posortowane `updated_at` desc) |
| zmiana tytułu | `PUT /api/conversations/:id`    | `UpdateConversationCommand` | `UpdateConversationResponseDTO`                             |
| usunięcie     | `DELETE /api/conversations/:id` | —                           | `ApiSuccessResponseDTO`                                     |

## 8. Interakcje użytkownika

1. Wejście: skeletony → lista albo empty state.
2. „+ New conversation" → `/conversations/new` (pełna nawigacja).
3. Klik w tytuł → pole; Enter → zapis i wyjście; Escape/blur → anuluj; pusty → błąd, pole zostaje.
4. Kosz → dialog → „Delete" → wiersz znika; błąd → komunikat w dialogu, dialog zostaje.
5. „Open" → `/conversations/:id`.

## 9. Warunki i walidacja

Tytuł: niepusty po `trim`, ≤ 100 znaków (API: `400 Validation error` z mapą `{ title }` → komunikat pod polem).

## 10. Obsługa błędów

Wg ap7 §6: `401` → `/login` (klient); `404` przy PUT/DELETE (konwersacja usunięta gdzie indziej) → komunikat
„Conversation no longer exists" i usunięcie wiersza z listy; `500`/sieć → inline (edytor) lub w dialogu (usuwanie);
błąd listy → komunikat z przyciskiem „Try again".

## 11. Kroki implementacji

1. `useConversations`.
2. `InlineTitleEditor`, `ConversationListItem` (z `ConfirmDialog`).
3. `ConversationListView` + `index.astro` (tytuł strony „Conversations - MindAgora").
4. `data-testid`, lint, tsc; weryfikacja w Chrome na koncie z konwersacjami ze smoke'a (smoke-a) lub po widoku 04.
