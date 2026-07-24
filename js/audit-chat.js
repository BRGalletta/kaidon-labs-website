/* =========================================================
   Kaidon Labs — audit-chat.js
   Lead-gate form -> chat -> result flow for /ai-audit.
   Only runs on the audit page (early-returns if the gate form
   isn't present, same convention as script.js's contact form).
   ========================================================= */
(function () {
  "use strict";

  var gatePanel = document.getElementById("gate-panel");
  var gateForm = document.getElementById("gate-form");
  if (!gateForm) return;

  var gateStatus = document.getElementById("gate-status");
  var gateSubmit = document.getElementById("gate-submit");

  var chatPanel = document.getElementById("chat-panel");
  var chatMessages = document.getElementById("chat-messages");
  var chatForm = document.getElementById("chat-form");
  var chatInput = document.getElementById("chat-input");
  var chatSend = document.getElementById("chat-send");

  var resultPanel = document.getElementById("result-panel");
  var resultInitiatives = document.getElementById("result-initiatives");

  var sessionId = null;

  function showStatus(el, message, type) {
    el.textContent = message;
    el.className = "form-status show " + type;
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
    bubble.textContent = "...";
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function showResult(initiatives) {
    chatPanel.hidden = true;
    resultPanel.hidden = false;
    resultInitiatives.innerHTML = "";
    (initiatives || []).forEach(function (item) {
      var card = document.createElement("div");
      card.className = "result-initiative";
      var h3 = document.createElement("h3");
      h3.textContent = item.name || "AI Opportunity";
      var p = document.createElement("p");
      p.textContent = item.why || "";
      card.appendChild(h3);
      card.appendChild(p);
      resultInitiatives.appendChild(card);
    });
  }

  gateForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var name = document.getElementById("gate-name").value.trim();
    var email = document.getElementById("gate-email").value.trim();
    var company = document.getElementById("gate-company").value.trim();
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !emailPattern.test(email)) {
      showStatus(gateStatus, "Please enter your name and a valid email.", "error");
      return;
    }

    gateSubmit.disabled = true;
    gateSubmit.textContent = "Starting...";
    showStatus(gateStatus, "", "");

    fetch("/api/audit-chat/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, email: email, company: company || null }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
          return data;
        });
      })
      .then(function (data) {
        sessionId = data.session_id;
        gatePanel.hidden = true;
        chatPanel.hidden = false;
        addBubble("assistant", data.message);
        chatInput.focus();
      })
      .catch(function (error) {
        showStatus(gateStatus, error.message || "Something went wrong. Please try again.", "error");
      })
      .finally(function () {
        gateSubmit.disabled = false;
        gateSubmit.textContent = "Start the Conversation";
      });
  });

  if (chatForm) {
    chatForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var text = chatInput.value.trim();
      if (!text || !sessionId) return;

      addBubble("user", text);
      chatInput.value = "";
      chatInput.disabled = true;
      chatSend.disabled = true;

      var typingBubble = addTypingIndicator();

      fetch("/api/audit-chat/message", {
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
          if (data.done) {
            showResult(data.initiatives);
          } else {
            addBubble("assistant", data.message);
          }
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
  }
})();
