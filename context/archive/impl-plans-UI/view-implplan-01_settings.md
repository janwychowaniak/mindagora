# Plan implementacji widoku Ustawienia (`/settings`)

## 1. Przegląd

Strona zarządzania kontem: klucz OpenRouter (podgląd zamaskowany, zmiana z walidacją przez API), uczestnicy AI
(lista, dodawanie z wyborem modelu, usuwanie z potwierdzeniem), e-mail read-only. Te same wyspy (`ApiKeyForm`,
`ParticipantsPanel`) obsługują później onboarding (widok 02). Historyjki: US-007, US-008, US-009, US-010, US-011,
US-013, US-032, US-033. Powiązane: US-031 (timeout walidacji), US-012 (min. 2 uczestników — informacja w panelu).

## 2. Routing widoku

`src/pages/settings.astro` — za sesją (middleware), bez bramki onboardingu (ap7 §4). Query `?notice=api-key`
→ baner „Add your OpenRouter API key to continue." nad sekcją klucza (źródło: przekierowanie z `412`).
Strona przekazuje do wyspy `email` (z `Astro.locals.user`) i `notice`.

## 3. Struktura komponentów

```
settings.astro
└── Layout (user)
    └── SettingsView (client:load)            src/components/settings/SettingsView.tsx
        ├── SettingsNotice?                    baner z ?notice
        ├── section „OpenRouter API key"
        │   └── ApiKeyForm mode="settings"     src/components/settings/ApiKeyForm.tsx
        │       └── ErrorDialog                src/components/shared/ErrorDialog.tsx
        ├── section „AI participants"
        │   └── ParticipantsPanel              src/components/settings/ParticipantsPanel.tsx
        │       ├── ParticipantList            src/components/settings/ParticipantList.tsx
        │       │   └── ConfirmDialog          src/components/shared/ConfirmDialog.tsx
        │       └── AddParticipantForm         src/components/settings/AddParticipantForm.tsx
        │           └── ModelCombobox          src/components/settings/ModelCombobox.tsx
        └── section „Account" (e-mail read-only)
```

## 4. Szczegóły komponentów

### SettingsView

- Opis: układ trzech sekcji w `Card`ach, przekazuje `email` i `notice`.
- Elementy: `h1` „Settings", `SettingsNotice` (rola `status`), trzy `Card`.
- Interakcje: brak własnych.
- Typy: `SettingsViewProps { email: string; notice: "api-key" | null }`.
- Propsy: `email`, `notice`.

### ApiKeyForm

