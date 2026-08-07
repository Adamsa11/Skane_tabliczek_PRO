import express from "express";
import cors from "cors";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = 3000;

// Enable CORS and parse JSON request bodies up to 50MB (necessary for high-res base64 images)
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Supabase Client safely from environment variables or fallback defaults
const defaultSupabaseUrl = "https://nhqambvmghlhzjtdvljz.supabase.co";
const defaultSupabaseAnonKey = "sb_publishable_Y6F5nGyspeypmyQbanrUEA_r2N2s6PC";

const supabaseUrl = process.env.SUPABASE_URL || defaultSupabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || defaultSupabaseAnonKey;

let supabase: any = null;
try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`Supabase client initialized successfully for URL: ${supabaseUrl}`);
  } else {
    console.warn("Supabase credentials missing: URL or Key is empty.");
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
}

// Endpoint to provide public Supabase URL and public publishable/anon key to frontend
app.get("/api/supabase/config", (_req, res) => {
  return res.json({
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || defaultSupabaseAnonKey
  });
});

// Helper to determine if a Supabase error is due to a missing table
function checkIfTableMissing(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || "").toLowerCase();
  const msg = String(error.message || "").toLowerCase();
  return (
    code === "42p01" ||
    code.includes("42p01") ||
    msg.includes("relation") ||
    msg.includes("does not exist") ||
    msg.includes("not found") ||
    msg.includes("could not find") ||
    msg.includes("schema cache") ||
    (msg.includes("operacje") && msg.includes("find"))
  );
}

// Helper to determine if a Supabase error is due to an RLS violation
function checkIfRlsViolation(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || "").toLowerCase();
  const msg = String(error.message || "").toLowerCase();
  return (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("rls") ||
    msg.includes("violates row-level security policy")
  );
}

// Initialize the Gemini client using the environment variable GEMINI_API_KEY
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// API endpoint for analyzing the plate image
app.post("/api/analyze", async (req, res) => {
  try {
    const { mimeType, imageBase64, model, promptType } = req.body;

    if (!mimeType || !imageBase64) {
      return res.status(400).json({ error: "Missing mimeType or imageBase64 data." });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server. Please add it in Settings > Secrets.",
      });
    }

    // Select the requested model or fallback to gemini-3.5-flash
    const selectedModel = model || "gemini-3.5-flash";

    let promptText = `Odczytaj dane z tej tabliczki znamionowej wózka widłowego (lub paleciaka).
Wydobądź wszystkie widoczne parametry i zwróć je jako prosty obiekt JSON.
- Klucze JSON w języku polskim, np. 'Model', 'Numer seryjny', 'Udźwig', 'Rok produkcji', 'Masa własna'.
- Wartości dokładnie jak na tabliczce, razem z jednostkami, np. '5000 Kg', '54.6 KW', '2025-06'.
- Zwróć WYŁĄCZNIE poprawny, czysty JSON. Bez Markdown, bez bloku kodu \`\`\`json i bez dodatkowych komentarzy. Jeśli jakieś cyfry lub litery są niejasne, odczytaj je najlepiej jak potrafisz.`;

    if (promptType === 'screen') {
      promptText = `Odczytaj dane ze zdjęcia ekranu / wyświetlacza wózka widłowego (lub paleciaka).
Wydobądź wszystkie widoczne parametry, odczyty i błędy, np. Motogodziny, Kody błędów, Stan naładowania baterii, Napięcie, Prędkość, Tryb pracy, Model, Numery seryjne itp.
- Klucze JSON w języku polskim, np. 'Motogodziny', 'Kody błędów', 'Stan baterii', 'Model', 'Tryb pracy'.
- Wartości dokładnie jak na ekranie, np. '1234 h', 'E-04', '85%'.
- Zwróć WYŁĄCZNIE poprawny, czysty JSON. Bez Markdown, bez bloku kodu \`\`\`json i bez dodatkowych komentarzy. Jeśli jakieś cyfry lub litery są niejasne, odczytaj je najlepiej jak potrafisz.`;
    }

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text || "";
    
    // Robust helper to extract and parse JSON from the Gemini response
    function robustJsonParse(text: string): any {
      const trimmed = text.trim();
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        // Attempt standard cleanup of markdown blocks
        const cleaned = trimmed
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        try {
          return JSON.parse(cleaned);
        } catch (err2) {
          // Find the first '{' and last '}'
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
            try {
              return JSON.parse(jsonCandidate);
            } catch (err3) {
              // If still failing, let's try to locate matched braces
              let braceCount = 0;
              let insideString = false;
              let escape = false;
              for (let i = firstBrace; i < cleaned.length; i++) {
                const char = cleaned[i];
                if (escape) {
                  escape = false;
                  continue;
                }
                if (char === '\\') {
                  escape = true;
                  continue;
                }
                if (char === '"') {
                  insideString = !insideString;
                  continue;
                }
                if (!insideString) {
                  if (char === '{') {
                    braceCount++;
                  } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      const candidate = cleaned.substring(firstBrace, i + 1);
                      try {
                        return JSON.parse(candidate);
                      } catch (e) {}
                    }
                  }
                }
              }
            }
          }
          throw err2; // rethrow if all recovery attempts fail
        }
      }
    }

    try {
      const parsedData = robustJsonParse(resultText);
      return res.json({ success: true, data: parsedData, modelUsed: selectedModel });
    } catch (parseError: any) {
      console.error("JSON extraction failed on raw text:", resultText, parseError);
      return res.status(500).json({
        error: `Nie udało się przetworzyć odpowiedzi AI na poprawny format JSON: ${parseError.message}`,
        rawResponse: resultText
      });
    }
  } catch (error: any) {
    console.error("Gemini OCR Error:", error);
    return res.status(500).json({
      error: error.message || "Wystąpił wewnętrzny błąd podczas analizy obrazu przez AI.",
    });
  }
});

