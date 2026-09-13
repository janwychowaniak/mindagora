# Dokument wymagań produktu (PRD) - MindAgora

## 1. Przegląd produktu

MindAgora to aplikacja webowa umożliwiająca prowadzenie konwersacji z wieloma modelami AI jednocześnie w ramach jednego, spójnego czatu. Aplikacja rozwiązuje problem czasochłonnego przełączania się między różnymi usługami AI (ChatGPT, Claude, Gemini) poprzez agregację dostępu do modeli za pomocą OpenRouter API.

Kluczowe cechy produktu:

- Jednolity interfejs czatu dla wielu modeli AI
- Wspólny kontekst konwersacji dla wszystkich uczestników AI
- Persystencja historii rozmów

Target user: Użytkownicy pracujący z wieloma modelami AI, którzy potrzebują konfrontować różne perspektywy w ramach jednej dyskusji, bez konieczności ręcznego zarządzania kontekstem między różnymi usługami czatów konwersacyjnych.

## 2. Problem użytkownika

Aktualny proces pracy z wieloma modelami AI w ramach osobnych usług czatów konwersacyjnych charakteryzuje się następującymi problemami:

Problem główny: Manualne przełączanie między różnymi modelami AI wymaga otwierania wielu kart/aplikacji, kopiowania kontekstu konwersacji, konstruowania podsumowań poprzednich wymian i przeklejania między usługami.

Specyficzne pain points:

- Utrata kontekstu podczas przełączania między modelami
- Czasochłonne zarządzanie historią konwersacji
- Brak możliwości bezpośredniego porównania odpowiedzi różnych modeli na ten sam input w ramach jednego wątku
- Konieczność zapamiętywania, który model udzielił jakiej odpowiedzi
- Fragmentacja wiedzy i insights między różnymi platformami
- Niemożność naturalnego przepływu konwersacji między różnymi perspektywami AI

Konsekwencje: Spowolnienie pracy, frustracja, ryzyko błędów przy kopiowaniu kontekstu, ograniczenie kreatywnego wykorzystania różnych modeli w jednym przepływie myślowym.

## 3. Wymagania funkcjonalne

### 3.1. Autentykacja i zarządzanie kontem

- Rejestracja użytkownika z weryfikacją email (Supabase Auth)
- Logowanie użytkownika
- Wylogowanie użytkownika
- Email verification: disabled w local dev, standard na produkcji
- Display email użytkownika w Account Settings (read-only)
- Zasięg ochrony (decyzja 2026-09-12, lekcja 3x1): CAŁA aplikacja wymaga zalogowania. Publiczne są wyłącznie strona logowania (`/login`), strona rejestracji (`/register`) i ich endpointy API. Każda inna strona otwarta bez sesji przekierowuje na `/login`; każdy inny endpoint API bez sesji odpowiada `401`. Zalogowany użytkownik wchodzący na `/login` lub `/register` jest przekierowywany do aplikacji.
- Model sesji (decyzja 2026-09-12, E3): sesja przeglądarkowa w cookies httpOnly zarządzanych wyłącznie po stronie serwera (`@supabase/ssr`); strony renderowane server-side znają użytkownika już przy renderze. API przyjmuje dodatkowo token w nagłówku `Authorization: Bearer` (klienci nieprzeglądarkowi, testy). Szczegóły: plan API (ap5 §3) i specyfikacja auth (ap6).
- Po rejestracji: gdy weryfikacja e-mail jest wyłączona (local dev), użytkownik jest od razu zalogowany i trafia do onboardingu; gdy włączona (produkcja), widzi komunikat o wysłanym linku potwierdzającym i loguje się po potwierdzeniu (link prowadzi na `/login`).

### 3.2. Onboarding

- Guided setup dla nowego użytkownika: rejestracja/login → klucz OpenRouter → minimum 2 uczestników AI
- Resume onboarding przy przerwaniu (check: czy ma klucz API + czy ma minimum 2 uczestników)
- Wracający użytkownik z kompletnym setupem trafia bezpośrednio do głównego widoku
- Mapa tras i bramkowanie (decyzja 2026-09-12, lekcja 2x5): `/onboarding` (jedna strona, krok wyliczany server-side: brak klucza → krok 1, mniej niż 2 uczestników → krok 2, setup kompletny → przekierowanie do `/`), `/` (lista konwersacji), `/conversations/new` (szkic), `/conversations/:id` (czat), `/settings`. Strony `/` i `/conversations/*` przekierowują do `/onboarding` przy niekompletnym setupie; `/settings` jest dostępne zawsze po zalogowaniu (tam naprawia się klucz). Szczegóły: plan UI (ap7 §4)

