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

// Initialize Supabase Client safely
const supabaseUrl = process.env.SUPABASE_URL || "https://nhqambvmghlhzjtdvljz.supabase.co";

// Resolve the correct key. If SUPABASE_SERVICE_ROLE_KEY is set but is actually a publishable key,
// we prefer the provided secret key to make sure we have RLS bypass privileges.
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!supabaseKey || supabaseKey.startsWith("sb_publishable_")) {
  supabaseKey = "sb_secret_-UNQjh0T27_QdDoBl01EPg_UU8hiyeM";
}

let supabase: any = null;
try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
}

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
    const { mimeType, imageBase64, model } = req.body;

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

    const promptText = `Odczytaj dane z tej tabliczki znamionowej wózka widłowego (lub paleciaka).
Wydobądź wszystkie widoczne parametry i zwróć je jako prosty obiekt JSON.
- Klucze JSON w języku polskim, np. 'Model', 'Numer seryjny', 'Udźwig', 'Rok produkcji', 'Masa własna'.
- Wartości dokładnie jak na tabliczce, razem z jednostkami, np. '5000 Kg', '54.6 KW', '2025-06'.
- Zwróć WYŁĄCZNIE poprawny, czysty JSON. Bez Markdown, bez bloku kodu \`\`\`json i bez dodatkowych komentarzy. Jeśli jakieś cyfry lub litery są niejasne, odczytaj je najlepiej jak potrafisz.`;

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

// 1. Endpoint for looking up a forklift by serial number (NRKATALOGOWY)
app.post("/api/supabase/lookup", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client is not initialized. Please verify configuration." });
    }

    const { serialNumber } = req.body;
    if (!serialNumber) {
      return res.status(400).json({ error: "Brak numeru seryjnego do wyszukania." });
    }

    const cleanSerial = String(serialNumber).trim();

    // Try exact match on NRKATALOGOWY
    let { data, error } = await supabase
      .from("wozki")
      .select("*")
      .eq("NRKATALOGOWY", cleanSerial);

    if (error) throw error;

    // If no exact match, try case-insensitive or partial match
    if (!data || data.length === 0) {
      const partialResult = await supabase
        .from("wozki")
        .select("*")
        .ilike("NRKATALOGOWY", `%${cleanSerial}%`);
      
      if (!partialResult.error && partialResult.data && partialResult.data.length > 0) {
        data = partialResult.data;
      }
    }

    // Advanced Fallback: Fetch all rows (up to 1000) and perform in-memory normalized comparison
    // This handles discrepancies with spaces, dashes, slashes, or prefix/suffix variations (e.g. "230352R7118" vs "230352 R7118")
    if (!data || data.length === 0) {
      const allRows = await supabase
        .from("wozki")
        .select("*")
        .limit(1000);
      
      if (!allRows.error && allRows.data && allRows.data.length > 0) {
        const normSearch = cleanSerial.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normSearch) {
          const matched = allRows.data.filter((row: any) => {
            const dbSerial = String(row.NRKATALOGOWY || "").trim();
            const normDbSerial = dbSerial.toLowerCase().replace(/[^a-z0-9]/g, "");
            return normDbSerial === normSearch || normDbSerial.includes(normSearch) || normSearch.includes(normDbSerial);
          });
          
          if (matched.length > 0) {
            data = matched;
          }
        }
      }
    }

    return res.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error("Supabase lookup error:", error);
    return res.status(500).json({ error: error.message || "Błąd wyszukiwania w bazie danych." });
  }
});

// 2. Endpoint for listing recent forklifts
app.get("/api/supabase/list", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client is not initialized." });
    }

    const { data, error } = await supabase
      .from("wozki")
      .select("*")
      .order("id", { ascending: false })
      .limit(50);

    // If 'id' ordering fails (perhaps no 'id' column), fallback to standard select
    if (error) {
      const fallback = await supabase
        .from("wozki")
        .select("*")
        .limit(50);
      
      if (fallback.error) throw fallback.error;
      return res.json({ success: true, data: fallback.data || [] });
    }

    return res.json({ success: true, data: data || [] });
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

// Endpoint to return Supabase configuration (URL and key) for the static client fallback
app.get("/api/supabase/config", (req, res) => {
  return res.json({
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseKey || process.env.SUPABASE_ANON_KEY || "sb_publishable_Y6F5nGyspeypmyQbanrUEA_r2N2s6PC"
  });
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

    const { id, klient, temat, nrkatalogowy, wozek_id } = req.query;
    let query = supabase.from("operacje").select("*");

    if (id) {
      const cleanId = String(id).trim();
      const parsedId = parseInt(cleanId, 10);
      if (!isNaN(parsedId) && String(parsedId) === cleanId) {
        query = query.eq("id", parsedId);
      } else {
        // Fallback for UUIDs or textual IDs
        query = query.eq("id", cleanId);
      }
    }
    if (wozek_id) {
      const cleanWozekId = String(wozek_id).trim();
      const parsedWozekId = parseInt(cleanWozekId, 10);
      if (!isNaN(parsedWozekId) && String(parsedWozekId) === cleanWozekId) {
        query = query.eq("wozek_id", parsedWozekId);
      } else {
        query = query.eq("wozek_id", cleanWozekId);
      }
    }
    if (klient) {
      query = query.ilike("klient", `%${String(klient).trim()}%`);
    }
    if (temat) {
      query = query.ilike("temat", `%${String(temat).trim()}%`);
    }
    if (nrkatalogowy) {
      query = query.ilike("nrkatalogowy", `%${String(nrkatalogowy).trim()}%`);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(100);

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
