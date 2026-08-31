# 🚜 Skaner Tabliczek Znamionowych - Sawtrak AI OCR PRO

Zaawansowana aplikacja internetowa do optycznego rozpoznawania tabliczek znamionowych (OCR) wózków widłowych z wykorzystaniem modeli **Google Gemini AI**, automatycznej synchronizacji z katalogiem **Saw-Trak** oraz pełnego rejestru wykonanych operacji w chmurze **Supabase**.

---

## 🚀 Jak wdrożyć aplikację na GitHub Pages (Krok po kroku)

Po skopiowaniu plików do repozytorium na GitHubie strona **nie uruchamia się automatycznie**, dopóki nie włączysz funkcji **GitHub Pages** w ustawieniach repozytorium.

### 📋 Instrukcja włączenia w 1 minutę:

1. **Otwórz swoje repozytorium** na [GitHub.com](https://github.com).
2. Kliknij u góry zakładkę **⚙️ Settings** (Ustawienia).
3. W lewym menu w sekcji *Code and automation* kliknij **🌐 Pages**.
4. W sekcji **Build and deployment** / **Source**:
   - **Sposób 1 (Zalecany - GitHub Actions):**
     - W polu *Source* wybierz **`GitHub Actions`**.
     - Plik automatycznego wdrożenia `.github/workflows/deploy.yml` jest już w repozytorium. Wdrożenie ruszy automatycznie po każdym pushu!
   - **Sposób 2 (Klasyczny - Deploy from branch):**
     - W polu *Source* wybierz **`Deploy from a branch`**.
     - W polu *Branch* wybierz **`main`** (lub `master`), folder **`/ (root)`** i kliknij niebieski przycisk **`Save`**.
5. Przejdź do zakładki **Actions** u góry strony, aby zobaczyć proces publikacji (zajmuje ok. 30–60 sekund).
6. Gdy pojawi się zielony ptaszek ✅, Twój link do działającej aplikacji pojawi się w *Settings -> Pages*, np.:
   > 🔗 `https://twoj-login.github.io/nazwa-repozytorium/`

---

## ⚡ Jak działa aplikacja na GitHub Pages (Tryb Bezserwerowy)

GitHub Pages to darmowy hosting plików statycznych (HTML/JS/CSS). Aplikacja została specjalnie zaprojektowana tak, aby działać bezpośrednio na GitHub Pages:

1. **Automatyczne wykrywanie:** Po otwarciu na `github.io` aplikacja przełącza się w **Tryb Bezserwerowy (GitHub Pages / Klient)**.
2. **Katalog wózków i Rejestr operacji:** Łączy się bezpośrednio z bazą Supabase REST API (odczyt, zapis, filtrowanie, dodawanie zdjęć).
3. **Skanowanie AI Gemini:**
   - Wystarczy pobrać darmowy klucz API z [Google AI Studio](https://aistudio.google.com/app/apikey).
   - W aplikacji kliknij ikonę ⚙️ w prawym górnym rogu (lub wpisz klucz w banerze u góry) i kliknij **Zapisz klucz**.
   - Klucz jest bezpiecznie przechowywany w `localStorage` Twojej przeglądarki.

---

## 🖥️ Alternatywa: Wdrożenie z serwerem Node.js (Render / Railway / Vercel)

Jeśli wolisz, aby serwer Node.js (`server.ts`) działał w chmurze i sam zarządzał kluczem Gemini API (bez konieczności wpisywania klucza przez użytkowników):

1. Załóż darmowe konto na [Render.com](https://render.com) lub [Railway.app](https://railway.app).
2. Utwórz **New Web Service** i połącz swoje repozytorium GitHub.
3. Skonfiguruj:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. Dodaj zmienne środowiskowe (**Environment Variables**):
   - `GEMINI_API_KEY` = *Twój klucz Gemini API*
   - `SUPABASE_URL` = `https://nhqambvmghlhzjtdvljz.supabase.co`
   - `SUPABASE_ANON_KEY` = `sb_publishable_Y6F5nGyspeypmyQbanrUEA_r2N2s6PC`

---

## 📁 Struktura plików w repozytorium

- `index.html` – Główna aplikacja jednoplikowa (interfejs, skaner OCR, edytor, rejestr, zdjęcia, obsługa Supabase i Gemini).
- `server.ts` – Opcjonalny serwer Node.js / Express z proxy do Supabase i Gemini oraz endpointem serwowania zdjęć.
- `.github/workflows/deploy.yml` – Automatyczny workflow publikacji strony na GitHub Pages.
- `.nojekyll` – Zapewnia prawidłowe serwowanie wszystkich plików przez GitHub Pages.
- `logo-sawtrak.png` – Oficjalne logo Sawtrak.
- `Forklift.png` – Ikona aplikacji / favicon.
- `supabase_migration_full.sql` – Pełny schemat bazy danych dla Supabase.
