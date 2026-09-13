# Aplikacja - MindAgora (MVP)

## Główny problem

Manualne przełączanie między różnymi modelami AI w oddzielnych konwersacjach (ChatGPT, Claude, Gemini) jest niewygodne i czasochłonne.
Wymaga kopiowania kontekstu, konstruowania podsumowań i przeklejania między usługami.
Uniemożliwia to płynną konfrontację różnych perspektyw AI w ramach jednej spójnej dyskusji.

## Rozwiązanie (wysokopoziomowo)

MindAgora to chat interface dla wielu modeli AI jednocześnie.
Zamiast przełączać się między ChatGPT, Claude i innymi, tworzysz jedną konwersację gdzie przy każdej wiadomości wybierasz który model ma odpowiedzieć.
Wszyscy widzą ten sam kontekst, więc każda odpowiedź uwzględnia całą historię rozmowy. Przestajesz kopiować kontekst między usługami - po prostu pytasz różne modele w tym samym miejscu.

## Najmniejszy zestaw funkcjonalności

### Zarządzanie konwersacjami (CRUD)

- Utworzenie nowej konwersacji (puste okno czatu)
- Lista konwersacji (sortowana most-recently-updated-first)
- Usunięcie konwersacji
- Edycja tytułu konwersacji (auto-generated z pierwszych 50 znaków, edytowalny)

### Account Settings

- Bezpieczne przechowywanie klucza OpenRouter API
- Walidacja klucza poprzez API ping przy zapisie
- CRUD uczestników AI (Create, Delete - bez Edit):
  - Alias (unique per user, np. "Marcin")
  - Model ID (dropdown z listy pobranej z OpenRouter API)
  - Kolor (losowany przy tworzeniu, używany w UI)
- Minimalna liczba uczestników: 2 (wymóg do rozpoczęcia konwersacji)

### Konwersacja multi-model

- Jedno okno czatu (chronologiczny group chat)
- Każda wiadomość użytkownika wymaga wskazania uczestnika AI: Dropdown przy przycisku "Wyślij"
- Wszyscy uczestnicy widzą pełny kontekst (bezstanowe API)
- Historia pokazuje kto napisał wiadomość (alias w kolorze uczestnika)
- Komunikacja z OpenRouter przez standardowy format (role: user/assistant)
- Non-streaming responses (loading spinner podczas oczekiwania)

### Persystencja i Auth

- Supabase Auth (logowanie użytkownika)
- Supabase Database:
  - users (auth.users z Supabase Auth — bez własnej tabeli users)
  - user_settings
  - ai_participants
  - conversations
  - messages

## Co NIE wchodzi w zakres MVP

### Funkcjonalności

- Dynamiczne dodawanie/usuwanie uczestników z aktywnej konwersacji
- Edycja uczestników AI po ich utworzeniu
- Konfiguracja parametrów modeli (temperature, top_p, etc)
- Token usage tracking i estymacja kosztów
- Export/import konwersacji
- Naturalne parsowanie języka (bez @mention)
- Threading (odpowiedzi na konkretne wiadomości)
- Streaming responses
- Monitoring limitów kontekstu
- Advanced error recovery (retry logic)

### Techniczne

- Rate limiting po stronie aplikacji
- Soft delete uczestników (tylko hard delete)
- Keyboard shortcuts
- Mobile app
- Real-time collaboration
- Search w konwersacjach

### Integracje

- Inne dostawcy modeli poza OpenRouter
- Własny algorytm routingu zapytań
- Analityka użycia
- Notyfikacje

## Kryteria sukcesu

1. **50% moich konwersacji używa 3+ różnych modeli** - walidacja że multi-model approach jest faktycznie użyteczny, nie tylko pomysł
2. **Mogę wrócić do konwersacji po tygodniu i kontynuować** - persystencja działa, kontekst się utrzymuje
3. **Mogę naturalnie przełączać się między modelami bez myślenia o technikaliach** - UX jest intuicyjny, proces nie przeszkadza w myśleniu
