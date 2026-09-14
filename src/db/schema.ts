import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  mime: text("mime").notNull().default("image/png"),
  size: integer("size").notNull().default(0),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  image: text("image").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