### 3.3. Zarządzanie kluczem OpenRouter API

- Bezpieczne przechowywanie klucza w Supabase (user_settings table)
- Masked input z toggle show/hide (eye icon)
- Walidacja klucza poprzez API ping przy zapisie
- Timeout 10 sekund dla walidacji
- Hard block zapisu w przypadku błędu walidacji
- Dialog z informacją o timeout/błędzie

### 3.4. Zarządzanie uczestnikami AI

- Create uczestnika AI:
  - Alias: unique per user, max 30 znaków, alfanumeryczne + spacje + podstawowe znaki specjalne (-, _, .), co najmniej jeden znak alfanumeryczny (aliasy w rodzaju "___" lub "..." są odrzucane)
  - Model ID: dropdown z listy załadowanej z OpenRouter API
  - Kolor: losowany przez frontend przy tworzeniu (random w MVP) i wysyłany w żądaniu; API wymaga koloru i waliduje format #RRGGBB
- Delete uczestnika AI (hard delete z bazy) po potwierdzeniu w dialogu "Delete participant '[alias]'?" (decyzja 2026-09-12, lekcja 2x5: operacja równie nieodwracalna jak usunięcie konwersacji; dialog informuje, że wiadomości uczestnika zostają jako "(Deleted Participant)")
- Brak Edit uczestnika w MVP
- Możliwość wielu uczestników z tym samym modelem ale różnymi aliasami
- Minimum 2 uczestników wymagane do rozpoczęcia konwersacji
- Lista modeli ładuje się z OpenRouter API z loading spinner w dropdown
- Wiadomości usuniętych uczestników pozostają w konwersacjach jako "(Deleted Participant)" w szarym kolorze

### 3.5. Zarządzanie konwersacjami

- Lista konwersacji (sorted by last updated, most recent first)
- Elementy listy:
  - Tytuł konwersacji (auto-generated: pierwsze 50 znaków pierwszej wiadomości, z "..." tylko gdy wiadomość była dłuższa niż 50 znaków; albo user-edited, max 100 znaków)
  - Data ostatniej aktualizacji (relative time, statyczne do refresh, np. "2h ago")
  - Badge z liczbą wszystkich wiadomości (user + AI)
- Inline editing tytułu: click → input field, Enter = save, Escape = cancel
- Create nowej konwersacji: przycisk "+ New conversation" → konwersacja zapisuje się po pierwszej pomyślnej wymianie (user message + AI response)
- Delete konwersacji: confirmation dialog "Delete conversation '[title]'?", hard delete, no undo
- Nawigacja: lista konwersacji ↔ aktywna konwersacja (przycisk "← List" z widoku czatu)
- Single-tab usage (brak multi-tab sync)

### 3.6. Konwersacja multi-model

- Layout: stack layout - wszystkie wiadomości pod sobą, align-left
- Rozróżnienie wiadomości przez prefix label: "User" vs "AI - [alias]"
- Dark mode styling:
  - User messages: lekko jaśniejszy background, białe kolory prefix/border
  - AI messages: base dark background, colored border-left (kolor uczestnika) + colored prefix label
- Load all messages at once (brak pagination)
- Wysyłanie wiadomości:
  - Dropdown wyboru uczestnika przy KAŻDEJ wiadomości (wymuszony świadomy wybór, sortowanie alfabetyczne po aliasie)
  - Dropdown disabled jeśli użytkownik ma <2 uczestników (tooltip: "Add at least 2 AI participants in Settings")
  - Przycisk Send disabled gdy input pusty lub tylko whitespace
  - Klawisze kompozytora (decyzja 2026-09-12, lekcja 2x5): Enter wysyła wiadomość na tych samych warunkach co przycisk Send (tekst niepusty, uczestnik wybrany, brak trwającej wysyłki); Shift+Enter wstawia nową linię; podpowiedź pod polem; wpisywanie przez IME (kompozycja) nie wysyła
  - Max 10,000 znaków wiadomości
  - Character counter widoczny od 9000 znaków
  - Zablokowanie input box + dropdown podczas oczekiwania na odpowiedź AI
  - Loading spinner w miejscu gdzie pojawi się odpowiedź
