import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email"),
  password: text("password").notNull(),
  lastActive: timestamp("last_active").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  chatId: true,
  role: true,
  content: true,
  fileUrl: true,
  fileName: true,
  fileType: true,
  fileSize: true,
});

export const chats = pgTable("chats", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActive: timestamp("last_active").defaultNow().notNull(),
});

export const insertChatSchema = createInsertSchema(chats).pick({
  id: true,
  title: true,
  userId: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect & {
  file?: {
    url: string;
    name: string;
    type: string;
    size: number;
  };
};

export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;

// Схема для статистики использования
export const statsSchema = z.object({
  totalUsers: z.number(),
  totalChats: z.number(),
  totalMessages: z.number(),
  activeUsersLast24h: z.number(),
  activeChatsLast24h: z.number(),
  messagesPerDay: z.array(z.object({
    date: z.string(),
    count: z.number()
  })),
  topChats: z.array(z.object({
    chatId: z.string(),
    title: z.string(),
    messageCount: z.number()
  }))
});

export type Stats = z.infer<typeof statsSchema>;

// Схема для настроек
export const settingsSchema = z.object({
  webhook: z.object({
    url: z.string().url(),
    enabled: z.boolean(),
  }),
  integration: z.object({
    iframe: z.object({
      enabled: z.boolean(),
      theme: z.enum(["light", "dark", "transparent"]),
    }),
    widget: z.object({
      enabled: z.boolean(),
      position: z.enum(["left", "right"]),
      theme: z.enum(["light", "dark"]),
      fontSize: z.number().optional().default(16),
      width: z.number().optional().default(640),
      height: z.number().optional().default(480),
      text: z.string().optional().default("Есть вопросы? пишите!"),
      buttonColor: z.string().optional().default("#4b6cf7"),
      pulsation: z.boolean().optional().default(true),
    }),
  }),
  ui: z.object({
    enabled: z.boolean(),
    colorSchemeEnabled: z.boolean().default(false), // Цветовая схема выключена по умолчанию
    colors: z.object({
      primary: z.string(),
      secondary: z.string(),
      accent: z.string(),
    }),
    elements: z.object({
      roundedCorners: z.boolean(),
      shadows: z.boolean(),
      animations: z.boolean(),
    }),
    typography: z.object({
      desktop: z.object({
        fontSize: z.number().optional(),
        fontFamily: z.string().optional(),
        spacing: z.number().optional(),
      }).optional(),
      mobile: z.object({
        fontSize: z.number().optional(),
        fontFamily: z.string().optional(),
        spacing: z.number().optional(),
      }).optional(),
    }).optional(),
    widget: z.object({
      title: z.string().optional().default('AI Ассистент'),
      backgroundColor: z.string().optional().default('#1e1e1e'),
      headerColor: z.string().optional().default('#272727'),
      textColor: z.string().optional().default('#ffffff'),
      buttonColor: z.string().optional().default('#19c37d'),
      pulsation: z.boolean().optional().default(false),
    }).optional(),
  }),
  database: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(["local", "supabase"]).default("local"),
    supabase: z.object({
      tables: z.object({
        messages: z.string().optional().default("messages"),
        chats: z.string().optional().default("chats"),
        users: z.string().optional().default("users"),
        files: z.string().optional().default("files"),
      }),
      schema: z.string().optional().default("public"),
      autoMigrate: z.boolean().default(true),
    }),
  }).optional().default({
    enabled: false,
    type: "local",
    supabase: {
      tables: {
        messages: "messages",
        chats: "chats",
        users: "users",
        files: "files",
      },
      schema: "public",
      autoMigrate: true,
    }
  }),
});

export type Settings = z.infer<typeof settingsSchema>;
