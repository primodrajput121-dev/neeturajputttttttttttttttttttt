document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const passwordGate = document.getElementById("password-gate");
  const mainApp = document.getElementById("main-app");
  const gateForm = document.getElementById("gate-form");
  const gatePassword = document.getElementById("gate-password");
  const gateError = document.getElementById("gate-error");
  const logoutBtn = document.getElementById("logout-btn");

  const recipientsInput = document.getElementById("recipients-input");
  const detectedCount = document.getElementById("detected-count");

  // Toggle Password Visiblity Helper
  const setupTogglePassword = (inputId, buttonId) => {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (input && button) {
      button.addEventListener("click", () => {
        const type = input.type === "password" ? "text" : "password";
        input.type = type;
        button.querySelector("i").className = type === "password" ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
      });
    }
  };

  setupTogglePassword("gate-password", "toggle-gate-password");
  setupTogglePassword("dashboard-password", "toggle-password");

  // Gate Password Handling (Demo Passthrough)
  gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    // Replace "admin123" with your target frontend gate key
    if (gatePassword.value === "admin123") {
      passwordGate.classList.add("hidden");
      mainApp.classList.remove("hidden");
      gateError.classList.add("hidden");
    } else {
      gateError.classList.remove("hidden");
    }
  });

  // Logout Double Click Handling
  logoutBtn.addEventListener("dblclick", () => {
    mainApp.classList.add("hidden");
    passwordGate.classList.remove("hidden");
    gatePassword.value = "";
  });

  // Parse Recipients Count Realtime
  recipientsInput.addEventListener("input", () => {
    const rawText = recipientsInput.value;
    // Simple regex to match emails split by commas, new lines, spaces
    const emails = rawText
      .split(/[\n, ]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0 && e.includes("@"));

    const count = new Set(emails).size; // Unique count
    detectedCount.textContent = `${count} found`;
    document.getElementById("stat-total").textContent = count;
    document.getElementById("stat-remaining").textContent = count;
  });
});
