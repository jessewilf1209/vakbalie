import { describe, it, expect } from "vitest";
import { leadInputSchema } from "./validation";

describe("leadInputSchema", () => {
  it("accepts valid input", () => {
    const result = leadInputSchema.safeParse({
      contactName: "Jan Jansen",
      contactEmail: "jan@example.com",
      projectDescription: "Grasmaaien en snoeien",
    });
    expect(result.success).toBe(true);
  });

  it("accepts input without optional fields", () => {
    const result = leadInputSchema.safeParse({
      contactName: "Jan Jansen",
      contactEmail: "jan@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = leadInputSchema.safeParse({
      contactName: "Jan",
      contactEmail: "geen-geldig-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("contactEmail");
    }
  });

  it("rejects empty name", () => {
    const result = leadInputSchema.safeParse({
      contactName: "",
      contactEmail: "jan@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding max length", () => {
    const result = leadInputSchema.safeParse({
      contactName: "A".repeat(201),
      contactEmail: "jan@example.com",
    });
    expect(result.success).toBe(false);
  });
});
