import { vi } from "vitest";

// `server-only` gooit buiten de React-server-omgeving een fout bij import.
// In tests draaien we server-code bewust in Node; de runtime-guard is daar
// niet relevant (de build-guard blijft gewoon actief in Next zelf).
vi.mock("server-only", () => ({}));
