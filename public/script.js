(function jungleEffects() {
  const fireflyField = document.querySelector(".fireflies");
  const moon = document.querySelector(".moon");
  const pupils = document.querySelectorAll(".pupil");
  if (!fireflyField) {
    return;
  }

  const total = 44;

  for (let i = 0; i < total; i += 1) {
    const fly = document.createElement("span");
    const size = (1.6 + Math.random() * 3.6).toFixed(2);

    fly.className = "firefly";
    fly.style.setProperty("--size", `${size}px`);
    fly.style.setProperty("--delay", `${(Math.random() * -18).toFixed(2)}s`);
    fly.style.setProperty("--flash-duration", `${(3 + Math.random() * 5).toFixed(2)}s`);
    fly.style.setProperty("--float-duration", `${(8 + Math.random() * 10).toFixed(2)}s`);
    fly.style.left = `${(2 + Math.random() * 96).toFixed(2)}%`;
    fly.style.top = `${(6 + Math.random() * 88).toFixed(2)}%`;
    fly.style.setProperty("--x1", `${(-35 + Math.random() * 70).toFixed(2)}px`);
    fly.style.setProperty("--y1", `${(-35 + Math.random() * 70).toFixed(2)}px`);
    fly.style.setProperty("--x2", `${(-35 + Math.random() * 70).toFixed(2)}px`);
    fly.style.setProperty("--y2", `${(-35 + Math.random() * 70).toFixed(2)}px`);

    fireflyField.appendChild(fly);
  }

  const updateEyes = (clientX, clientY) => {
    if (!moon || pupils.length === 0) {
      return;
    }

    const rect = moon.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy) || 1;
    const maxOffset = Math.max(3, rect.width * 0.03);
    const scale = Math.min(maxOffset / distance, 1);
    const x = dx * scale;
    const y = dy * scale;

    document.body.style.setProperty("--eye-x", `${x.toFixed(2)}px`);
    document.body.style.setProperty("--eye-y", `${y.toFixed(2)}px`);
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 12;
      const y = (event.clientY / window.innerHeight - 0.5) * 12;
      document.body.style.setProperty("--mx", `${x.toFixed(2)}px`);
      document.body.style.setProperty("--my", `${y.toFixed(2)}px`);
      updateEyes(event.clientX, event.clientY);
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    document.body.style.setProperty("--eye-x", "0px");
    document.body.style.setProperty("--eye-y", "0px");
  });
})();
