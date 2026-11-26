import { describe, expect, it } from "vitest";
import { analyticsRewrites, plausibleScript } from "./analytics";

describe("plausibleScript", () => {
  it("accepteert een site-eigen scriptnaam", () => {
    expect(plausibleScript("pa-AbC123xyz.js")).toBe("pa-AbC123xyz.js");
  });

  it.each(["", "   ", "script.js", "https://evil.test/x.js", "pa-../../x.js", "pa-ab.js?x=1"])(
    "zet analytics uit bij %j",
    (waarde) => {
      expect(plausibleScript(waarde)).toBeNull();
    },
  );
});

describe("analyticsRewrites", () => {
  it("geeft niets als analytics uit staat", () => {
    expect(analyticsRewrites(null)).toEqual([]);
  });

  it("proxyt script en events via het eigen domein naar plausible.io", () => {
    expect(analyticsRewrites("pa-AbC123xyz.js")).toEqual([
      { source: "/stats/script.js", destination: "https://plausible.io/js/pa-AbC123xyz.js" },
      { source: "/stats/event", destination: "https://plausible.io/api/event" },
    ]);
  });
});
