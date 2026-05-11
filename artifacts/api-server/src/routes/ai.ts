import { Router, type IRouter } from "express";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

// POST /api/ai/summarize
router.post("/ai/summarize", async (req, res): Promise<void> => {
  const { text, context } = req.body as { text: string; context?: string | null };
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const prompt = context
      ? `Context: ${context}\n\nSummarize the following text concisely in 2-3 sentences:\n\n${text}`
      : `Summarize the following text concisely in 2-3 sentences:\n\n${text}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });

    res.json({ summary: response.text ?? "Unable to generate summary." });
  } catch (err) {
    req.log.error({ err }, "AI summarize failed");
    res.status(500).json({ error: "AI summarization failed" });
  }
});

export default router;
