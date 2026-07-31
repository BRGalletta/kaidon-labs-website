/* =========================================================
   Kaidon Labs — site-demo.js
   Landing-page form for /site-demo: validates and POSTs to
   /api/site-demo/create, then redirects to the preview page.
   Only runs on the site-demo landing page (early-return if the
   gate form isn't present), same convention as script.js /
   audit-chat.js.
   ========================================================= */
(function () {
  "use strict";

  var gateForm = document.getElementById("gate-form");
  if (!gateForm) return;

  var gateStatus = document.getElementById("gate-status");
  var gateSubmit = document.getElementById("gate-submit");

  function showStatus(el, message, type) {
    el.textContent = message;
    el.className = "form-status show " + type;
  }

  // Lets people type "yourbusiness.com" instead of requiring the full
  // "https://yourbusiness.com" — the field is plain text (not type="url")
  // specifically so the browser's native URL validation doesn't force a
  // scheme before this normalization ever runs.
  function normalizeUrl(input) {
    var trimmed = input.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      trimmed = "https://" + trimmed;
    }
    return trimmed;
  }

  function looksLikeAUrl(url) {
    try {
      return new URL(url).hostname.indexOf(".") !== -1;
    } catch (e) {
      return false;
    }
  }

  // Screenshot the target as this visitor's own device would see it — same
  // breakpoint site-demo.css already uses for its own mobile layout, so
  // "mobile" here means the same thing it means everywhere else in this
  // feature.
  function detectViewport() {
    return window.matchMedia && window.matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop";
  }

  gateForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var targetUrl = normalizeUrl(document.getElementById("gate-url").value);
    var name = document.getElementById("gate-name").value.trim();
    var email = document.getElementById("gate-email").value.trim();
    var company = document.getElementById("gate-company").value.trim();
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!targetUrl || !looksLikeAUrl(targetUrl)) {
      showStatus(gateStatus, "Please enter your website URL (e.g. yourbusiness.com).", "error");
      return;
    }
    if (!name || !emailPattern.test(email)) {
      showStatus(gateStatus, "Please enter your name and a valid email.", "error");
      return;
    }

    gateSubmit.disabled = true;
    gateSubmit.textContent = "Capturing your site...";
    showStatus(gateStatus, "", "");

    fetch("/api/site-demo/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        company: company || null,
        target_url: targetUrl,
        viewport: detectViewport(),
      }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
          return data;
        });
      })
      .then(function (data) {
        window.location.href = "preview/?session_id=" + encodeURIComponent(data.session_id);
      })
      .catch(function (error) {
        showStatus(gateStatus, error.message || "Something went wrong. Please try again.", "error");
        gateSubmit.disabled = false;
        gateSubmit.textContent = "Show Me My Site's AI";
      });
  });
})();