// In-memory catalog cache for fast lookup & list of all forklift records
let cachedWozkiCatalog: any[] = [];
let lastCatalogFetchTime = 0;
let isFetchingCatalog = false;

async function fetchFullWozkiCatalog(): Promise<any[]> {
  if (isFetchingCatalog) return cachedWozkiCatalog;
  isFetchingCatalog = true;

  try {
    const supabaseUrl = process.env.SUPABASE_URL || "https://nhqambvmghlhzjtdvljz.supabase.co";
    const supabaseKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_Y6F5nGyspeypmyQbanrUEA_r2N2s6PC";

    // Fetch all records in parallel chunks (0-999, 1000-1999, ... up to 12000)
    const promises: Promise<any[]>[] = [];
    for (let i = 0; i < 12; i++) {
      const from = i * 1000;
      const to = (i + 1) * 1000 - 1;
      promises.push(
        fetch(`${supabaseUrl}/rest/v1/wozki?select=*`, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Range: `${from}-${to}`
          }
        }).then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            return Array.isArray(data) ? data : [];
          }
          return [];
        }).catch((err) => {
          console.warn(`[Supabase] Chunk ${from}-${to} fetch failed:`, err.message);
          return [];
        })
      );
    }

    const pages = await Promise.all(promises);
    const all = pages.flat();

    if (all.length > 0) {
      // Deduplicate by id or Kod
      const uniqueMap = new Map();
      all.forEach((item) => {
        if (!item) return;
        const key = item.id !== undefined && item.id !== null ? String(item.id) : String(item.Kod || item.NRKATALOGOWY || "");
        if (key && !uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      cachedWozkiCatalog = Array.from(uniqueMap.values());
      lastCatalogFetchTime = Date.now();
      console.log(`[Supabase] Cached ${cachedWozkiCatalog.length} wozki records in memory.`);
    }
  } catch (err: any) {
    console.error("[Supabase] fetchFullWozkiCatalog error:", err.message);
  } finally {
    isFetchingCatalog = false;
  }

  return cachedWozkiCatalog;
}

// Initial background load on startup
fetchFullWozkiCatalog().catch(console.error);

// Helper functions for partial, diacritics-insensitive string searching
function normalizeSearchText(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanAlphanumericSearch(str: any): string {
  return normalizeSearchText(str).replace(/[^a-z0-9]/g, "");
}

function rowMatchesWozekQuery(row: any, query: string, filters?: any): boolean {
  if (!row || typeof row !== "object") return false;

  // Extract all textual contents of the row
  const rowValues = Object.values(row)
    .filter((v) => v !== null && v !== undefined)
    .map((v) => normalizeSearchText(v));
  const fullRowText = rowValues.join(" ");
  const cleanRowText = cleanAlphanumericSearch(fullRowText);

  // 1. General query search across all fields (multi-token AND partial substring matching)
  if (query && query.trim()) {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const matchesAllTokens = tokens.every((token) => {
      const normTok = normalizeSearchText(token);
      const cleanTok = cleanAlphanumericSearch(token);
      if (!normTok) return true;

      // Substring match in joined text or in any individual property
      if (fullRowText.includes(normTok)) return true;
      if (cleanTok && cleanRowText.includes(cleanTok)) return true;
      return rowValues.some((v) => v.includes(normTok));
    });

    if (!matchesAllTokens) return false;
  }

  // 2. Granular field filters
  if (filters && typeof filters === "object") {
    const matchesField = (filterVal: string, candidateKeys: string[]): boolean => {
      const fNorm = normalizeSearchText(filterVal);
      const fClean = cleanAlphanumericSearch(filterVal);
      if (!fNorm) return true;

      // Check specific candidate keys first
      for (const [key, val] of Object.entries(row)) {
        if (val === null || val === undefined) continue;
        const keyNorm = normalizeSearchText(key);
        const isCandidate = candidateKeys.some(
          (cand) => keyNorm === normalizeSearchText(cand) || keyNorm.includes(normalizeSearchText(cand))
        );
        if (isCandidate) {
          const valNorm = normalizeSearchText(val);
          const valClean = cleanAlphanumericSearch(val);
          if (valNorm.includes(fNorm) || (fClean.length > 0 && valClean.includes(fClean))) {
            return true;
          }
        }
      }

      // Fallback: if candidate key was not specifically matched, check full row text
      return fullRowText.includes(fNorm) || (fClean.length > 0 && cleanRowText.includes(fClean));
    };

    if (filters.kod && !matchesField(filters.kod, ["Kod", "kod", "KOD", "id", "ID", "NRKATALOGOWY", "nrkatalogowy"])) {
      return false;
    }
    if (filters.nrkatalogowy && !matchesField(filters.nrkatalogowy, ["NRKATALOGOWY", "nrkatalogowy", "kod", "Kod", "numer", "nr_katalogowy", "id", "ID"])) {
      return false;
    }
    if (filters.marka && !matchesField(filters.marka, ["Marka", "marka", "MARKA", "PRODUCENT", "producent", "PRODUCENT_WOZKA", "Nazwa", "nazwa"])) {
      return false;
    }
    if (filters.model && !matchesField(filters.model, ["MODEL", "model", "MODEL_WOZKA", "model_wozka", "TYP_WOZKA", "typ_wozka", "TYP", "typ", "OZNACZENIE", "Nazwa", "nazwa"])) {
      return false;
    }
    if (filters.typ_wozka && !matchesField(filters.typ_wozka, ["TYP_WOZKA", "TYP", "MODEL", "model", "marka", "Marka", "producent", "nazwa", "Nazwa", "rodzaj"])) {
      return false;
    }
    if (filters.nazwa && !matchesField(filters.nazwa, ["Nazwa", "nazwa", "NAZWA", "NAZWA_WOZKA", "Opis", "opis", "MODEL", "model"])) {
      return false;
    }
    if (filters.opis && !matchesField(filters.opis, ["Opis", "opis", "OPIS", "parametry", "silnik", "mth", "bateria", "udzwig", "rok"])) {
      return false;
    }
    if (filters.nr_fabryczny && !matchesField(filters.nr_fabryczny, ["NR_FABRYCZNY", "nr_fabryczny", "nr_seryjny", "serial", "numer_fabryczny", "NRKATALOGOWY", "Kod"])) {
      return false;
    }
    if (filters.rok_produkcji && !matchesField(filters.rok_produkcji, ["ROK_PRODUKCJI", "rok", "year", "rok_prod", "Opis", "opis"])) {
      return false;
    }
    if (filters.udzwig && !matchesField(filters.udzwig, ["UDZWIG", "udzwig", "capacity", "ladownosc", "q", "Opis", "opis", "Nazwa", "nazwa"])) {
      return false;
    }
    if (filters.napiecie && !matchesField(filters.napiecie, ["NAPIECIE", "napiecie", "BATERIA", "bateria", "voltage", "aku", "Opis", "opis"])) {
      return false;
    }
  }

  return true;
}

// 1. Endpoint for looking up forklifts by serial number, query or any field in wozki table
app.post("/api/supabase/lookup", async (req, res) => {
  try {
    const { serialNumber, searchQuery, filters } = req.body;
    const query = String(searchQuery || serialNumber || "").trim();

    // Ensure we have catalog records in memory
    if (cachedWozkiCatalog.length === 0 || Date.now() - lastCatalogFetchTime > 300000) {
      await fetchFullWozkiCatalog();
    }

    let rows = cachedWozkiCatalog;
    const hasQuery = query.length > 0;
    const hasFilters = filters && typeof filters === "object" && Object.values(filters).some((v) => String(v || "").trim().length > 0);

    // If cache has records, filter them
    let matched: any[] = [];
    if (rows.length > 0) {
      if (!hasQuery && !hasFilters) {
        matched = rows;
      } else {
        matched = rows.filter((row: any) => rowMatchesWozekQuery(row, query, filters));
      }
    }

    // If query has exact match or if cache returned few items, also query Supabase directly for redundancy
    if (supabase && (hasQuery || hasFilters)) {
      try {
        let sbQuery = supabase.from("wozki").select("*");
        if (hasQuery) {
          const encQ = query.replace(/[%,*]/g, "");
          sbQuery = sbQuery.or(`Kod.ilike.*${encQ}*,NRKATALOGOWY.ilike.*${encQ}*,MODEL.ilike.*${encQ}*,Marka.ilike.*${encQ}*,Nazwa.ilike.*${encQ}*,Opis.ilike.*${encQ}*`);
        }
        const { data: directData } = await sbQuery.limit(100);
        if (Array.isArray(directData) && directData.length > 0) {
          const existingIds = new Set(matched.map((m: any) => String(m.id !== undefined ? m.id : m.Kod)));
          directData.forEach((item: any) => {
            const idKey = String(item.id !== undefined ? item.id : item.Kod);
            if (!existingIds.has(idKey)) {
              if (rowMatchesWozekQuery(item, query, filters)) {
                matched.push(item);
                existingIds.add(idKey);
              }
            }
          });
        }
      } catch (directErr) {
        console.warn("[Supabase lookup] Direct fallback error:", directErr);
      }
    }

    return res.json({ success: true, data: matched });
  } catch (error: any) {
    console.error("Supabase lookup error:", error);
    return res.status(500).json({ error: error.message || "Błąd wyszukiwania w bazie danych." });
  }
});

// 2. Endpoint for listing all forklifts
app.get("/api/supabase/list", async (req, res) => {
  try {
    // If cache is empty or older than 5 minutes, refresh
    if (cachedWozkiCatalog.length === 0 || Date.now() - lastCatalogFetchTime > 300000) {
      await fetchFullWozkiCatalog();
    }

    return res.json({ success: true, data: cachedWozkiCatalog || [] });
  } catch (error: any) {
    console.error("Supabase list error:", error);
    return res.status(500).json({ error: error.message || "Błąd pobierania danych z bazy." });
  }
});

// 3. Endpoint for inserting/saving a new forklift
app.post("/api/supabase/insert", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client is not initialized." });
    }

    const { record } = req.body;
    if (!record || !record.NRKATALOGOWY) {
      return res.status(400).json({ error: "Dane rekordu są niekompletne (wymagany NRKATALOGOWY)." });
    }

    const { data, error } = await supabase
      .from("wozki")
      .insert([record])
      .select();

    if (error) {
      if (checkIfRlsViolation(error)) {
        return res.status(403).json({
          error: "Brak uprawnień RLS do zapisu w tabeli 'wozki' w Supabase. Uruchom dostarczony skrypt SQL w SQL Editor, aby wyłączyć lub skonfigurować reguły RLS.",
          code: "RLS_VIOLATION"
        });
      }
      throw error;
    }
    return res.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error("Supabase insert error:", error);
    if (checkIfRlsViolation(error)) {
      return res.status(403).json({
        error: "Brak uprawnień RLS do zapisu w tabeli 'wozki' w Supabase. Uruchom dostarczony skrypt SQL w SQL Editor, aby wyłączyć lub skonfigurować reguły RLS.",
        code: "RLS_VIOLATION"
      });
    }
    return res.status(500).json({ 
      error: error.message || "Błąd dodawania rekordu. Upewnij się, że nie naruszasz reguł RLS w Supabase." 
    });
  }
});

