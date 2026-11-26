import { z } from "zod";

export const leadInputSchema = z.object({
  contactName: z.string().min(1, "Naam is verplicht").max(200),
  contactEmail: z.string().email("Ongeldig e-mailadres").max(320),
  contactPhone: z.string().max(20).optional(),
  projectDescription: z.string().max(5000).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;