- Komunikacja z OpenRouter: standardowy format (role: user/assistant)
- Non-streaming responses
- Auto-save po każdej pomyślnej wymianie
- Timestamps: absolute przy każdej wiadomości (np. "10:45 AM")
- Date separators między dniami (np. "Dec 15", absolute)
- Auto-scroll to bottom tylko gdy użytkownik jest już na dole

### 3.7. Obsługa błędów

- Wspólny mechanizm błędów OpenRouter API:
  - Jeden dialog dla wszystkich błędów podczas konwersacji
  - Wyświetla komunikat błędu 1:1 z OpenRouter (lub generic "Received invalid response" gdy niepoprawny format)
  - Przycisk OK
  - Input box NIE jest czyszczony (zachowuje tekst wiadomości)
- Rodzaje błędów:
  - Timeout: komunikat aplikacji "OpenRouter request timed out" (przy timeoucie OpenRouter nie odpowiada, więc nie ma jego komunikatu)
  - Wygaśnięty klucz: komunikat z OpenRouter
  - Przekroczony limit: komunikat z OpenRouter
  - Invalid response: "Received invalid response from OpenRouter. Please try again."
  - Network error: "Network error - check your connection."

### 3.8. UI/UX

- Theme: dark mode jako default i jedyny w MVP
- Język: angielski (bez opcji zmiany)
- Link "Help" w header prowadzący do README na GitHub
- Przycisk "Logout" w header

## 4. Granice produktu

### 4.1. Funkcjonalności NIE w MVP

- Dynamiczne dodawanie/usuwanie uczestników z aktywnej konwersacji
- Edycja uczestników AI po ich utworzeniu
- Edycja już wysłanych wiadomości użytkownika
- Konfiguracja parametrów modeli (temperature, top_p, max_tokens, etc)
- Token usage tracking i estymacja kosztów
- Export/import konwersacji
- Threading (odpowiedzi na konkretne wiadomości)
- Streaming responses
- Archiwizowanie konwersacji
- Limity na ilość konwersacji/wiadomości per user
- Keyboard shortcuts (poza konwencją kompozytora: Enter wysyła, Shift+Enter nowa linia — patrz §3.6)
- Dark mode toggle (tylko dark mode)
- Zmiana języka (tylko angielski)
- Real-time collaboration
- Search w konwersacjach
- Zmiana hasła w aplikacji
- Odzyskiwanie hasła (forgot/reset password) — decyzja 2026-09-12 (B21, lekcja 3x1): poza MVP; na etapie kursu konto odzyskuje się przez panel Supabase; kandydat na V2 po skonfigurowaniu wysyłki e-mail na produkcji
- Delete account w aplikacji
- Parsowanie @mentions dla wyboru adresata

### 4.2. Techniczne NIE w MVP

- Pagination/lazy loading wiadomości
- Smart sorting uczestników (tylko alfabetycznie po aliasie)
- Live update relative time
- Pre-defined paleta kolorów (losowe w V1)
- Offline detection i handling
- Rate limiting po stronie aplikacji
- Soft delete uczestników
- Monitoring limitów kontekstu
- Advanced error recovery (retry logic)
- Multi-tab sync

### 4.3. Integracje NIE w MVP

- Inne dostawcy modeli poza OpenRouter
- Własny algorytm routingu zapytań
- Analityka użycia
- Notyfikacje

## 5. Historyjki użytkowników

### 5.1. Autentykacja i onboarding

US-001: Rejestracja nowego użytkownika

Opis: As a new user, I want to register for an account, so that I can start using MindAgora.

Kryteria akceptacji:

- Given I am on the registration page
- When I provide valid email and password
- Then my account is created in Supabase Auth
- And if email verification is disabled (local dev), I am signed in immediately and redirected to onboarding flow
- And if email verification is enabled (production), I see a message that a confirmation link was sent to my email, and after confirming I log in on the login page

US-002: Logowanie istniejącego użytkownika