// 4. Endpoint to save operations/scans with client, topic, image and timestamp
app.post("/api/supabase/save-operation", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client is not initialized." });
    }

    const { record } = req.body;
    if (!record) {
      return res.status(400).json({ error: "Brak danych operacji." });
    }

    // Ensure created_at is saved if provided, or handled by DB
    const { data, error } = await supabase
      .from("operacje")
      .insert([record])
      .select();

    if (error) {
      if (checkIfTableMissing(error)) {
        return res.status(404).json({ 
          error: "Tabela 'operacje' nie istnieje w bazie Supabase.",
          code: "TABLE_NOT_FOUND" 
        });
      }
      if (checkIfRlsViolation(error)) {
        return res.status(403).json({
          error: "Brak uprawnień RLS do zapisu w tabeli 'operacje' w Supabase. Uruchom dostarczony skrypt SQL w SQL Editor, aby wyłączyć lub skonfigurować reguły RLS.",
          code: "RLS_VIOLATION"
        });
      }
      throw error;
    }

    return res.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error("Supabase save-operation error:", error);
    if (checkIfTableMissing(error)) {
      return res.status(404).json({ 
        error: "Tabela 'operacje' nie istnieje w bazie Supabase.",
        code: "TABLE_NOT_FOUND" 
      });
    }
    if (checkIfRlsViolation(error)) {
      return res.status(403).json({
        error: "Brak uprawnień RLS do zapisu w tabeli 'operacje' w Supabase. Uruchom dostarczony skrypt SQL w SQL Editor, aby wyłączyć lub skonfigurować reguły RLS.",
        code: "RLS_VIOLATION"
      });
    }
    return res.status(500).json({ error: error.message || "Błąd zapisu operacji." });
  }
});

