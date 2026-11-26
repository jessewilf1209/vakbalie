import { z } from "zod";
import { TENANT_KEY_PATTERN } from "./tenant-key";

/** Body van POST /api/widget/session (Zod op elke route). */
export const sessionRequestSchema = z.object({
  tenantKey: z.string().regex(TENANT_KEY_PATTERN, "Ongeldige widget-key"),
  /** Verplicht zodra Turnstile actief is; server dwingt af. */
  turnstileToken: z.string().max(2048).optional(),
});

export type SessionRequest = z.infer<typeof sessionRequestSchema>;

/** Body van POST /api/widget/message. */
export const messageRequestSchema = z.object({
  sessionToken: z.string().min(20).max(2048),
  message: z.string().min(1).max(2000),
});

export type MessageRequest = z.infer<typeof messageRequestSchema>;

/** Body van POST /api/widget/confirm (bevestiging van de samenvatting). */
export const confirmRequestSchema = z.object({
  sessionToken: z.string().min(20).max(2048),
});
