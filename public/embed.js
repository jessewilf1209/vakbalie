/**
 * Offerte-agent inline-embed loader.
 *
 * Gebruik op de plek waar het oude offerteformulier stond:
 *   <div data-offerte-agent-embed data-tenant-key="wk_...">
 *     <!-- statische fallback die zonder JavaScript werkt -->
 *     <p>Liever direct contact? Mail ons op <a href="mailto:...">...</a>.</p>
 *   </div>
 *   <script src="https://<onze-app>/embed.js" async></script>
 *
 * Veiligheidsmodel (gelijk aan de bubble-loader):
 * - De chat draait volledig in een iframe op ÓNZE origin; de gastsite kan
 *   niet bij het DOM van het gesprek (persoonsgegevens).
 * - Welke sites ons iframe mogen insluiten is per tenant vastgelegd via de
 *   frame-ancestors-CSP (allowed_origins) — niet door dit script.
 * - Dit script injecteert nooit host-HTML; het zet alleen vaste attributen en
 *   een gevalideerde tenant-key/hoogte. Geen attribuutwaarde wordt als HTML
 *   uitgevoerd (geen innerHTML met klantdata).
 *
 * Progressive enhancement: de statische fallback in de container blijft staan
 * voor bezoekers zonder JavaScript; pas wanneer dit script draait wordt hij
 * vervangen door het chat-iframe.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var appOrigin;
  try {
    appOrigin = new URL(script.src).origin;
  } catch {
    return;
  }

  var KEY_PATTERN = /^wk_[A-Za-z0-9_-]{16,64}$/;
  var HOOGTE_MIN = 360;
  var HOOGTE_MAX = 1200;
  var HOOGTE_DEFAULT = 640;

  function clampHoogte(attr) {
    var n = parseInt(attr || "", 10);
    if (!(n >= HOOGTE_MIN && n <= HOOGTE_MAX)) return HOOGTE_DEFAULT;
    return n;
  }

  function mount(container) {
    // Idempotent: een al-gemounte container niet nog eens vullen.
    if (container.getAttribute("data-offerte-agent-embed") === "gemount") return;

    var tenantKey = container.getAttribute("data-tenant-key") || "";
    if (!KEY_PATTERN.test(tenantKey)) {
      console.warn("[offerte-agent] embed: data-tenant-key ontbreekt of is ongeldig.");
      return;
    }

    var hoogte = clampHoogte(container.getAttribute("data-height"));

    var iframe = document.createElement("iframe");
    iframe.src = appOrigin + "/widget/" + encodeURIComponent(tenantKey) + "?mode=embed";
    iframe.title = "Offerte-assistent";
    iframe.setAttribute("allow", "clipboard-write");
    iframe.style.cssText =
      "width:100%;max-width:100%;height:" +
      hoogte +
      "px;border:0;display:block;border-radius:16px;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.10);background:#fff;";

    // Statische fallback vervangen door het iframe (textContent wist veilig,
    // geen HTML-parsing van bestaande inhoud).
    container.textContent = "";
    container.appendChild(iframe);
    container.setAttribute("data-offerte-agent-embed", "gemount");
  }

  function init() {
    var containers = document.querySelectorAll("[data-offerte-agent-embed]");
    for (var i = 0; i < containers.length; i++) mount(containers[i]);
    // Signaal voor de bubble-loader om de zwevende knop te onderdrukken.
    if (containers.length > 0) window.__offerteAgentInlineAanwezig = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
