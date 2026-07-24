/* =========================================================
   Kaidon Labs — script.js
   Mobile nav toggle, footer year, contact form validation
   + Formspree AJAX submit with inline success/error UI.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Mobile nav toggle ---------- */
  var navToggle = document.getElementById("nav-toggle");
  var navLinks = document.getElementById("nav-links");

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      var isOpen = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close the mobile menu after a nav link is clicked
    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        if (navLinks.classList.contains("open")) {
          navLinks.classList.remove("open");
          navToggle.setAttribute("aria-expanded", "false");
        }
      });
    });
  }

  /* ---------- Footer year (computed, not hardcoded) ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Contact form: validation + Formspree AJAX submit ---------- */
  var form = document.getElementById("contact-form");
  if (!form) return;

  var submitBtn = document.getElementById("form-submit");
  var statusEl = document.getElementById("form-status");

  function setFieldError(row, hasError) {
    if (!row) return;
    row.classList.toggle("has-error", hasError);
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "form-status show " + type;
  }

  function validate() {
    var valid = true;

    var nameInput = document.getElementById("name");
    var emailInput = document.getElementById("email");
    var messageInput = document.getElementById("message");
    var consentInput = document.getElementById("consent");

    var nameRow = nameInput.closest(".form-row");
    var emailRow = emailInput.closest(".form-row");
    var messageRow = messageInput.closest(".form-row");

    var nameOk = nameInput.value.trim().length > 0;
    setFieldError(nameRow, !nameOk);
    if (!nameOk) valid = false;

    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var emailOk = emailPattern.test(emailInput.value.trim());
    setFieldError(emailRow, !emailOk);
    if (!emailOk) valid = false;

    var messageOk = messageInput.value.trim().length > 0;
    setFieldError(messageRow, !messageOk);
    if (!messageOk) valid = false;

    var consentError = document.getElementById("consent-error");
    var consentOk = consentInput.checked;
    if (consentError) consentError.style.display = consentOk ? "none" : "block";
    if (!consentOk) valid = false;

    return valid;
  }

  // Clear an individual field's error state as the user fixes it
  ["name", "email", "message"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () {
      setFieldError(el.closest(".form-row"), false);
    });
  });

  var consentCheckbox = document.getElementById("consent");
  if (consentCheckbox) {
    consentCheckbox.addEventListener("change", function () {
      var consentError = document.getElementById("consent-error");
      if (consentCheckbox.checked && consentError) {
        consentError.style.display = "none";
      }
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    statusEl.className = "form-status";

    if (!validate()) {
      showStatus("Please fix the highlighted fields and try again.", "error");
      return;
    }

    var formData = new FormData(form);
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    fetch(form.action, {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json"
      }
    })
      .then(function (response) {
        if (response.ok) {
          form.reset();
          showStatus(
            "Thanks — your message has been sent. We'll get back to you soon.",
            "success"
          );
        } else {
          return response.json().then(function (data) {
            var message =
              data && data.errors
                ? data.errors.map(function (e) {
                    return e.message;
                  }).join(", ")
                : "Something went wrong sending your message. Please try again or email us directly.";
            throw new Error(message);
          });
        }
      })
      .catch(function (error) {
        showStatus(
          error && error.message
            ? error.message
            : "Something went wrong sending your message. Please try again or email us directly.",
          "error"
        );
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Message";
      });
  });
})();
