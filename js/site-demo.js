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

  gateForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var targetUrl = document.getElementById("gate-url").value.trim();
    var name = document.getElementById("gate-name").value.trim();
    var email = document.getElementById("gate-email").value.trim();
    var company = document.getElementById("gate-company").value.trim();
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!targetUrl) {
      showStatus(gateStatus, "Please enter your website URL.", "error");
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
      body: JSON.stringify({ name: name, email: email, company: company || null, target_url: targetUrl }),
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