Opis: As a registered user, I want to log in to my account, so that I can access my conversations and settings.

Kryteria akceptacji:

- Given I am on the login page
- When I provide valid email and password
- Then I am authenticated via Supabase Auth
- And if I have completed onboarding (API key + min 2 participants), I am redirected to conversation list
- And if I have not completed onboarding, I am redirected to the appropriate onboarding step
- Given I am not logged in
- When I open any application page other than login or registration
- Then I am redirected to the login page
- Given I am logged in
- When I open the login or registration page
- Then I am redirected to the application

US-003: Wylogowanie z aplikacji

Opis: As a logged-in user, I want to log out of my account, so that I can secure my session.

Kryteria akceptacji:

- Given I am logged in
- When I click the "Logout" button in header (present on every page behind login)
- Then I am logged out from Supabase Auth
- And I am redirected to login page
- And my session is cleared

US-004: Guided onboarding - dodanie klucza OpenRouter

Opis: As a new user during onboarding, I want to add my OpenRouter API key, so that the application can communicate with AI models.

Kryteria akceptacji:

- Given I am in onboarding flow and have no API key
- When I enter an API key in the masked input field
- And I can toggle show/hide with eye icon
- And I click save
- Then the key is validated via OpenRouter API ping with 10s timeout
- And if validation succeeds, the key is saved to user_settings table and I proceed to next step
- And if validation fails or times out, I see an error dialog and the key is NOT saved

US-005: Guided onboarding - tworzenie minimum 2 uczestników AI

Opis: As a new user during onboarding, I want to create at least 2 AI participants, so that I can start conversations.

Kryteria akceptacji:

- Given I am in onboarding flow and have valid API key
- When I create first participant (alias + model from dropdown + auto-generated color)
- Then the participant is saved to ai_participants table
- And I am prompted to create at least one more participant
- When I create second participant
- Then I can proceed to main application view
- And if I try to skip with <2 participants, I see validation message

US-006: Resume przerwany onboarding

Opis: As a user who interrupted onboarding, I want to continue from where I left off, so that I don't have to start over.

Kryteria akceptacji:

- Given I started but did not complete onboarding
- When I log in again
- Then the system checks if I have API key
- And checks if I have minimum 2 participants
- And redirects me to the first incomplete step
- And when I complete all steps, I proceed to main view

### 5.2. Zarządzanie kluczem OpenRouter API

US-007: Aktualizacja klucza OpenRouter API

Opis: As a logged-in user, I want to update my OpenRouter API key in Settings, so that I can change or fix my key.

Kryteria akceptacji:

- Given I am in Account Settings
- When I enter a new API key in the masked input field
- And I can toggle show/hide with eye icon
- And I click save
- Then the key is validated via OpenRouter API ping with 10s timeout
- And if validation succeeds, the key is updated in user_settings table
- And if validation fails or times out, I see an error dialog and the key is NOT updated

US-008: Wyświetlanie obecnego klucza OpenRouter API

Opis: As a logged-in user, I want to see my current API key (masked), so that I can verify which key is configured.

Kryteria akceptacji:

- Given I am in Account Settings
- When I view the API key field
- Then I see the key masked by default
- And I can click eye icon to toggle show/hide

### 5.3. Zarządzanie uczestnikami AI

US-009: Tworzenie nowego uczestnika AI

Opis: As a logged-in user, I want to create a new AI participant, so that I can include more models in my conversations.

Kryteria akceptacji:

