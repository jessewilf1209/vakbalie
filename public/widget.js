/**
 * Offerte-agent widget-loader.
 *
 * Gebruik op de site van de klant (één regel):
 *   <script src="https://<onze-app>/widget.js" data-tenant-key="wk_..." async></script>
 *
 * Veiligheidsmodel:
 * - De chat draait volledig in een iframe op ÓNZE origin; de gastsite kan
 *   niet bij het DOM van het gesprek (persoonsgegevens).
 * - postMessage uitsluitend met expliciete origin-check, alleen voor
 *   open/dicht — nooit gespreksinhoud.
 * - Dit script heeft geen dependencies en raakt alleen zijn eigen elementen.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || window.__offerteAgentGeladen) return;
  window.__offerteAgentGeladen = true;

  var tenantKey = script.getAttribute("data-tenant-key") || "";
  if (!/^wk_[A-Za-z0-9_-]{16,64}$/.test(tenantKey)) {
    console.warn("[offerte-agent] data-tenant-key ontbreekt of is ongeldig.");
    return;
  }

  var appOrigin;
  try {
    appOrigin = new URL(script.src).origin;
  } catch {
    return;
  }

  // Onderdruk de zwevende knop als er een inline-embed op de pagina staat:
  // de chat staat er dan al, een tweede knop zou dubbel zijn. De
  // klant kan beide forceren met data-force-bubble.
  if (
    script.getAttribute("data-force-bubble") === null &&
    (window.__offerteAgentInlineAanwezig || document.querySelector("[data-offerte-agent-embed]"))
  ) {
    return;
  }

  // Optionele knopkleur via data-color (hex); valt terug op de default.
  var kleur = script.getAttribute("data-color") || "";
  if (!/^#[0-9a-fA-F]{6}$/.test(kleur)) kleur = "#1f6f43";

  var open = false;
  var iframeGeladen = false;

  // Container voor het chatvenster (iframe), standaard verborgen.
  var container = document.createElement("div");
  container.setAttribute("data-offerte-agent", "venster");
  container.style.cssText =
    "position:fixed;z-index:2147483646;bottom:90px;right:20px;" +
    "width:380px;height:600px;max-width:calc(100vw - 24px);" +
    "max-height:calc(100vh - 110px);display:none;border:0;" +
    "border-radius:16px;overflow:hidden;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.22);background:#fff;";

  var iframe = document.createElement("iframe");
  iframe.title = "Offerte-assistent";
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
  iframe.setAttribute("allow", "clipboard-write");
  container.appendChild(iframe);

  // Openknop (eigen element van de loader, bewust simpel en zelfstandig).
  var knop = document.createElement("button");
  knop.type = "button";
  knop.setAttribute("data-offerte-agent", "knop");
  knop.setAttribute("aria-label", "Open de offerte-assistent");
  knop.setAttribute("aria-expanded", "false");
  knop.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.6A.5.5 0 0 1 4 19.2V5.5Z" fill="currentColor"/></svg>';
  knop.style.cssText =
    "position:fixed;z-index:2147483647;bottom:20px;right:20px;" +
    "width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;" +
    "background:" +
    kleur +
    ";color:#fff;display:flex;align-items:center;" +
    "justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.25);" +
    "transition:transform .15s ease;";
  knop.onmouseenter = function () {
    knop.style.transform = "scale(1.06)";
  };
  knop.onmouseleave = function () {
    knop.style.transform = "scale(1)";
  };

  function zetOpen(nieuw) {
    open = nieuw;
    if (open && !iframeGeladen) {
      // Lazy: pas laden bij eerste keer openen — geen kosten/requests vooraf.
      iframe.src = appOrigin + "/widget/" + encodeURIComponent(tenantKey);
      iframeGeladen = true;
    }
    container.style.display = open ? "block" : "none";
    knop.setAttribute("aria-expanded", String(open));
    knop.setAttribute(
      "aria-label",
      open ? "Sluit de offerte-assistent" : "Open de offerte-assistent",
    );
  }

  knop.addEventListener("click", function () {
    zetOpen(!open);
  });

  // Alleen berichten van onze eigen app-origin accepteren.
  window.addEventListener("message", function (event) {
    if (event.origin !== appOrigin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "offerte-agent:sluit") zetOpen(false);
  });

  document.body.appendChild(container);
  document.body.appendChild(knop);
})();
