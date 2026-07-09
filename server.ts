import express from "express";
import cors from "cors";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = 3000;

// Enable CORS and parse JSON request bodies up to 10MB (necessary for base64 images)
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Initialize Supabase Client safely
const supabaseUrl = process.env.SUPABASE_URL || "https://nhqambvmghlhzjtdvljz.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY || "sb_publishable_Y6F5nGyspeypmyQbanrUEA_r2N2s6PC";

let supabase: any = null;
try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
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
    
    try {
      // Parse the JSON string to ensure it's valid JSON before sending
      const parsed = JSON.parse(resultText);
      return res.json({ success: true, data: parsed, modelUsed: selectedModel });
    } catch (parseError) {
      // If parsing failed, attempt a clean-up of potential markdown formatting and parse again
      const cleaned = resultText
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      
      const parsedCleaned = JSON.parse(cleaned);
      return res.json({ success: true, data: parsedCleaned, modelUsed: selectedModel });
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

    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error("Supabase insert error:", error);
    return res.status(500).json({ 
      error: error.message || "Błąd dodawania rekordu. Upewnij się, że nie naruszasz reguł RLS w Supabase." 
    });
  }
});

// Serve static assets from the current directory
app.use(express.static(process.cwd()));

// SPA fallback: serve index.html for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// Start the server on port 3000
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