// 5. Endpoint to list and filter operations
app.get("/api/supabase/list-operations", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client is not initialized." });
    }

    const { id, klient, temat, nrkatalogowy, wozek_id, opis } = req.query;
    let baseQuery = supabase.from("operacje").select("*");

    if (id) {
      const cleanId = String(id).trim();
      const parsedId = parseInt(cleanId, 10);
      if (!isNaN(parsedId) && String(parsedId) === cleanId) {
        baseQuery = baseQuery.eq("id", parsedId);
      } else {
        baseQuery = baseQuery.eq("id", cleanId);
      }
    }
    if (wozek_id) {
      const cleanWozekId = String(wozek_id).trim();
      const parsedWozekId = parseInt(cleanWozekId, 10);
      if (!isNaN(parsedWozekId) && String(parsedWozekId) === cleanWozekId) {
        baseQuery = baseQuery.eq("wozek_id", parsedWozekId);
      } else {
        baseQuery = baseQuery.eq("wozek_id", cleanWozekId);
      }
    }
    if (klient) {
      baseQuery = baseQuery.ilike("klient", `%${String(klient).trim()}%`);
    }
    if (temat) {
      baseQuery = baseQuery.ilike("temat", `%${String(temat).trim()}%`);
    }
    if (opis) {
      baseQuery = baseQuery.ilike("opis", `%${String(opis).trim()}%`);
    }
    if (nrkatalogowy) {
      baseQuery = baseQuery.ilike("nrkatalogowy", `%${String(nrkatalogowy).trim()}%`);
    }

    let data: any[] | null = null;
    let error: any = null;

    // Try ordering by created_at descending first
    try {
      const resOrdered = await baseQuery.order("created_at", { ascending: false }).limit(100);
      data = resOrdered.data;
      error = resOrdered.error;
    } catch (ordErr) {
      console.warn("Order by created_at failed, attempting unordered fetch:", ordErr);
    }

    // Fallback without created_at ordering if column does not exist
    if (error || !data) {
      try {
        let fallbackQuery = supabase.from("operacje").select("*").limit(100);
        if (id) fallbackQuery = fallbackQuery.eq("id", String(id).trim());
        if (wozek_id) fallbackQuery = fallbackQuery.eq("wozek_id", String(wozek_id).trim());
        const resUnordered = await fallbackQuery;
        if (!resUnordered.error) {
          data = resUnordered.data;
          error = null;
        }
      } catch (fbErr) {
        console.warn("Fallback unordered fetch also encountered error:", fbErr);
      }
    }

    if (error) {
      if (checkIfTableMissing(error)) {
        return res.status(404).json({ 
          error: "Tabela 'operacje' nie istnieje w bazie Supabase.",
          code: "TABLE_NOT_FOUND" 
        });
      }
      throw error;
    }

    let enrichedList = data || [];
    if (enrichedList.length > 0) {
      const wozekIds = Array.from(new Set(enrichedList.map((o: any) => o.wozek_id).filter((id: any) => id !== null && id !== undefined)));
      if (wozekIds.length > 0) {
        try {
          const { data: wozkiList } = await supabase.from("wozki").select("*").in("id", wozekIds);
          if (wozkiList && wozkiList.length > 0) {
            const wozkiMap = new Map(wozkiList.map((w: any) => [String(w.id), w]));
            enrichedList = enrichedList.map((op: any) => {
              const matchedWozek = op.wozek_id ? wozkiMap.get(String(op.wozek_id)) : null;
              return {
                ...op,
                wozek_data: matchedWozek || null
              };
            });
          }
        } catch (e) {
          console.warn("Could not enrich operations with wozki table data:", e);
        }
      }
    }

    return res.json({ success: true, data: enrichedList });
  } catch (error: any) {
    console.error("Supabase list-operations error:", error);
    if (checkIfTableMissing(error)) {
      return res.status(404).json({ 
        error: "Tabela 'operacje' nie istnieje w bazie Supabase.",
        code: "TABLE_NOT_FOUND" 
      });
    }
    return res.status(500).json({ error: error.message || "Błąd pobierania operacji z bazy." });
  }
});