- Given I am in Account Settings
- When I click "Add AI Participant"
- And I enter an alias (max 30 chars, alphanumeric + spaces + -, _, .; at least one alphanumeric character)
- And I select a model from dropdown loaded from OpenRouter API
- And I click save
- Then the UI generates a random color (#RRGGBB) and sends it with the request; the API validates the format
- And the participant is saved to ai_participants table
- And the alias must be unique per user (validation error if duplicate)

US-010: Tworzenie wielu uczestników z tym samym modelem

Opis: As a logged-in user, I want to create multiple participants using the same model but with different aliases, so that I can have different "personas" of the same model.

Kryteria akceptacji:

- Given I have an existing participant with model X and alias "Analityk"
- When I create a new participant with model X and alias "Kreatywny"
- Then both participants are saved successfully
- And both appear in the participants list
- And both are available in conversation dropdown

US-011: Usuwanie uczestnika AI

Opis: As a logged-in user, I want to delete an AI participant, so that I can remove participants I no longer use.

Kryteria akceptacji:

- Given I am in Account Settings with existing participants
- When I click delete on a participant
- And I confirm in the dialog "Delete participant '[alias]'?"
- Then the participant is hard deleted from ai_participants table
- And the alias becomes available for reuse
- And existing messages from this participant in conversations are preserved but shown as "(Deleted Participant)" in gray color

US-012: Blokada tworzenia konwersacji z mniej niż 2 uczestnikami

Opis: As a user with less than 2 AI participants, I want to be prevented from starting a conversation, so that I understand I need to configure participants first.

Kryteria akceptacji:

- Given I have less than 2 AI participants
- When I try to create a new conversation or send a message
- Then the dropdown for selecting AI participant is disabled
- And I see tooltip: "Add at least 2 AI participants in Settings"

US-013: Ładowanie listy modeli z OpenRouter API

Opis: As a user creating or viewing AI participants, I want to see available models loaded from OpenRouter, so that I can choose from current offerings.

Kryteria akceptacji:

- Given I am creating a new participant
- When the model dropdown is opened
- Then the system fetches available models from OpenRouter API
- And shows a loading spinner while fetching
- And populates the dropdown with model IDs
- And if API fails, shows error message

### 5.4. Zarządzanie konwersacjami

US-014: Wyświetlanie listy konwersacji

Opis: As a logged-in user, I want to see a list of my conversations, so that I can choose which conversation to continue or review.

Kryteria akceptacji:

- Given I am logged in and have completed onboarding
- When I access the main view
- Then I see a list of my conversations sorted by last updated (most recent first)
- And each conversation shows: title, relative last updated time (static), message count badge
- And if I have no conversations, I see empty state

US-015: Tworzenie nowej konwersacji

Opis: As a logged-in user with at least 2 AI participants, I want to create a new conversation, so that I can start a fresh discussion.

Kryteria akceptacji:

- Given I am on conversation list
- When I click "+ New conversation"
- Then I see an empty chat window
- And I can compose and send first message
- And the conversation is only saved after first successful exchange (user message + AI response)
- And the title is auto-generated from first 50 chars of first user message + "..." only if the message was longer than 50 chars (no ellipsis otherwise)

US-016: Otwarcie istniejącej konwersacji

Opis: As a logged-in user, I want to open an existing conversation, so that I can review history and continue the discussion.

Kryteria akceptacji:

- Given I am on conversation list
- When I click on a conversation
- Then I am navigated to conversation view
- And I see all messages loaded at once (no pagination)
- And I can send new messages to continue the conversation

US-017: Edycja tytułu konwersacji (inline)

Opis: As a logged-in user, I want to edit the title of a conversation inline, so that I can give it a more meaningful name.

Kryteria akceptacji:

- Given I am on conversation list
- When I click on conversation title
- Then the title becomes an editable input field
- And when I press Enter, the title is saved (max 100 chars) and field exits edit mode
- And when I press Escape, changes are cancelled and field exits edit mode
- And validation prevents empty or whitespace-only titles

US-018: Usuwanie konwersacji

Opis: As a logged-in user, I want to delete a conversation, so that I can remove conversations I no longer need.

Kryteria akceptacji:

- Given I am on conversation list
- When I click delete on a conversation
- Then I see confirmation dialog: "Delete conversation '[title]'?"
- And when I confirm, the conversation is hard deleted from database
- And when I cancel, nothing happens
- And there is no undo option

US-019: Nawigacja między listą a konwersacją

Opis: As a user viewing a conversation, I want to navigate back to conversation list, so that I can choose another conversation.

Kryteria akceptacji:

- Given I am viewing an active conversation
- When I click "← List" button
- Then I am navigated back to conversation list
- And conversation list reflects any updates (e.g., last updated time, message count)

### 5.5. Konwersacja multi-model

US-020: Wysyłanie wiadomości do wybranego uczestnika AI z pełnym kontekstem

Opis: As a user in an active conversation, I want to send a message to a specific AI participant, so that I can get a response from that model with full awareness of the entire conversation history.

Kryteria akceptacji:

- Given I am in an active conversation
- When I type a message (max 10,000 chars)
- And I select an AI participant from alphabetically sorted dropdown
- And I click Send button or press Enter (Shift+Enter inserts a new line)
- Then the system loads the complete conversation history from database (all previous messages: user + AI)
- And formats the history according to OpenRouter API format (role: user/assistant)
- And appends the new user message to this history
- And sends the complete message sequence as context to OpenRouter API with the selected model
- And I see a loading spinner where AI response will appear
- And input box and dropdown are disabled during waiting
- And when response arrives, the user message (role "user") and the AI message are saved to database together (nothing is persisted if OpenRouter fails); the AI message has role "assistant" and the ai_participant_id of the selected participant (alias, model and color are joined from ai_participants at read time, not stored on the message)
- And the AI response is displayed in the conversation with colored border and prefix
- And input box is re-enabled and cleared
- And dropdown is re-enabled
- And the conversation's last_updated timestamp is updated
- And this context mechanism applies to every message exchange, whether it's the 2nd message in a new conversation or a continuation after a week

US-021: Walidacja pustej wiadomości

Opis: As a user composing a message, I want to be prevented from sending empty messages, so that I don't waste API calls.

Kryteria akceptacji:

- Given I am in an active conversation
- When the input field is empty or contains only whitespace
- Then the Send button is disabled
- And I cannot send the message (pressing Enter does nothing)

US-022: Limit znaków wiadomości

Opis: As a user composing a long message, I want to see a character counter, so that I know when I'm approaching the limit.

Kryteria akceptacji:

- Given I am typing a message
- When I reach 9000 characters
- Then I see a character counter showing current/max (e.g., "9000/10000")
- And when I reach 10,000 characters, I cannot type more
- And the counter remains visible until I reduce characters below 9000

US-023: Wyświetlanie historii konwersacji

Opis: As a user viewing a conversation, I want to see the full history with clear indication of who wrote each message, so that I can follow the discussion.

Kryteria akceptacji:

- Given I am viewing a conversation
- When the conversation loads
- Then I see all messages in stack layout (all aligned left, under each other)
- And user messages have prefix "User" with lighter background
- And AI messages have prefix "AI - [alias]" with colored border-left and colored prefix in participant's color
- And each message has absolute timestamp (e.g., "10:45 AM")
- And date separators appear between different days (e.g., "Dec 15")
- And all messages are loaded at once

US-024: Auto-scroll do najnowszej wiadomości

Opis: As a user receiving a new AI response, I want the chat to auto-scroll to the bottom if I'm already there, so that I see the new message without manual scrolling.

Kryteria akceptacji:

- Given I am at the bottom of conversation
- When a new AI response arrives
- Then the chat auto-scrolls to show the new message
- And if I'm scrolled up reading history, the chat does NOT auto-scroll (doesn't interrupt reading)