- Opis: pojedyncze pole klucza z przełącznikiem widoczności i przyciskiem Save; ładuje aktualny klucz.
- Elementy: `Label` + `Input type={visible ? "text" : "password"}` (`autoComplete="off"`, `spellCheck={false}`),
  przycisk-ikona oka (`aria-pressed`, `aria-label` „Show/Hide API key"), `Button` „Save", komunikat sukcesu
  („API key saved", `role="status"`), komunikat błędu inline dla `400 Validation error`/`500`, `Skeleton` podczas
  ładowania, `ErrorDialog` dla `400 Invalid API key`, `408`, błędu sieci.
- Interakcje: wpisywanie; przełącznik oka; submit (Enter w polu lub Save).
- Walidacja: `trim().length > 0` (przycisk disabled przy pustym); reszta po stronie API.
- Typy: `UserSettingsDTO`, `UpdateUserSettingsCommand`, `UpdateUserSettingsResponseDTO`, `ApiFailure`.
- Propsy: `mode: "settings" | "onboarding"`, `onSaved?: (settings: UserSettingsDTO) => void`.
  W trybie `onboarding` pole startuje puste (bez `GET`, bo klucza nie ma), nagłówek/tekst kroku po stronie widoku 02.

### ParticipantsPanel

- Opis: kontener listy i formularza; trzyma listę w stanie (`useParticipants`), informuje rodzica o liczbie.
- Elementy: nagłówek z licznikiem („2 participants"), informacja „At least 2 participants are needed to start a
  conversation" gdy < 2 (`role="status"`), `ParticipantList`, `Separator`, `AddParticipantForm`.
- Interakcje: dodanie → dopisanie do listy i ponowne sortowanie po aliasie (case-insensitive, jak API);
  usunięcie → usunięcie z listy.
- Typy: `AiParticipantDTO[]`.
- Propsy: `onCountChange?: (count: number) => void`.

### ParticipantList

- Opis: lista wierszy; empty state „No participants yet".
- Elementy: `ul` (`data-testid="participant-list"`), wiersz: kropka koloru (`span` z `style.backgroundColor`,
  `aria-hidden`), alias (`font-medium`), `model_id` (`text-muted-foreground`, `font-mono`), przycisk kosza
  (`aria-label` „Delete participant [alias]"), `ConfirmDialog` („Delete participant '[alias]'?", opis: „Messages
  from this participant stay in your conversations as (Deleted Participant).", akcja „Delete").
- Interakcje: kosz → dialog → potwierdzenie → `DELETE /api/ai-participants/:id` → `onDeleted(id)`; błąd → inline
  w wierszu („Could not delete. Please try again.").
- Propsy: `participants: AiParticipantDTO[]`, `onDeleted: (id: string) => void`.

### AddParticipantForm

- Opis: formularz alias + model; kolor losowany przy zapisie.
- Elementy: `Label`+`Input` alias (`maxLength={30}`, opis reguły pod polem: „Letters, digits, spaces, - _ . — at
  least one letter or digit"), `ModelCombobox`, `Button` „Add participant", błędy per pole (`role="alert"`).
- Interakcje: submit → walidacja client-side → `POST /api/ai-participants` → sukces: reset formularza, `onAdded(dto)`;
  `409` → błąd przy aliasie (z `details.alias`); `400 Validation error` → błędy z mapy; `500` → błąd ogólny.
- Walidacja client-side (lustro ap5 §4.1): alias `trim` 1–30 znaków, regex `^(?=.*[A-Za-z0-9])[A-Za-z0-9 ._-]+$`;
  model wybrany.
- Typy: `CreateAiParticipantCommand`, `CreateAiParticipantResponseDTO`, `OpenRouterModelDTO`.
- Propsy: `onAdded: (participant: AiParticipantDTO) => void`.

### ModelCombobox

- Opis: `Popover` + `Command` z wyszukiwaniem po `id` i `name`; ładowanie leniwe przy pierwszym otwarciu.
- Elementy: `Button variant="outline" role="combobox" aria-expanded` z etykietą wybranego modelu lub „Select a
  model", `CommandInput` „Search models…", `CommandList` (`ScrollArea`/max-h), `CommandEmpty` „No models found",
  `CommandItem` (`data-testid="model-option"`) z `name` i `id` w drugiej linii; stan ładowania (spinner + „Loading
  models…"), stan błędu („Could not load models. Try again." + przycisk retry).
- Interakcje: otwarcie → `useModels().load()` jeśli brak danych; wybór → `onChange(id)` i zamknięcie.
- Typy: `OpenRouterModelListDTO`, `OpenRouterModelDTO`.
- Propsy: `value: string | null`, `onChange: (modelId: string) => void`, `disabled?`.
- Uwaga: `412` z `/api/openrouter-models` obsługuje `api-client` (przekierowanie do `/settings?notice=api-key`);
  na stronie ustawień oznacza to przeładowanie z banerem — akceptowalne, bo zdarza się tylko przy braku klucza.

## 5. Typy

- Z `types.ts`: `UserSettingsDTO`, `UpdateUserSettingsCommand`, `AiParticipantDTO`, `CreateAiParticipantCommand`,
  `OpenRouterModelDTO`, `OpenRouterModelListDTO`, `ApiErrorResponseDTO`.
- Nowe (klient): `ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure }`,
  `ApiFailure { status: number; error: string; details: string | Record<string, string>; message: string }`
  (`src/lib/api-client.ts`); `LoadState<T> = { status: "idle" | "loading" | "ready" | "error"; data?: T; message?: string }`
  (lokalnie w hookach, bez wspólnego modułu, dopóki nie powtórzy się trzeci raz).
- Bez ViewModeli: DTO wystarczają; formularz trzyma własne pola `alias`, `modelId`.

## 6. Zarządzanie stanem

- `useApiKey()` (`src/components/hooks/useApiKey.ts`): `settings` (LoadState<UserSettingsDTO>), `save(key)` →
  `{ ok } | { failure }`, `saving`.
- `useParticipants()` (`useParticipants.ts`): `participants` (LoadState<AiParticipantDTO[]>), `add(dto)`,
  `remove(id)` (mutacje przez API wewnątrz hooka, aktualizacja lokalna po sukcesie, sortowanie po aliasie).
- `useModels()` (`useModels.ts`): `models` (LoadState<OpenRouterModelDTO[]>), `load()` idempotentne.
- Stan formularzy lokalnie w komponentach (`useState`). Bez kontekstu ani store'a.

## 7. Integracja API

| Akcja             | Wywołanie                         | Typ żądania                                                 | Typ odpowiedzi                                           |
| ----------------- | --------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| podgląd klucza    | `GET /api/user-settings`          | —                                                           | `UserSettingsDTO` (`openrouter_api_key: string \| null`) |
| zapis klucza      | `PUT /api/user-settings`          | `UpdateUserSettingsCommand`                                 | `UpdateUserSettingsResponseDTO`                          |
| lista uczestników | `GET /api/ai-participants`        | —                                                           | `AiParticipantDTO[]` (posortowane po aliasie)            |
| dodanie           | `POST /api/ai-participants`       | `CreateAiParticipantCommand` (`color` z `randomHexColor()`) | `CreateAiParticipantResponseDTO` (201)                   |
| usunięcie         | `DELETE /api/ai-participants/:id` | —                                                           | `ApiSuccessResponseDTO`                                  |
| modele            | `GET /api/openrouter-models`      | —                                                           | `OpenRouterModelListDTO`                                 |

Wszystkie przez `api-client` (cookie same-origin, `Content-Type: application/json` na zapisach).

## 8. Interakcje użytkownika

1. Wejście: skeletony w sekcjach klucza i uczestników → dane.
2. Oko: przełącza `type` pola; stan nie jest zapamiętywany.
3. Save klucza: pole i przycisk zablokowane, po sukcesie „API key saved" (znika po kolejnej edycji); po błędzie
   walidacji dialog z komunikatem OpenRoutera 1:1, klucz w polu zostaje (niezapisany).
4. Dodanie uczestnika: po sukcesie wiersz pojawia się w liście na właściwej pozycji alfabetycznej, formularz
   czyści się, licznik rośnie, komunikat „min. 2" znika przy 2.
5. Usunięcie: dialog → potwierdzenie → wiersz znika, licznik maleje, komunikat „min. 2" wraca poniżej 2.
6. Combobox: pierwsze otwarcie ładuje modele (spinner), wpisywanie filtruje, wybór zamyka.

## 9. Warunki i walidacja

- Klucz: niepusty po `trim` (przycisk disabled). API waliduje przez ping (10 s).
- Alias: 1–30 znaków po `trim`, regex jak w API, unikalność po stronie API (`409`).
- Model: wymagany (przycisk „Add participant" disabled bez modelu).
- Kolor: generowany, format `#RRGGBB` gwarantowany przez `randomHexColor()`.

## 10. Obsługa błędów

Wg ap7 §6: `401` → `/login`; `412` → `/settings?notice=api-key`; `400 Invalid API key` i `408` → `ErrorDialog`
(tytuł „API key not saved", treść `details`); `409` → błąd przy aliasie; `400 Validation error` (mapa) → błędy per
pole; `500`/sieć → inline w sekcji („Something went wrong. Please try again." / „Network error - check your
connection."); modele: błąd inline w Combobox z retry.

## 11. Kroki implementacji

1. Fundament (przed widokiem, osobne commity): `src/lib/api-client.ts` (+ przeniesienie helperów z `auth-api.ts`),
   `src/lib/color.ts`, `src/components/shared/{ConfirmDialog,ErrorDialog}.tsx`, link „Settings" i „Conversations"
   w nagłówku `Layout.astro` z `aria-current`.
2. Hooki `useApiKey`, `useParticipants`, `useModels`.
3. `ApiKeyForm` + `ErrorDialog` w użyciu; `settings.astro` z sekcją klucza — sprawdzenie w przeglądarce (zapis
   poprawnego i błędnego klucza).
4. `ModelCombobox` + `AddParticipantForm`.
5. `ParticipantList` + `ConfirmDialog`; `ParticipantsPanel` spina całość; sekcja Account.
6. `data-testid` wg ap7 §5.4; lint, tsc, build; przebieg w Chrome: zmiana klucza, dodanie dwóch uczestników,
   duplikat aliasu (409), usunięcie z dialogiem.
