import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workflowRunsTable = pgTable("workflow_runs", {
  id: serial("id").primaryKey(),
  dealId: text("deal_id").notNull(),
  dealName: text("deal_name").notNull(),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  success: boolean("success").notNull().default(false),
  repoUrl: text("repo_url"),
  steps: jsonb("steps").notNull().default([]),
});

export const insertWorkflowRunSchema = createInsertSchema(workflowRunsTable).omit({ id: true });
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type WorkflowRun = typeof workflowRunsTable.$inferSelect;
