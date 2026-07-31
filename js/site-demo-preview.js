/* =========================================================
   Kaidon Labs — site-demo-preview.js
   Preview page logic for /site-demo/preview: reads the session
   id from the query string, polls for capture readiness
   (triggering the actual capture request itself), then renders
   the screenshot backdrop and drives the floating chat widget.
   Chat bubble/typing-indicator/fetch-unwrap idioms mirror
   audit-chat.js's patterns.
   ========================================================= */
(function () {
  "use strict";

  var loadingState = document.getElementById("loading-state");
  if (!loadingState) return; // not the preview page

  var loadingMessage = document.getElementById("loading-message");
  var errorState = document.getElementById("error-state");
  var errorMessage = document.getElementById("error-message");
  var backdropWrap = document.getElementById("backdrop-wrap");
  var backdropImage = document.getElementById("backdrop-image");
  var disclaimerDomain = document.getElementById("disclaimer-domain");
  var demoWidget = document.getElementById("demo-widget");
  var widgetLauncher = document.getElementById("widget-launcher");
  var widgetPanel = document.getElementById("widget-panel");
  var widgetClose = document.getElementById("widget-close");
  var chatMessages = document.getElementById("chat-messages");
  var chatForm = document.getElementById("chat-form");
  var chatInput = document.getElementById("chat-input");
  var chatSend = document.getElementById("chat-send");

  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get("session_id");

  var POLL_INTERVAL_MS = 1800;
  var pollTimer = null;
  var captureTriggered = false;

  function hostnameFor(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return "this site";
    }
  }

  // Relative luminance (WCAG formula) decides whether the accent color
  // needs light or dark text on top of it for readable contrast.
  function relativeLuminance(hex) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    var num = parseInt(m[1], 16);
    var r = (num >> 16) & 255;
    var g = (num >> 8) & 255;
    var b = num & 255;
    function channel(c) {
      var s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  // Applies the target site's brand color to the widget (launcher, header,
  // outgoing chat bubbles) when one was found on its homepage — see
  // _scrape.js for how accent_color is extracted/validated. Sets the CSS
  // custom properties that site-demo.css's widget rules read, falling back
  // to Kaidon Labs' own colors whenever this is never called.
  function applyBrandColor(hex) {
    if (!hex) return;
    var luminance = relativeLuminance(hex);
    if (luminance === null) return;
    demoWidget.style.setProperty("--demo-widget-accent", hex);
    demoWidget.style.setProperty("--demo-widget-accent-text", luminance > 0.5 ? "#0b1220" : "#ffffff");
  }

  function showError(message) {
    if (pollTimer) clearTimeout(pollTimer);
    loadingState.hidden = true;
    errorState.hidden = false;
    errorMessage.textContent = message || "We couldn't capture that site.";
  }

  function addBubble(role, text) {
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble " + role;
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function addTypingIndicator() {
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble typing";
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement("span");
      dot.className = "typing-dot";
      bubble.appendChild(dot);
    }
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function showReady(data) {
    if (disclaimerDomain && data.target_url) {
      disclaimerDomain.textContent = hostnameFor(data.target_url);
    }
    applyBrandColor(data.accent_color);
    loadingState.hidden = true;
    backdropImage.src = data.screenshot_url;
    backdropWrap.hidden = false;
    demoWidget.hidden = false;
    // Open the widget panel by default — the whole point of this page is
    // the chat, so don't make the visitor hunt for the launcher bubble.
    widgetPanel.hidden = false;
    widgetLauncher.setAttribute("aria-expanded", "true");
    addBubble("assistant", data.message);
  }

  function triggerCapture() {
    loadingMessage.textContent = "Capturing your site and reading its content…";
    fetch("/api/site-demo/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(function () {
      // Swallow here — the poll loop below will surface the real failure
      // once status.js reports the "failed" status this request itself set.
    });
  }

  function pollStatus() {
    fetch("/api/site-demo/status?session_id=" + encodeURIComponent(sessionId))
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.error || "Something went wrong.");
          return data;
        });
      })
      .then(function (data) {
        if (disclaimerDomain && data.target_url) {
          disclaimerDomain.textContent = hostnameFor(data.target_url);
        }

        if (data.status === "ready") {
          showReady(data);
          return;
        }
        if (data.status === "failed") {
          showError(data.error_message);
          return;
        }

        if (!captureTriggered) {
          captureTriggered = true;
          triggerCapture();
        }
        pollTimer = setTimeout(pollStatus, POLL_INTERVAL_MS);
      })
      .catch(function (error) {
        showError(error.message);
      });
  }

  if (!sessionId) {
    showError("No demo session found — please start from the site-demo page.");
    return;
  }

  pollStatus();

  widgetLauncher.addEventListener("click", function () {
    widgetPanel.hidden = false;
    widgetLauncher.setAttribute("aria-expanded", "true");
    chatInput.focus();
  });

  widgetClose.addEventListener("click", function () {
    widgetPanel.hidden = true;
    widgetLauncher.setAttribute("aria-expanded", "false");
  });

  chatForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var text = chatInput.value.trim();
    if (!text) return;

    addBubble("user", text);
    chatInput.value = "";
    chatInput.disabled = true;
    chatSend.disabled = true;

    var typingBubble = addTypingIndicator();

    fetch("/api/site-demo/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
          return data;
        });
      })
      .then(function (data) {
        typingBubble.remove();
        addBubble("assistant", data.message);
      })
      .catch(function (error) {
        typingBubble.remove();
        addBubble("assistant", error.message || "Something went wrong. Please try again in a moment.");
      })
      .finally(function () {
        chatInput.disabled = false;
        chatSend.disabled = false;
        chatInput.focus();
      });
  });
})();
