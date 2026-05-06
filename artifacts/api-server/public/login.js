(function () {
  const form = document.getElementById("loginForm");
  const senhaInput = document.getElementById("senha");
  const errorEl = document.getElementById("error");
  const submitBtn = document.getElementById("submit");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }
  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    clearError();
    submitBtn.disabled = true;
    submitBtn.textContent = "Entrando...";
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha: senhaInput.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || "Não foi possível entrar.");
        senhaInput.select();
        return;
      }
      window.location.href = data.redirect || "/api/";
    } catch (err) {
      showError("Erro de rede. Tente novamente.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Entrar";
    }
  });
})();
