# Plany implementacji widoków

Plany per widok wg struktury promptu UI-4 (przegląd, routing, komponenty, typy, stan, integracja API, interakcje,
walidacja, błędy, kroki), pisane **tuż przed** implementacją danego widoku (decyzja 2026-09-12).
Nadrzędne: `ap7-ui-plan-pl.md` (architektura, mapa tras, macierz błędów), PRD (ap2), plan API (ap5), reguła
`.claude/rules/frontend.md`. Źródłem prawdy po implementacji jest kod; plany zostają jako zapis intencji
(jak `impl-plans-API/`).

| #   | Widok                      | Trasa                                      | Plik                                     | Stan                            |
| --- | -------------------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------- |
| 01  | Ustawienia                 | `/settings`                                | `view-implplan-01_settings.md`           | zrobione (app 6b686f5, 483e07b) |
| 02  | Onboarding                 | `/onboarding`                              | `view-implplan-02_onboarding.md`         | zrobione (app: onboarding)      |
| 03  | Lista konwersacji          | `/`                                        | `view-implplan-03_conversations-list.md` | zrobione (app a9428ce)          |
| 04  | Czat (szkic i konwersacja) | `/conversations/new`, `/conversations/:id` | `view-implplan-04_chat.md`               | zrobione (app f0f2eff)          |

Fundament wspólny (klient HTTP, formatery, kolor, serwis statusu onboardingu, komponenty shadcn, dialogi) opisany
w ap7 §5.1 i wdrażany przed widokiem 01.
