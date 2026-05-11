import { ReplitConnectors } from "@replit/connectors-sdk";

// Singleton connectors instance — do NOT cache the client, tokens expire
// Always call getConnectors() fresh for each request
export function getConnectors(): ReplitConnectors {
  return new ReplitConnectors();
}
