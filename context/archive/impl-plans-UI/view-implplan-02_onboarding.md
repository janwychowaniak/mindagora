# Plan implementacji widoku Onboarding (`/onboarding`)

## 1. Przegląd

Prowadzona konfiguracja nowego konta w dwóch krokach: klucz OpenRouter, potem co najmniej dwóch uczestników AI
(US-004, US-005, US-006). Widok składa się z komponentów widoku 01 (`ApiKeyForm`, `ParticipantsPanel`) w trybie
prowadzonym; nowe są tylko strona, wyspa z krokami i bramkowanie w `index.astro`.

## 2. Routing widoku

`src/pages/onboarding.astro` — za sesją. Frontmatter: `getOnboardingStatus` → `resolveOnboardingStep`:
`complete` → `302 /`; inaczej `step` do wyspy. Błąd odczytu statusu → `503` z krótkim tekstem (awaria backendu,
nie stan użytkownika). Bramkowanie po drugiej stronie: `index.astro` (i strony czatu w widoku 04) przekierowują
do `/onboarding`, gdy krok ≠ `complete` (ap7 §4).

## 3. Struktura komponentów

```
onboarding.astro
└── Layout (user)
    └── OnboardingView step=… (client:load)     src/components/onboarding/OnboardingView.tsx
        ├── StepIndicator (inline)                „Step 1 of 2 · API key” / „Step 2 of 2 · Participants”
        ├── [step api-key]  Card → ApiKeyForm mode="onboarding" onSaved → location.assign("/onboarding")
        └── [step participants] Card → ParticipantsPanel onCountChange → Button „Continue” → location.assign("/")
```

## 4. Szczegóły komponentów

### OnboardingView

- Opis: nagłówek „Welcome to MindAgora", wskaźnik kroku, karta bieżącego kroku.
- Elementy: `h1`, `p` ze wskaźnikiem (`aria-current="step"` na aktywnym), `Card` z tytułem i opisem kroku.
- Krok `api-key`: opis „Paste your OpenRouter API key. It is checked with OpenRouter and stored in your settings.";
  `ApiKeyForm mode="onboarding"`; po `onSaved` pełna nawigacja na `/onboarding` — serwer wylicza krok 2 (jedno
  źródło prawdy, US-006).
- Krok `participants`: opis „Add at least two AI participants. Each one is a model with an alias."; `ParticipantsPanel`
  z `onCountChange={setCount}`; przycisk „Continue" (`data-testid="onboarding-continue"`) `disabled` gdy `count < 2`,
  z komunikatem `role="status"` „Add at least 2 participants to continue" (US-005: próba pominięcia = komunikat);
  klik → `window.location.assign("/")`.
- Typy: `OnboardingStep` z serwisu (`"api-key" | "participants"` po odfiltrowaniu `complete` w stronie).
- Propsy: `step: Exclude<OnboardingStep, "complete">`.

## 5. Typy

Bez nowych DTO. `OnboardingStep`, `OnboardingStatus` z `src/lib/services/onboarding.service.ts`.

## 6. Zarządzanie stanem

Tylko `count` (liczba uczestników z panelu) w wyspie kroku 2. Reszta w komponentach z widoku 01.

## 7. Integracja API

Pośrednio przez `ApiKeyForm` i `ParticipantsPanel` (widok 01). Strona: serwis server-side (bez HTTP).

## 8. Interakcje użytkownika

1. Nowe konto → `/` → `302 /onboarding` → krok 1.
2. Zapis klucza (walidacja; błąd → dialog, klucz niezapisany) → sukces → przeładowanie → krok 2.
3. Dodanie dwóch uczestników → „Continue" aktywny → `/` (lista).
4. Przerwanie po kroku 1 i ponowne logowanie → `/` → `302 /onboarding` → od razu krok 2 (US-006).
5. Wejście na `/onboarding` z kompletnym setupem → `302 /`.

## 9. Warunki i walidacja

Jak w widoku 01; dodatkowo „Continue" wymaga `count ≥ 2` (lustro reguły API: `POST /api/conversations` odrzuca
< 2 uczestników `400`).

## 10. Obsługa błędów

Jak w widoku 01. Błąd statusu w frontmatterze → `503` (log `console.error` z `route`, `status`).

## 11. Kroki implementacji

1. `OnboardingView.tsx` z dwoma krokami i wskaźnikiem.
2. `onboarding.astro` (status → krok → redirect / render).
3. Bramka w `index.astro` (`step !== "complete"` → `302 /onboarding`).
4. Weryfikacja: świeże konto przez `/register` → krok 1 → krok 2 → lista; konto z kluczem i 1 uczestnikiem → krok 2;
   `curl` na `/` i `/onboarding` dla obu stanów (302 vs 200).
