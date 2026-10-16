# Plan wdrożenia: Bezpośrednia edycja parametrów tabliczki w oknie „Nowy wpis”

Na podstawie zgłoszenia, że w podglądzie nie widać przycisków „Edytuj” ani pól do edycji, wdrażamy rozwiązanie eliminujące konieczność wchodzenia w osobny tryb edycji. Parametry będą od razu interaktywnymi polami formularza (`<input>`), widocznymi na samej górze ekranu.

---

## 1. Bezpośrednie pola edycji (zawsze aktywne inputy)
- **Koniec z ukrytymi trybami**: Zamiast statycznego tekstu wymagającego klikania „Edytuj”, każdy parametr tabliczki (Model, Numer seryjny, Rok produkcji, Udźwig itp.) będzie **od razu interaktywnym polem tekstowym (`<input>`)**.
- **Natychmiastowa edycja**: Użytkownik może od razu kliknąć w pole i wpisać lub poprawić dowolną wartość.
- **Dodawanie i usuwanie**: Każdy wiersz otrzyma przycisk usuwania (ikona kosza), a pod tabelą znajdzie się wyraźny przycisk **„+ Dodaj kolejny parametr”**.

---

## 2. Wyeksponowane przyciski akcji
- **Przycisk „Zapisz parametry”**: Duży, wyróżniony zielony przycisk ze statusem zapisu w nagłówku i na dole tabeli.
- **Przycisk „Załaduj dane testowe / Demo”**: Umożliwiający natychmiastowe wypełnienie pól przykładowymi danymi jednym kliknięciem, aby od razu zobaczyć działanie w podglądzie.
- **Przycisk „Wyczyść”**: Szybkie wyzerowanie pól do szablonu.

---

## 3. Przeorganizowanie układu (Gwarancja widoczności w podglądzie)
- **Problem dotychczasowy**: Sekcja odczytanych parametrów znajdowała się w trzeciej kolumnie lub po 5 innych kartach, przez co w oknie podglądu AI Studio (zwykle o szerokości 400–700 px) była zepchnięta daleko w dół (poniżej 1500 px przewijania).
- **Rozwiązanie**:
  - Przeniesienie karty **„Odczytane parametry tabliczki”** bezpośrednio obok karty „Wprowadź zdjęcie tabliczki” w dedykowany, przejrzysty blok.
  - Na ekranach podglądu tabela parametrów z polami do wpisywania będzie widoczna od razu na pierwszym ekranie bez konieczności długiego przewijania.

---

## 4. Działanie z AI i bazą danych Saw-Trak
- **Automatyczne uzupełnianie**: Gdy użytkownik wgra zdjęcie i uruchomi analizę AI, wykryte wartości automatycznie wpiszą się do pól tekstowych.
- **Korekta ręczna**: Użytkownik może w każdej chwili poprawić literówkę w modelu lub numerze seryjnym.
- **Automatyczne dopasowanie**: Zmiana numeru seryjnego i kliknięcie „Zapisz” natychmiast wyszukuje wózek w bazie katalogowej Saw-Trak.
- **Identyczna obsługa dla ekranu**: Te same bezpośrednie pola edycji i przycisk zapisu dla motogodzin i kodów błędów.

---

## Weryfikacja i testy
1. Sprawdzenie kompilacji i poprawności składni (`compile_applet`, `lint_applet`).
2. Weryfikacja widoczności pól tekstowych i przycisków w oknie podglądu bez wgrywania pliku oraz po wgraniu zdjęcia.
3. Test zapisu i powiązania z bazą wózków.
