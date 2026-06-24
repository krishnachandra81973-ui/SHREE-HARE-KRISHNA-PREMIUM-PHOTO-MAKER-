import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser to handle large base64 images
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Initialize GenAI on the server side
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Route for background removal
  app.post("/api/remove-background", async (req, res) => {
    try {
      const { image, bgColor } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image in request." });
      }

      const base64Data = image.split(',')[1] || image;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/png",
              },
            },
            {
              text: `Remove the background of this person and replace it with a solid plain ${bgColor || "white"} background suitable for a professional passport photo. Return only the edited image.`,
            },
          ],
        },
      });

      let imageUrl = null;
      const candidates = response.candidates || [];
      const parts = candidates[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        res.json({ imageUrl });
      } else {
        throw new Error("Failed to process image through Gemini.");
      }
    } catch (error: any) {
      console.error("Gemini serve-side error:", error);
      res.status(500).json({ error: error.message || "Background removal failed." });
    }
  });

  // API Route for AI Background Inspection
  app.post("/api/inspect-background", async (req, res) => {
    try {
      const { originalImage, processedImage } = req.body;
      if (!originalImage || !processedImage) {
        return res.status(400).json({ error: "Missing original or processed image in request." });
      }

      const origBase64 = originalImage.split(',')[1] || originalImage;
      const procBase64 = processedImage.split(',')[1] || processedImage;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: origBase64,
                mimeType: "image/png",
              },
            },
            {
              inlineData: {
                data: procBase64,
                mimeType: "image/png",
              },
            },
            {
              text: `You are an expert passport photo quality inspector.
Compare these two images: Image 1 (original photo) and Image 2 (background-removed cutout photo).
Verify if the background has been completely and correctly removed in Image 2.

Check specifically for:
1. Leftover background pixels (e.g. gray, blue, white, or original background patches around hair, ears, shoulders, under the collar, or between arms).
2. Over-cropping (accidental deletion of the ears, head hair, shoulders, or clothing).
3. Jagged/unnatural edges on the subject.

Respond STRICTLY in JSON format with the following fields:
{
  "status": "perfect" | "messy_edges" | "leftover_spots" | "over_cropped",
  "score": <number from 0 to 100 where 100 is completely flawless background removal>,
  "hasIssues": <boolean>,
  "issuesHindi": <string describing issues in simple Hindi/Hinglish (e.g., "Kandhe ke paas background thoda reh gaya hai")>,
  "issuesEnglish": <string describing issues in simple English>,
  "recommendation": <"perfect" | "increase_tolerance" | "decrease_tolerance" | "manual_erase" | "manual_restore">,
  "recommendationDetails": <string in Hindi explaining what the user should do next to fix it, e.g., "Manual Touch-Up button dabakar Eraser tool se bacha hua background saaf karein.">
}`
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
        }
      });

      const resultText = response.text;
      if (resultText) {
        res.json(JSON.parse(resultText));
      } else {
        throw new Error("No response from Gemini inspection.");
      }
    } catch (error: any) {
      console.error("Gemini inspect error:", error);
      res.status(500).json({ error: error.message || "Inspection failed." });
    }
  });

  // API Route for image enhancement
  app.post("/api/enhance-photo", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image in request." });
      }

      const base64Data = image.split(',')[1] || image;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/png",
              },
            },
            {
              text: "Enhance the quality of this portrait photo. Improve sharpness, lighting, and color balance for a professional look. Return only the enhanced image.",
            },
          ],
        },
      });

      let imageUrl = null;
      const candidates = response.candidates || [];
      const parts = candidates[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        res.json({ imageUrl });
      } else {
        throw new Error("Failed to enhance image through Gemini.");
      }
    } catch (error: any) {
      console.error("Gemini enhance error:", error);
      res.status(500).json({ error: error.message || "Enhancement failed." });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
