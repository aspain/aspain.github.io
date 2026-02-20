(function createFireflies() {
  const total = 26;
  const body = document.body;

  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement("span");
    dot.className = "firefly";
    dot.style.left = `${Math.random() * 100}vw`;
    dot.style.top = `${Math.random() * 100}vh`;
    dot.style.animationDuration = `${6 + Math.random() * 8}s`;
    dot.style.animationDelay = `${Math.random() * -16}s`;
    dot.style.transform = `translate3d(${(Math.random() - 0.5) * 30}px, ${(Math.random() - 0.5) * 30}px, 0)`;

    body.appendChild(dot);
  }
})();
