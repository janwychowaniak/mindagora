# Plany implementacji endpointów — artefakty historyczne

Katalog zawiera plany implementacji 12 endpointów REST API MindAgora oraz notatkę
„Uwagi implementacyjne do planów EP.md". Plany były generowane per endpoint (Planer: GPT-5.2-XHigh, z szablonu
`sketch/making-IMPL-PLANS-api/make-PLAN-implementacji-epa-api_0szablon.md`), recenzowane w claude.ai
(wzorzec promptu: `sketch/making-IMPL-PLANS-api/0-Mamy.md`), poprawiane i wykonane.

**Status: wykonane, nieutrzymywane.** Źródłem prawdy o zachowaniu API jest kod w `MindAgora/src`
oraz `specs_ai/ap5-api-plan-pl.md` (zbackportowany 2026-09-09). Plany dokumentują proces i uzasadnienia
decyzji z chwili ich podejmowania — czytać jako zapis historyczny, nie jako specyfikację.

## Znane rozjazdy planów z kodem (świadomie nienaprawiane)

- `ep-implplan-311_PUT_conversations_id.md` (l.119) rozstrzyga etykietę błędów Zod-body na „Bad Request";
  kod i ap5 §5.3 używają „Validation error".
- `ep-implplan-106_DELETE_ai-participants_id.md` (l.264) zaleca edycję istniejącej migracji („migracje jeszcze
  nie uruchomione") — tak zrobiono; w już zmigrowanej bazie indeks nie istniał aż do resetu 2026-09-09.
- Plany cytują ścieżki `.ai/` (dziś `specs_ai/`), `.sketch/` (dziś `sketch/`) i `.sketch/impl-planing/`
  (dziś `sketch/making-IMPL-PLANS-api/`).
- Plany 207/208 zakładają `401` dla braku klucza OpenRouter; od 2026-09-09 kod zwraca `412` (ap5 §2.3).
- Plan 101 istnieje w wersji V3 (użyta). Wersja V2 (Opus, stary szablon, Zod na danych z DB, auth w handlerze)
  została usunięta 2026-09-09 — dostępna w historii git.
- Punkt „rejestrowanie błędów w tabeli błędów" w każdym planie to martwy punkt starego szablonu — tabeli błędów nie ma.

## Jak czytać

Kolejność i numeracja: `sketch/endpointy_kolejność_implementacji.md`. Wspólne fundamenty (middleware,
auth service, reguła użycia Zod): `Uwagi implementacyjne do planów EP.md`.