US-025: Kontynuacja konwersacji z pełnym kontekstem

Opis: As a user returning to an old conversation, I want all AI participants to see the full conversation history, so that their responses consider previous context.

Kryteria akceptacji:

- Given I open a conversation from a week ago
- When I send a new message to any AI participant
- Then the full conversation history is sent to OpenRouter API as context
- And the AI response reflects understanding of previous messages
- And this works regardless of which participant I choose

US-026: Wymuszony wybór uczestnika przy każdej wiadomości

Opis: As a user sending a message, I want to explicitly choose which AI participant should respond each time, so that I consciously decide who to ask.

Kryteria akceptacji:

- Given I am composing a message
- Then I must select a participant from dropdown before I can send (the Send button stays disabled and Enter does nothing)
- And the dropdown does NOT remember "last used" participant
- And the dropdown is sorted alphabetically by alias
- And I make a conscious choice for every message

US-027: Wyświetlanie wiadomości usuniętych uczestników

Opis: As a user viewing a conversation with messages from deleted participants, I want to still see those messages, so that conversation history is preserved.

Kryteria akceptacji:

- Given I deleted an AI participant who had messages in existing conversations
- When I view those conversations
- Then messages from deleted participant are shown as "(Deleted Participant)" in gray color
- And the message content is preserved
- And timestamp is preserved

### 5.6. Obsługa błędów

