import { Router, type IRouter } from "express";
import { getConnectors } from "../lib/connectors";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

function truncate(str: string, len: number): string {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

// GET /api/focus-feed
router.get("/focus-feed", async (req, res): Promise<void> => {
  const limit = parseInt(String(req.query["limit"] ?? "50"), 10);
  const connectors = getConnectors();
  const items: unknown[] = [];

  // Gmail messages
  try {
    const gmailRes = await connectors.proxy("google-mail", `/gmail/v1/users/me/messages?maxResults=15&q=in:inbox`, { method: "GET" });
    const gmailData = await gmailRes.json() as Record<string, unknown>;
    const messages = (gmailData["messages"] as Record<string, unknown>[]) ?? [];

    await Promise.all(
      messages.slice(0, 10).map(async (m: Record<string, unknown>) => {
        try {
          const msgRes = await connectors.proxy("google-mail", `/gmail/v1/users/me/messages/${m["id"]}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { method: "GET" });
          const msg = await msgRes.json() as Record<string, unknown>;
          const headers = (msg["payload"] as Record<string, unknown>)?.["headers"] as Record<string, string>[] ?? [];
          const subject = headers.find((h) => h["name"] === "Subject")?.["value"] ?? "(no subject)";
          const from = headers.find((h) => h["name"] === "From")?.["value"] ?? "unknown";
          const labelIds = (msg["labelIds"] as string[]) ?? [];

          items.push({
            id: `gmail:${m["id"]}`,
            source: "gmail",
            subject: truncate(subject, 80),
            sender: truncate(from, 60),
            preview: truncate(String(msg["snippet"] ?? ""), 120),
            receivedAt: new Date(parseInt(String(msg["internalDate"]), 10)).toISOString(),
            urgencyScore: labelIds.includes("IMPORTANT") ? 75 : 30,
            isRead: !labelIds.includes("UNREAD"),
            labels: labelIds.filter((l) => !["INBOX", "UNREAD"].includes(l)),
            dealId: null,
          });
        } catch (_err) {
          // skip individual message fetch failures
        }
      })
    );
  } catch (err) {
    req.log.warn({ err }, "Gmail fetch failed");
  }

  // Outlook messages
  try {
    const outlookRes = await connectors.proxy("outlook", `/v1.0/me/mailFolders/inbox/messages?$top=10&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,importance`, { method: "GET" });
    const outlookData = await outlookRes.json() as Record<string, unknown>;
    const msgs = (outlookData["value"] as Record<string, unknown>[]) ?? [];
    for (const m of msgs) {
      items.push({
        id: `outlook:${m["id"]}`,
        source: "outlook",
        subject: truncate(String(m["subject"] ?? "(no subject)"), 80),
        sender: truncate(String(((m["from"] as Record<string, unknown>)?.["emailAddress"] as Record<string, unknown>)?.["name"] ?? "unknown"), 60),
        preview: truncate(String(m["bodyPreview"] ?? ""), 120),
        receivedAt: m["receivedDateTime"],
        urgencyScore: m["importance"] === "high" ? 80 : 25,
        isRead: m["isRead"] ?? false,
        labels: [],
        dealId: null,
      });
    }
  } catch (err) {
    req.log.warn({ err }, "Outlook fetch failed");
  }

  // HubSpot recent deal updates as feed items
  try {
    const hsRes = await connectors.proxy("hubspot", `/crm/v3/objects/deals?limit=5&properties=dealname,closedate,amount,dealstage&sorts=hs_lastmodifieddate`, { method: "GET" });
    const hsData = await hsRes.json() as Record<string, unknown>;
    const deals = (hsData["results"] as Record<string, unknown>[]) ?? [];
    for (const d of deals) {
      const props = d["properties"] as Record<string, unknown>;
      items.push({
        id: `hubspot:${d["id"]}`,
        source: "hubspot",
        subject: `Deal Update: ${props["dealname"] ?? "Unnamed Deal"}`,
        sender: "HubSpot CRM",
        preview: `Stage: ${props["dealstage"] ?? "unknown"} | Amount: $${Number(props["amount"] ?? 0).toLocaleString()}`,
        receivedAt: new Date().toISOString(),
        urgencyScore: 60,
        isRead: false,
        labels: ["crm", props["dealstage"] as string].filter(Boolean),
        dealId: String(d["id"]),
      });
    }
  } catch (err) {
    req.log.warn({ err }, "HubSpot feed fetch failed");
  }

  // Sort by urgency desc, then by date
  const sorted = (items as Record<string, unknown>[]).sort((a, b) => {
    const urgDiff = (b["urgencyScore"] as number) - (a["urgencyScore"] as number);
    if (urgDiff !== 0) return urgDiff;
    return new Date(b["receivedAt"] as string).getTime() - new Date(a["receivedAt"] as string).getTime();
  });

  res.json(sorted.slice(0, limit));
});

// POST /api/focus-feed/prioritize — re-score with Gemini
router.post("/focus-feed/prioritize", async (req, res): Promise<void> => {
  const { items } = req.body as { items: Record<string, unknown>[] };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items array is required" });
    return;
  }

  try {
    const prompt = `You are an AI assistant that prioritizes communications for a professional.
Score each item on urgency from 0-100 based on: sender importance, subject urgency keywords, and content.
Return ONLY a JSON array of objects with fields: id (string) and urgencyScore (number 0-100).
Items:
${JSON.stringify(items.map((i) => ({ id: i["id"], subject: i["subject"], sender: i["sender"], preview: i["preview"], source: i["source"] })))}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192, responseMimeType: "application/json" },
    });

    const scores = JSON.parse(response.text ?? "[]") as { id: string; urgencyScore: number }[];
    const scoreMap = new Map(scores.map((s) => [s.id, s.urgencyScore]));

    const prioritized = items.map((item) => ({
      ...item,
      urgencyScore: scoreMap.get(item["id"] as string) ?? (item["urgencyScore"] as number),
    })).sort((a, b) => (b["urgencyScore"] as number) - (a["urgencyScore"] as number));

    res.json(prioritized);
  } catch (err) {
    req.log.error({ err }, "Gemini prioritization failed");
    res.json(items);
  }
});

// GET /api/focus-feed/hubspot/deals
router.get("/focus-feed/hubspot/deals", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  try {
    const hsRes = await connectors.proxy("hubspot", `/crm/v3/objects/deals?limit=20&properties=dealname,closedate,amount,dealstage,hubspot_owner_id`, { method: "GET" });
    const hsData = await hsRes.json() as Record<string, unknown>;
    const deals = (hsData["results"] as Record<string, unknown>[]) ?? [];
    res.json(deals.map((d) => {
      const props = d["properties"] as Record<string, unknown>;
      return {
        id: String(d["id"]),
        name: String(props["dealname"] ?? "Unnamed"),
        stage: String(props["dealstage"] ?? "unknown"),
        amount: props["amount"] ? Number(props["amount"]) : null,
        closeDate: (props["closedate"] as string) ?? null,
        ownerId: String(props["hubspot_owner_id"] ?? ""),
      };
    }));
  } catch (err) {
    req.log.error({ err }, "HubSpot deals fetch failed");
    res.json([]);
  }
});

// GET /api/focus-feed/stats
router.get("/focus-feed/stats", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  let unreadGmail = 0;
  let unreadOutlook = 0;
  let openDeals = 0;
  let dealPipelineValue = 0;
  let urgentCount = 0;

  await Promise.allSettled([
    (async () => {
      const r = await connectors.proxy("google-mail", `/gmail/v1/users/me/labels/INBOX`, { method: "GET" });
      const d = await r.json() as Record<string, unknown>;
      unreadGmail = (d["messagesUnread"] as number) ?? 0;
    })(),
    (async () => {
      const r = await connectors.proxy("outlook", `/v1.0/me/mailFolders/inbox?$select=unreadItemCount`, { method: "GET" });
      const d = await r.json() as Record<string, unknown>;
      unreadOutlook = (d["unreadItemCount"] as number) ?? 0;
    })(),
    (async () => {
      const r = await connectors.proxy("hubspot", `/crm/v3/objects/deals?limit=50&properties=amount,dealstage`, { method: "GET" });
      const d = await r.json() as Record<string, unknown>;
      const deals = (d["results"] as Record<string, unknown>[]) ?? [];
      openDeals = deals.length;
      dealPipelineValue = deals.reduce((sum, deal) => {
        const props = deal["properties"] as Record<string, unknown>;
        return sum + Number(props["amount"] ?? 0);
      }, 0);
    })(),
  ]);

  urgentCount = Math.floor(unreadGmail * 0.2 + unreadOutlook * 0.15);

  res.json({ unreadGmail, unreadOutlook, openDeals, urgentCount, dealPipelineValue });
});

export default router;