// 6. Endpoint to update an operation
app.post("/api/supabase/update-operation", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client is not initialized." });
    }

    const { id, record } = req.body;
    if (!id || !record) {
      return res.status(400).json({ error: "Brak ID operacji lub danych rekordu." });
    }

    let parsedId = id;
    const cleanId = String(id).trim();
    const parsedInt = parseInt(cleanId, 10);
    if (!isNaN(parsedInt) && String(parsedInt) === cleanId) {
      parsedId = parsedInt;
    }

    const { data, error } = await supabase
      .from("operacje")
      .update(record)
      .eq("id", parsedId)
      .select();

    if (error) {
      if (checkIfRlsViolation(error)) {
        return res.status(403).json({
          error: "Brak uprawnień RLS do modyfikacji w tabeli 'operacje' w Supabase.",
          code: "RLS_VIOLATION"
        });
      }
      throw error;
    }

    return res.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error("Supabase update-operation error:", error);
    return res.status(500).json({ error: error.message || "Błąd podczas modyfikacji operacji." });
  }
});

// 7. Endpoint to delete an operation
app.post("/api/supabase/delete-operation", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client is not initialized." });
    }

    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Brak ID operacji do usunięcia." });
    }

    let parsedId = id;
    const cleanId = String(id).trim();
    const parsedInt = parseInt(cleanId, 10);
    if (!isNaN(parsedInt) && String(parsedInt) === cleanId) {
      parsedId = parsedInt;
    }

    const { data, error } = await supabase
      .from("operacje")
      .delete()
      .eq("id", parsedId)
      .select();

    if (error) {
      if (checkIfRlsViolation(error)) {
        return res.status(403).json({
          error: "Brak uprawnień RLS do usunięcia w tabeli 'operacje' w Supabase.",
          code: "RLS_VIOLATION"
        });
      }
      throw error;
    }

    // If no row was returned/affected and we used select(), check if it actually deleted anything.
    // Note: data might be empty if RLS prevents delete or if ID didn't exist.
    const deletedCount = data ? data.length : 0;
    console.log(`Deleted operation ID: ${parsedId}, count: ${deletedCount}`);

    return res.json({ success: true, data: data || [], deletedCount });
  } catch (error: any) {
    console.error("Supabase delete-operation error:", error);
    return res.status(500).json({ error: error.message || "Błąd podczas usuwania operacji." });
  }
});

// Serve static assets from the current directory
app.use(express.static(process.cwd()));

// SPA fallback: serve index.html for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// Global error handler to prevent returning HTML for API errors (e.g. PayloadTooLargeError)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global express error handled:", err);
  if (res.headersSent) {
    return next(err);
  }
  
  const status = err.status || err.statusCode || 500;
  
  // Always return JSON for API routes
  if (req.path && req.path.startsWith("/api/")) {
    return res.status(status).json({
      error: err.message || "Wystąpił nieoczekiwany błąd serwera.",
      code: err.code || "SERVER_ERROR",
      status
    });
  }
  
  next(err);
});

// Start the server on port 3000
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