US-028: Obsługa błędu komunikacji z OpenRouter podczas konwersacji

Opis: As a user who encounters an API error during conversation, I want to see a clear error message, so that I understand what went wrong and can take action.

Kryteria akceptacji:

- Given I sent a message to an AI participant
- When OpenRouter API returns an error (timeout, invalid key, rate limit, etc.)
- Then I see a dialog with error message from OpenRouter (or generic message for invalid response format)
- And the dialog has only "OK" button
- And my message remains in the input box (not cleared)
- And I can choose to try again with different participant, modify message, or fix the issue

US-029: Obsługa network error

Opis: As a user who loses internet connection during conversation, I want to see a network error message, so that I know to check my connection.

Kryteria akceptacji:

- Given I sent a message to an AI participant
- When network connection is lost or times out
- Then I see a dialog: "Network error - check your connection."
- And the dialog has only "OK" button
- And my message remains in the input box

US-030: Obsługa invalid response z OpenRouter

Opis: As a user who receives an invalid response format from OpenRouter, I want to see a clear error, so that I know the service returned unexpected data.

Kryteria akceptacji:

- Given I sent a message to an AI participant
- When OpenRouter returns response in invalid/unexpected format
- Then I see a dialog: "Received invalid response from OpenRouter. Please try again."
- And the dialog has only "OK" button
- And my message remains in the input box

US-031: Timeout podczas walidacji klucza OpenRouter

Opis: As a user saving an API key, I want to be informed if validation times out, so that I know the key couldn't be verified.

Kryteria akceptacji:

- Given I am saving OpenRouter API key
- When validation API ping takes longer than 10 seconds
- Then I see a dialog informing about timeout
- And the key is NOT saved (hard block)
- And I can try again

### 5.7. Account Settings

US-032: Dostęp do Account Settings

Opis: As a logged-in user, I want to access Account Settings, so that I can manage my API key and AI participants.

Kryteria akceptacji:

- Given I am logged in
- When I click on Settings (in navigation/header)
- Then I see Account Settings page with:
  - OpenRouter API key field (masked input with show/hide)
  - List of AI participants with create/delete options
  - Email display (read-only)
  - Link "Help" pointing to GitHub README
  - Logout button

US-033: Wyświetlanie email użytkownika

Opis: As a logged-in user viewing Settings, I want to see my email address, so that I can verify which account I'm using.

Kryteria akceptacji:

- Given I am in Account Settings
- When the page loads
- Then I see my email address from Supabase Auth
- And it is displayed as read-only (no editing in MVP)

US-034: Dostęp do dokumentacji Help

Opis: As a user needing help, I want to access documentation, so that I can learn how to use the application.

Kryteria akceptacji:

- Given I am logged in
- When I click "Help" link in header
- Then I am taken to README on GitHub in a new tab

### 5.8. UI/UX

US-035: Dark mode interface

Opis: As a user of the application, I want to use dark mode interface, so that it's comfortable for extended use.

Kryteria akceptacji:

- Given I access any page of the application
- Then I see dark mode styling throughout
- And there is no toggle for light mode in MVP

US-036: Język angielski jako jedyny

Opis: As a user of the application, I want to see interface in English, as this is the only supported language in MVP.

Kryteria akceptacji:

- Given I access any page of the application
- Then all UI text, labels, messages are in English
- And there is no language selection option in MVP

## 6. Metryki sukcesu

### 6.1. Kryterium 1: Multi-model usage

Definicja: 50% moich konwersacji używa 3+ różnych modeli
Walidacja: Multi-model approach jest faktycznie użyteczny i wykorzystywany, nie tylko teoretyczny pomysł.

### 6.2. Kryterium 2: Persystencja i powrót do kontekstu

Definicja: Mogę wrócić do konwersacji po tygodniu i kontynuować bez utraty kontekstu
Walidacja: Persystencja danych działa poprawnie, kontekst konwersacji się utrzymuje w czasie.

### 6.3. Kryterium 3: Intuicyjny UX przełączania między modelami

Definicja: Mogę naturalnie przełączać się między modelami bez myślenia o technikaliach
Walidacja: UX jest intuicyjny i nie zakłóca naturalnej konwersacji, flow wspiera myślenie zamiast je przeszkadzać.
