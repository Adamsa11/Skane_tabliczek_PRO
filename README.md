# Skaner Tabliczek Znamionowych i Ekranów (Saw-Trak AI OCR)

Nowoczesna aplikacja webowa do automatycznego odczytu parametrów technicznych z tabliczek znamionowych oraz wyświetlaczy wózków widłowych i paleciaków przy użyciu sztucznej inteligencji **Google Gemini AI**, zintegrowana z bazą danych **Supabase** oraz rejestrem wykonanych operacji.

---

## 🚀 Szybki Start (Uruchomienie Lokalne)

### Wymagania:
- **Node.js** (wersja 18 lub nowsza)
- Menedżer pakietów **npm**

### Krok 1: Instalacja zależności
```bash
npm install
```

### Krok 2: Konfiguracja zmiennych środowiskowych (.env)
Utwórz plik `.env` w głównym katalogu projektu:
```env
# Klucz API Google Gemini (pobierz bezpłatnie z https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=twoj_klucz_gemini_tutaj

# Supabase (domyślnie skonfigurowane)
SUPABASE_URL=https://nhqambvmghlhzjtdvljz.supabase.co
SUPABASE_KEY=twoj_klucz_supabase_tutaj
PORT=3000
```

### Krok 3: Uruchomienie aplikacji

#### W trybie deweloperskim:
```bash
npm run dev
```

#### W trybie produkcyjnym:
```bash
npm start
```

Aplikacja będzie dostępna w przeglądarce pod adresem:
👉 **`http://localhost:3000`**

---

## 🌐 Uruchomienie na GitHub Pages (Hosting Statyczny)

Aplikacja posiada wbudowany **tryb bezserwerowy (Static Mode)** oraz dodany plik `.nojekyll` i automatyczny workflow GitHub Actions, co zapobiega zawieszaniu się procesu budowania Jekyll na GitHub Pages:

### Opcja 1: Automatyczny deploy przez GitHub Actions (Zalecane)
1. W repozytorium na GitHub przejdź do zakładki **Settings** -> **Pages**.
2. W sekcji **Build and deployment** w polu **Source** wybierz: **GitHub Actions**.
3. Wejdź w zakładkę **Actions** u góry i zobaczysz, jak proces *Deploy to GitHub Pages* kończy się sukcesem w kilkanaście sekund.
4. Twoja strona będzie dostępna pod adresem: `https://twoj-login.github.io/nazwa-repozytorium/`.

### Opcja 2: Klasyczny Deploy z gałęzi (Deploy from a branch)
1. W repozytorium na GitHub przejdź do zakładki **Settings** -> **Pages**.
2. W sekcji **Build and deployment** w polu **Source** wybierz: **Deploy from a branch**.
3. Wybierz gałąź **main** (lub **master**) oraz folder `/ (root)` i kliknij **Save**.
4. Dzięki dodanemu do repozytorium plikowi `.nojekyll` GitHub nie zawiesi się na przetwarzaniu Jekyll.

### Pierwsze uruchomienie na GitHub Pages:
1. Otwórz wdrożoną stronę w przeglądarce.
2. Kliknij ikonkę **Ustawień ⚙️** w prawym górnym rogu.
3. Wklej swój bezpłatny klucz API Google Gemini (pobierz go z [Google AI Studio](https://aistudio.google.com/app/apikey)).
4. Kliknij **Zapisz ustawienia**. Aplikacja będzie od razu gotowa do pracy i połączona z bazą Supabase!

---

## ☁️ Wdrożenie w chmurze (Render, Railway, Vercel, Cloud Run)

Projekt jest w pełni kompatybilny ze wszystkimi platformami chmurowymi wspierającymi Node.js:

- **Komenda budowania (Build Command):** `npm run build`
- **Komenda startowa (Start Command):** `npm start`
- **Port:** Zmienna środowiskowa `PORT` jest automatycznie wykrywana.

---

## 🛠️ Funkcjonalności

- 📸 **AI OCR Tabliczek Znamionowych:** Automatyczne rozpoznawanie numeru seryjnego, modelu, udźwigu, roku produkcji, napięcia, masy własnej i innych parametrów (modele: Gemini 3.5 Flash, Gemini 3.1 Pro, Gemini 3.1 Flash-Lite).
- 🖥️ **AI OCR Ekranów / Wyświetlaczy:** Odczyt motogodzin, kodów błędów, poziomu naładowania baterii, trybów pracy itp.
- 🔍 **Inteligentny Katalog Bazy Wózków:** Wyszukiwanie pełnotekstowe po dowolnych fragmentach słów i kodów w bazie Supabase.
- 📋 **Rejestr Wykonanych Operacji:** Zapisywanie historii analiz wraz z podglądem zdjęć w wysokiej rozdzielczości, klientem, tematem i notatkami.
- 🌓 **Tryb Ciemny / Jasny:** Intuicyjny interfejs dostosowany do pracy w trudnych warunkach warsztatowych i magazynowych.
