(() => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const copyrightYear = document.getElementById('copyright-year');
  if (copyrightYear) copyrightYear.textContent = String(new Date().getFullYear());

  const repoStarBadges = Array.from(document.querySelectorAll('.repo-stars[data-repo]'));
  const repoStarGroups = new Map();
  for (const badge of repoStarBadges) {
    const repo = (badge.getAttribute('data-repo') || '').trim();
    const countNode = badge.querySelector('[data-star-count]');
    if (!repo || !countNode) continue;
    if (!repoStarGroups.has(repo)) repoStarGroups.set(repo, []);
    repoStarGroups.get(repo).push(countNode);
  }

  const starCountFormatter = new Intl.NumberFormat('en-US');
  const STAR_CACHE_KEY = 'portfolio.repo-stars.v2';
  const STAR_CACHE_TTL_MS = 60 * 60 * 1000;
  const STAR_REFRESH_MS = STAR_CACHE_TTL_MS;
  const STAR_SNAPSHOT_URL = 'repo-stars.json';
  const STAR_SNAPSHOT_CACHE_BUSTER_MS = 60 * 60 * 1000;
  let starRefreshTimer = null;
  let repoStarCache = readRepoStarCache();

  for (const repo of repoStarGroups.keys()) {
    const cachedValue = repoStarCache && repoStarCache.values ? Number(repoStarCache.values[repo]) : NaN;
    if (Number.isFinite(cachedValue)) {
      setRepoStarCount(repo, cachedValue);
    } else {
      setRepoStarCount(repo, '—');
    }
  }

  function readRepoStarCache() {
    try {
      const raw = localStorage.getItem(STAR_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const timestamp = Number(parsed.timestamp);
      const values = parsed.values && typeof parsed.values === 'object' ? parsed.values : {};
      return {
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        values
      };
    } catch (_error) {
      return null;
    }
  }

  function writeRepoStarCache(values) {
    try {
      localStorage.setItem(STAR_CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        values
      }));
    } catch (_error) {
      // Ignore cache write failures (private mode, quota, disabled storage).
    }
  }

  function hasFreshRepoStarCache() {
    if (!repoStarCache) return false;
    return (Date.now() - repoStarCache.timestamp) < STAR_CACHE_TTL_MS;
  }

  function setRepoStarCount(repo, value) {
    const nodes = repoStarGroups.get(repo) || [];
    const text = typeof value === 'number' ? starCountFormatter.format(value) : String(value);
    for (const node of nodes) node.textContent = text;
  }

  function normalizeRepoStarValues(values) {
    if (!values || typeof values !== 'object') return {};
    const normalized = {};
    for (const repo of repoStarGroups.keys()) {
      const stars = Number(values[repo]);
      if (Number.isFinite(stars)) normalized[repo] = stars;
    }
    return normalized;
  }

  async function fetchRepoStarsFromSnapshot() {
    try {
      const cacheBuster = Math.floor(Date.now() / STAR_SNAPSHOT_CACHE_BUSTER_MS);
      const response = await fetch(`${STAR_SNAPSHOT_URL}?v=${cacheBuster}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return {};
      const payload = await response.json();
      return normalizeRepoStarValues(payload && payload.repos);
    } catch (_error) {
      return {};
    }
  }

  async function fetchRepoStarsFromGitHubApi() {
    const nextValues = {};
    await Promise.all(Array.from(repoStarGroups.keys()).map(async (repo) => {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github+json' }
        });
        if (!response.ok) return;
        const payload = await response.json();
        const stars = Number(payload.stargazers_count);
        if (!Number.isFinite(stars)) return;
        nextValues[repo] = stars;
      } catch (_error) {
        // Keep the last rendered value when network/API calls fail.
      }
    }));
    return nextValues;
  }

  async function refreshRepoStarCounts({ force = false } = {}) {
    if (!repoStarGroups.size) return;
    if (!force && hasFreshRepoStarCache()) return;

    const snapshotValues = await fetchRepoStarsFromSnapshot();
    const nextValues = Object.keys(snapshotValues).length
      ? snapshotValues
      : await fetchRepoStarsFromGitHubApi();

    if (!Object.keys(nextValues).length) return;

    for (const [repo, stars] of Object.entries(nextValues)) {
      setRepoStarCount(repo, stars);
    }

    repoStarCache = {
      timestamp: Date.now(),
      values: {
        ...(repoStarCache ? repoStarCache.values : {}),
        ...nextValues
      }
    };
    writeRepoStarCache(repoStarCache.values);
  }

  function clearStarRefreshTimer() {
    if (starRefreshTimer) {
      clearTimeout(starRefreshTimer);
      starRefreshTimer = null;
    }
  }

  function scheduleStarRefresh() {
    clearStarRefreshTimer();
    if (!repoStarGroups.size || document.hidden) return;
    starRefreshTimer = setTimeout(async () => {
      starRefreshTimer = null;
      if (document.hidden) return;
      await refreshRepoStarCounts();
      scheduleStarRefresh();
    }, STAR_REFRESH_MS);
  }

  if (repoStarGroups.size) {
    refreshRepoStarCounts();
    scheduleStarRefresh();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearStarRefreshTimer();
      } else {
        refreshRepoStarCounts();
        scheduleStarRefresh();
      }
    }, { passive: true });
    window.addEventListener('pageshow', () => {
      refreshRepoStarCounts({ force: true });
      scheduleStarRefresh();
    }, { passive: true });
  }

  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: true });
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  function resize() {
    canvas.width = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  const stars = [];
  const shooting = [];
  const SHOOTING_COLORS = [
    { hex: '#39ff88', rgb: { r: 57, g: 255, b: 136 } },  // neon green
    { hex: '#ff4fd8', rgb: { r: 255, g: 79, b: 216 } },  // neon pink
    { hex: '#44e3ff', rgb: { r: 68, g: 227, b: 255 } },  // neon blue
    { hex: '#ffb347', rgb: { r: 255, g: 179, b: 71 } },  // neon orange
    { hex: '#ff2d2d', rgb: { r: 255, g: 45, b: 45 } },   // neon red
    { hex: '#faff00', rgb: { r: 250, g: 255, b: 0 } },   // neon yellow
    { hex: '#b026ff', rgb: { r: 176, g: 38, b: 255 } }   // neon purple
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function initStars() {
    stars.length = 0;
    const w = canvas.width, h = canvas.height;

    // density scales with viewport; cap to keep it smooth on mobile
    const base = (w * h) / (DPR * DPR);
    const density = Math.max(220, Math.min(520, Math.floor(base / 9000)));

    for (let i = 0; i < density; i++) {
      const bright = Math.random() < 0.10;
      const baseR = bright ? rand(1.2, 2.0) : rand(0.6, 1.2);
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: baseR * DPR,
        a: rand(0.26, 0.92),
        tw: rand(0.00045, 0.0019),
        ph: rand(0, Math.PI * 2),
        cross: bright && Math.random() < 0.40
      });
    }
  }

  initStars();
  window.addEventListener('resize', initStars, { passive: true });

  function drawStarCross(x, y, r, a) {
    ctx.globalAlpha = a * 0.70;
    ctx.lineWidth = Math.max(1, r * 0.40);
    ctx.beginPath();
    ctx.moveTo(x - r * 2.1, y); ctx.lineTo(x + r * 2.1, y);
    ctx.moveTo(x, y - r * 2.1); ctx.lineTo(x, y + r * 2.1);
    ctx.stroke();
  }

  function spawnShootingStar() {
    const w = canvas.width, h = canvas.height;
    const mode = Math.floor(rand(0, 4));
    const color = SHOOTING_COLORS[Math.floor(Math.random() * SHOOTING_COLORS.length)];
    const prominence = Math.random() < 0.38 ? rand(1.55, 2.45) : rand(0.85, 1.55);
    let startX = 0, startY = 0, angle = 0;

    if (mode === 0) {
      startX = rand(-w * 0.05, w * 0.30);
      startY = rand(h * 0.04, h * 0.28);
      angle = rand(Math.PI * 0.18, Math.PI * 0.34);
    } else if (mode === 1) {
      startX = rand(w * 0.70, w * 1.05);
      startY = rand(h * 0.04, h * 0.28);
      angle = rand(Math.PI * 0.66, Math.PI * 0.82);
    } else if (mode === 2) {
      startX = rand(-w * 0.08, w * 0.18);
      startY = rand(h * 0.18, h * 0.46);
      angle = rand(-Math.PI * 0.05, Math.PI * 0.12);
    } else {
      startX = rand(w * 0.82, w * 1.08);
      startY = rand(h * 0.14, h * 0.44);
      angle = rand(Math.PI * 0.92, Math.PI * 1.06);
    }

    const speed = rand(2.0, 4.6) * DPR;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    shooting.push({
      x: startX, y: startY,
      vx, vy,
      color,
      prominence,
      life: 0,
      ttl: rand(188, 320),
      len: rand(170, 340) * DPR * (0.80 + prominence * 0.24),
      w: rand(1.0, 2.1) * DPR * (0.76 + prominence * 0.62)
    });
  }

  // Shooting star scheduling: prevent "tab-switch burst" by canceling timers when hidden.
  let shootTimer = null;
  let extraTimer = null;

  function clearShootTimers() {
    if (shootTimer) { clearTimeout(shootTimer); shootTimer = null; }
    if (extraTimer) { clearTimeout(extraTimer); extraTimer = null; }
  }

  function scheduleShooting() {
    clearShootTimers();
    if (document.hidden) return;

    const delay = rand(1700, 5200);
    shootTimer = setTimeout(() => {
      shootTimer = null;
      if (document.hidden) return;

      spawnShootingStar();
      if (Math.random() < 0.20) {
        extraTimer = setTimeout(() => {
          extraTimer = null;
          if (!document.hidden) spawnShootingStar();
        }, rand(180, 520));
      }

      scheduleShooting();
    }, delay);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearShootTimers();
    } else {
      // restart fresh schedule when returning to tab
      scheduleShooting();
    }
  }, { passive: true });

  scheduleShooting();

  // Moon eye tracking (uses DOM rects; stays attached on resize)
  const trackEyes = Array.from(document.querySelectorAll('.track-eye'));
  function updateTrackEyes(clientX, clientY) {
    for (const eye of trackEyes) {
      const pupil = eye.querySelector('.track-pupil');
      if (!pupil) continue;

      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;

      const maxOffset = Math.max(1.5, Math.min(rect.width, rect.height) * 0.22);
      const k = Math.min(maxOffset / dist, 1);

      pupil.style.transform = `translate(calc(-50% + ${(dx * k).toFixed(2)}px), calc(-50% + ${(dy * k).toFixed(2)}px))`;
    }
  }

  function resetTrackEyes() {
    for (const eye of trackEyes) {
      const pupil = eye.querySelector('.track-pupil');
      if (pupil) pupil.style.transform = 'translate(-50%, -50%)';
    }
  }

  window.addEventListener('mousemove', (e) => updateTrackEyes(e.clientX, e.clientY), { passive: true });
  window.addEventListener('mouseleave', resetTrackEyes, { passive: true });

  const CAROUSEL_SWIPE_THRESHOLD = 44;
  const CAROUSEL_SWIPE_MAX_VERTICAL = 42;
  const LIGHTBOX_CLOSE_SWIPE_THRESHOLD = 96;
  const SWIPE_DIRECTION_LOCK_PX = 10;
  const LIGHTBOX_NAV_SWIPE_THRESHOLD = 56;
  const CAROUSEL_SWIPE_OUT_MS = 150;
  const CAROUSEL_SWIPE_IN_MS = 180;
  const LIGHTBOX_SWIPE_MS = 180;

  // Project carousels
  const carouselControllers = new Map();
  const carousels = Array.from(document.querySelectorAll('[data-carousel]'));
  for (const carousel of carousels) {
    const images = (carousel.getAttribute('data-images') || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    const positions = (carousel.getAttribute('data-positions') || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!images.length) continue;

    const link = carousel.querySelector('.carousel-link');
    const image = carousel.querySelector('.carousel-image');
    const prevButton = carousel.querySelector('.carousel-prev');
    const nextButton = carousel.querySelector('.carousel-next');
    const indicator = carousel.querySelector('.carousel-indicator');
    if (!link || !image) continue;

    const peekImage = document.createElement('img');
    peekImage.className = 'card-thumb carousel-image carousel-peek-image';
    peekImage.alt = '';
    peekImage.decoding = 'async';
    peekImage.loading = 'eager';
    peekImage.draggable = false;
    peekImage.hidden = true;
    peekImage.setAttribute('aria-hidden', 'true');
    link.append(peekImage);

    let index = 0;
    const total = images.length;

    function renderCarousel() {
      const src = images[index];
      link.href = src;
      image.src = src;
      image.style.objectPosition = positions[index] || 'center center';
      image.style.transition = '';
      image.style.transform = '';
      image.style.opacity = '';
      if (indicator) indicator.textContent = `${index + 1} / ${total}`;
    }

    function rotate(delta) {
      index = (index + delta + total) % total;
      renderCarousel();
      return index;
    }

    function setIndex(nextIndex) {
      index = ((nextIndex % total) + total) % total;
      renderCarousel();
      return index;
    }

    const swipeState = {
      active: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      gesture: null,
      animating: false,
      previewIndex: -1,
      intentDirection: 0
    };

    function setCarouselPreviewImage(previewIndex) {
      if (swipeState.previewIndex === previewIndex && !peekImage.hidden) return;
      swipeState.previewIndex = previewIndex;
      peekImage.src = images[previewIndex];
      peekImage.style.objectPosition = positions[previewIndex] || 'center center';
      peekImage.hidden = false;
    }

    function hideCarouselPreviewImage() {
      swipeState.previewIndex = -1;
      peekImage.hidden = true;
      peekImage.removeAttribute('src');
      peekImage.style.transition = '';
      peekImage.style.transform = '';
      peekImage.style.opacity = '';
    }

    function clearCarouselDragStyles() {
      image.style.transition = '';
      image.style.transform = '';
      image.style.opacity = '';
      hideCarouselPreviewImage();
    }

    function applyCarouselDragPreview(deltaX) {
      const width = link.clientWidth || image.clientWidth || 220;
      const swipeSign = deltaX < 0 ? -1 : 1;
      const direction = swipeSign < 0 ? 1 : -1;
      const previewIndex = ((index + direction) % total + total) % total;
      setCarouselPreviewImage(previewIndex);

      const scale = Math.max(0.98, 1 - (Math.abs(deltaX) / 1800));
      const opacity = Math.max(0.72, 1 - (Math.abs(deltaX) / 420));
      image.style.transition = 'none';
      image.style.transform = `translate3d(${deltaX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(3)})`;
      image.style.opacity = opacity.toFixed(3);

      const previewX = deltaX - (swipeSign * width);
      peekImage.style.transition = 'none';
      peekImage.style.transform = `translate3d(${previewX.toFixed(2)}px, 0, 0) scale(1)`;
      peekImage.style.opacity = '0.98';
    }

    function animateCarouselSnapBack(deltaX = 0) {
      const width = link.clientWidth || image.clientWidth || 220;
      const swipeSign = deltaX < 0 ? -1 : 1;
      if (!peekImage.hidden) {
        peekImage.style.transition = `transform ${CAROUSEL_SWIPE_IN_MS}ms ease, opacity ${CAROUSEL_SWIPE_IN_MS}ms ease`;
        peekImage.style.transform = `translate3d(${Math.round(-swipeSign * width)}px, 0, 0) scale(1)`;
        peekImage.style.opacity = '0';
      }
      image.style.transition = `transform ${CAROUSEL_SWIPE_IN_MS}ms ease, opacity ${CAROUSEL_SWIPE_IN_MS}ms ease`;
      image.style.transform = 'translate3d(0, 0, 0) scale(1)';
      image.style.opacity = '1';
      window.setTimeout(clearCarouselDragStyles, CAROUSEL_SWIPE_IN_MS + 25);
    }

    function commitCarouselSwipe(direction) {
      if (swipeState.animating) return false;
      if (direction !== 1 && direction !== -1) return false;
      const width = link.clientWidth || image.clientWidth || 220;
      const swipeSign = direction === 1 ? -1 : 1;

      if (peekImage.hidden) {
        setCarouselPreviewImage(((index + direction) % total + total) % total);
      }

      swipeState.animating = true;
      image.style.transition = `transform ${CAROUSEL_SWIPE_OUT_MS}ms ease, opacity ${CAROUSEL_SWIPE_OUT_MS}ms ease`;
      image.style.transform = `translate3d(${Math.round(swipeSign * width)}px, 0, 0) scale(0.98)`;
      image.style.opacity = '0.58';
      peekImage.style.transition = `transform ${CAROUSEL_SWIPE_OUT_MS}ms ease, opacity ${CAROUSEL_SWIPE_OUT_MS}ms ease`;
      peekImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
      peekImage.style.opacity = '1';

      window.setTimeout(() => {
        rotate(direction);
        swipeState.animating = false;
        clearCarouselDragStyles();
      }, CAROUSEL_SWIPE_OUT_MS + 10);

      carousel.dataset.suppressLightboxUntil = String(Date.now() + 500);
      return true;
    }

    function handleCarouselSwipe(deltaX, deltaY, options = {}) {
      const { ignoreVertical = false, preferDirection = 0 } = options;
      if (preferDirection === 1 || preferDirection === -1) {
        return commitCarouselSwipe(preferDirection);
      }

      if (Math.abs(deltaX) < CAROUSEL_SWIPE_THRESHOLD) return false;
      if (!ignoreVertical) {
        if (Math.abs(deltaY) > CAROUSEL_SWIPE_MAX_VERTICAL) return false;
        if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) return false;
      }
      return commitCarouselSwipe(deltaX < 0 ? 1 : -1);
    }

    if (total === 1) {
      if (prevButton) prevButton.style.display = 'none';
      if (nextButton) nextButton.style.display = 'none';
      if (indicator) indicator.style.display = 'none';
    } else {
      if (prevButton) {
        prevButton.addEventListener('click', (e) => {
          e.preventDefault();
          rotate(-1);
        });
      }
      if (nextButton) {
        nextButton.addEventListener('click', (e) => {
          e.preventDefault();
          rotate(1);
        });
      }
    }

    if (total > 1 && link instanceof HTMLElement) {
      link.addEventListener('touchstart', (event) => {
        if (swipeState.animating) return;
        const touch = event.touches[0];
        if (!touch) return;
        swipeState.active = true;
        swipeState.startX = touch.clientX;
        swipeState.startY = touch.clientY;
        swipeState.lastX = touch.clientX;
        swipeState.lastY = touch.clientY;
        swipeState.gesture = null;
        swipeState.intentDirection = 0;
      }, { passive: true });

      link.addEventListener('touchmove', (event) => {
        if (!swipeState.active || swipeState.animating) return;
        const touch = event.touches[0];
        if (!touch) return;
        swipeState.lastX = touch.clientX;
        swipeState.lastY = touch.clientY;

        const deltaX = touch.clientX - swipeState.startX;
        const deltaY = touch.clientY - swipeState.startY;

        if (!swipeState.gesture) {
          if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK_PX && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK_PX) return;
          swipeState.gesture = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? 'horizontal' : 'vertical';
        }

        if (swipeState.gesture === 'horizontal') {
          // Prevent page scroll while actively swiping carousel thumbnails.
          event.preventDefault();
          applyCarouselDragPreview(deltaX * 0.96);
          if (Math.abs(deltaX) >= CAROUSEL_SWIPE_THRESHOLD) {
            swipeState.intentDirection = deltaX < 0 ? 1 : -1;
          }
        }
      }, { passive: false });

      link.addEventListener('touchend', (event) => {
        if (!swipeState.active || swipeState.animating) return;
        const touch = event.changedTouches[0];
        const endX = touch ? touch.clientX : swipeState.lastX;
        const endY = touch ? touch.clientY : swipeState.lastY;
        const deltaX = endX - swipeState.startX;
        const deltaY = endY - swipeState.startY;
        const isHorizontalGesture = swipeState.gesture === 'horizontal';
        const intentDirection = swipeState.intentDirection;
        swipeState.active = false;
        swipeState.gesture = null;
        swipeState.intentDirection = 0;
        if (!isHorizontalGesture) {
          clearCarouselDragStyles();
          return;
        }

        let didCommit = handleCarouselSwipe(deltaX, deltaY, { ignoreVertical: true });
        if (!didCommit && (intentDirection === 1 || intentDirection === -1)) {
          didCommit = handleCarouselSwipe(deltaX, deltaY, { preferDirection: intentDirection });
        }
        if (!didCommit) {
          carousel.dataset.suppressLightboxUntil = String(Date.now() + 320);
          animateCarouselSnapBack(deltaX);
        }
      }, { passive: true });

      link.addEventListener('touchcancel', () => {
        if (swipeState.animating) return;
        swipeState.active = false;
        swipeState.gesture = null;
        swipeState.intentDirection = 0;
        animateCarouselSnapBack(swipeState.lastX - swipeState.startX);
      }, { passive: true });
    }

    renderCarousel();

    carouselControllers.set(carousel, {
      images,
      total,
      rotate,
      setIndex,
      getIndex: () => index,
      getAlt: () => image.alt || 'Project preview image'
    });
  }

  // Thumbnail lightbox
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = lightbox ? lightbox.querySelector('.lightbox-image') : null;
  const lightboxClose = lightbox ? lightbox.querySelector('.lightbox-close') : null;
  const lightboxPrev = lightbox ? lightbox.querySelector('.lightbox-prev') : null;
  const lightboxNext = lightbox ? lightbox.querySelector('.lightbox-next') : null;
  const lightboxIndicator = lightbox ? lightbox.querySelector('.lightbox-indicator') : null;
  const lightboxPeekImage = (lightbox && lightboxImage instanceof HTMLElement)
    ? (() => {
      const preview = document.createElement('img');
      preview.className = 'lightbox-image lightbox-peek-image';
      preview.alt = '';
      preview.decoding = 'async';
      preview.loading = 'eager';
      preview.draggable = false;
      preview.hidden = true;
      preview.setAttribute('aria-hidden', 'true');
      lightbox.append(preview);
      return preview;
    })()
    : null;

  const lightboxState = {
    controller: null,
    index: 0,
    src: '',
    alt: '',
    previouslyFocused: null,
    touchActive: false,
    touchStartX: 0,
    touchStartY: 0,
    touchLastX: 0,
    touchLastY: 0,
    touchGesture: null,
    touchPreviewIndex: -1
  };

  function clearLightboxSwipeStyles() {
    if (!lightboxImage || !(lightboxImage instanceof HTMLElement)) return;
    lightboxImage.style.transition = '';
    lightboxImage.style.transform = '';
    lightboxImage.style.opacity = '';
    if (lightboxPeekImage instanceof HTMLElement) {
      lightboxPeekImage.style.transition = '';
      lightboxPeekImage.style.transform = '';
      lightboxPeekImage.style.opacity = '';
      lightboxPeekImage.hidden = true;
      lightboxPeekImage.removeAttribute('src');
      lightboxState.touchPreviewIndex = -1;
    }
  }

  function resetLightboxGestureState() {
    lightboxState.touchActive = false;
    lightboxState.touchStartX = 0;
    lightboxState.touchStartY = 0;
    lightboxState.touchLastX = 0;
    lightboxState.touchLastY = 0;
    lightboxState.touchGesture = null;
    lightboxState.touchPreviewIndex = -1;
  }

  function setLightboxPreviewImage(previewIndex) {
    if (!lightboxPeekImage || !lightboxState.controller) return;
    if (lightboxState.touchPreviewIndex === previewIndex && !lightboxPeekImage.hidden) return;
    lightboxState.touchPreviewIndex = previewIndex;
    lightboxPeekImage.src = lightboxState.controller.images[previewIndex];
    lightboxPeekImage.alt = '';
    lightboxPeekImage.hidden = false;
  }

  function applyLightboxHorizontalPreview(deltaX) {
    if (!lightboxPeekImage || !lightboxState.controller || !lightboxImage) return;
    if (lightboxState.controller.total <= 1) return;

    const width = lightboxImage.clientWidth || Math.min(window.innerWidth * 0.92, 1200);
    const swipeSign = deltaX < 0 ? -1 : 1;
    const direction = swipeSign < 0 ? 1 : -1;
    const previewIndex = ((lightboxState.index + direction) % lightboxState.controller.total + lightboxState.controller.total) % lightboxState.controller.total;
    setLightboxPreviewImage(previewIndex);

    const scale = Math.max(0.95, 1 - (Math.abs(deltaX) / 2400));
    lightboxImage.style.transform = `translate3d(${deltaX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(3)})`;
    lightboxPeekImage.style.transition = 'none';
    lightboxPeekImage.style.transform = `translate3d(${(deltaX - (swipeSign * width)).toFixed(2)}px, 0, 0) scale(1)`;
    lightboxPeekImage.style.opacity = '1';
  }

  function animateLightboxSnapBack(deltaX = 0) {
    if (!lightboxImage) return;
    const width = lightboxImage.clientWidth || Math.min(window.innerWidth * 0.92, 1200);
    const swipeSign = deltaX < 0 ? -1 : 1;

    if (lightboxPeekImage && !lightboxPeekImage.hidden) {
      lightboxPeekImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
      lightboxPeekImage.style.transform = `translate3d(${Math.round(-swipeSign * width)}px, 0, 0) scale(1)`;
      lightboxPeekImage.style.opacity = '0';
    }

    lightboxImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease`;
    lightboxImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
    window.setTimeout(clearLightboxSwipeStyles, LIGHTBOX_SWIPE_MS + 25);
  }

  function getLightboxFocusableElements() {
    if (!lightbox) return [];
    return Array.from(lightbox.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'))
      .filter((element) => (
        element instanceof HTMLElement
        && !element.hasAttribute('disabled')
        && element.getAttribute('aria-hidden') !== 'true'
        && element.offsetParent !== null
      ));
  }

  function syncLightbox() {
    if (!lightbox || !lightboxImage) return;
    clearLightboxSwipeStyles();

    if (lightboxState.controller) {
      const total = lightboxState.controller.total;
      lightboxState.index = lightboxState.controller.setIndex(lightboxState.index);
      const src = lightboxState.controller.images[lightboxState.index];
      lightboxImage.src = src;
      lightboxImage.alt = lightboxState.alt || lightboxState.controller.getAlt();

      const hasMultiple = total > 1;
      if (lightboxPrev) lightboxPrev.style.display = hasMultiple ? 'inline-flex' : 'none';
      if (lightboxNext) lightboxNext.style.display = hasMultiple ? 'inline-flex' : 'none';
      if (lightboxIndicator) {
        lightboxIndicator.style.display = hasMultiple ? 'inline-block' : 'none';
        lightboxIndicator.textContent = `${lightboxState.index + 1} / ${total}`;
      }
      return;
    }

    lightboxImage.src = lightboxState.src;
    lightboxImage.alt = lightboxState.alt || 'Project preview image';
    if (lightboxPrev) lightboxPrev.style.display = 'none';
    if (lightboxNext) lightboxNext.style.display = 'none';
    if (lightboxIndicator) lightboxIndicator.style.display = 'none';
  }

  function openLightbox(src, altText, controller, index) {
    if (!lightbox || !lightboxImage) return;
    lightboxState.previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lightboxState.controller = controller || null;
    lightboxState.index = Number.isInteger(index) ? index : 0;
    lightboxState.src = src;
    lightboxState.alt = altText || 'Project preview image';
    syncLightbox();
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
    if (lightboxClose instanceof HTMLElement) {
      lightboxClose.focus();
    } else {
      lightbox.focus();
    }
  }

  function closeLightbox() {
    if (!lightbox || !lightboxImage) return;
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    clearLightboxSwipeStyles();
    lightboxImage.removeAttribute('src');
    lightboxImage.removeAttribute('alt');
    lightboxState.controller = null;
    lightboxState.index = 0;
    lightboxState.src = '';
    lightboxState.alt = '';
    resetLightboxGestureState();
    if (lightboxState.previouslyFocused && typeof lightboxState.previouslyFocused.focus === 'function') {
      lightboxState.previouslyFocused.focus();
    }
    lightboxState.previouslyFocused = null;
  }

  function resetPageState() {
    window.scrollTo(0, 0);
    resetTrackEyes();
    closeLightbox();

    for (const controller of carouselControllers.values()) {
      controller.setIndex(0);
    }
  }

  function stepLightbox(delta) {
    if (!lightboxState.controller) return;
    lightboxState.index = lightboxState.controller.rotate(delta);
    syncLightbox();
  }

  document.addEventListener('click', (e) => {
    const thumbLink = e.target.closest('.thumb-link');
    if (!thumbLink || !(thumbLink instanceof HTMLAnchorElement)) return;

    const carousel = thumbLink.closest('[data-carousel]');
    if (carousel) {
      const suppressUntil = Number(carousel.getAttribute('data-suppress-lightbox-until') || 0);
      if (Number.isFinite(suppressUntil) && suppressUntil > Date.now()) {
        e.preventDefault();
        return;
      }
    }

    e.preventDefault();
    const preview = thumbLink.querySelector('img');
    const controller = carousel ? carouselControllers.get(carousel) : null;
    const currentIndex = controller ? controller.getIndex() : 0;
    openLightbox(thumbLink.href, preview ? preview.alt : '', controller || null, currentIndex);
  });

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
  }

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }

  if (lightboxPrev) {
    lightboxPrev.addEventListener('click', (e) => {
      e.preventDefault();
      stepLightbox(-1);
    });
  }

  if (lightboxNext) {
    lightboxNext.addEventListener('click', (e) => {
      e.preventDefault();
      stepLightbox(1);
    });
  }

  if (lightbox && lightboxImage instanceof HTMLElement) {
    lightboxImage.addEventListener('touchstart', (event) => {
      if (!lightbox.classList.contains('is-open')) return;
      const touch = event.touches[0];
      if (!touch) return;
      lightboxState.touchActive = true;
      lightboxState.touchStartX = touch.clientX;
      lightboxState.touchStartY = touch.clientY;
      lightboxState.touchLastX = touch.clientX;
      lightboxState.touchLastY = touch.clientY;
      lightboxState.touchGesture = null;
      lightboxImage.style.transition = 'none';
    }, { passive: true });

    lightboxImage.addEventListener('touchmove', (event) => {
      if (!lightboxState.touchActive) return;
      const touch = event.touches[0];
      if (!touch) return;
      lightboxState.touchLastX = touch.clientX;
      lightboxState.touchLastY = touch.clientY;
      const deltaX = touch.clientX - lightboxState.touchStartX;
      const deltaY = touch.clientY - lightboxState.touchStartY;

      if (!lightboxState.touchGesture) {
        if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK_PX && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK_PX) return;
        lightboxState.touchGesture = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? 'horizontal' : 'vertical';
      }

      if (lightboxState.touchGesture === 'horizontal') {
        event.preventDefault();
        applyLightboxHorizontalPreview(deltaX);
        return;
      }

      event.preventDefault();
      const absY = Math.abs(deltaY);
      const scale = Math.max(0.92, 1 - (absY / 1200));
      lightboxImage.style.transform = `translate3d(0, ${deltaY}px, 0) scale(${scale.toFixed(3)})`;
    }, { passive: false });

    lightboxImage.addEventListener('touchend', (event) => {
      if (!lightboxState.touchActive) return;
      const touch = event.changedTouches[0];
      const endX = touch ? touch.clientX : lightboxState.touchLastX;
      const endY = touch ? touch.clientY : lightboxState.touchLastY;
      const deltaX = endX - lightboxState.touchStartX;
      const deltaY = endY - lightboxState.touchStartY;
      const gesture = lightboxState.touchGesture;
      resetLightboxGestureState();

      if (gesture === 'horizontal') {
        const hasCarousel = !!(lightboxState.controller && lightboxState.controller.total > 1);
        if (hasCarousel && Math.abs(deltaX) >= LIGHTBOX_NAV_SWIPE_THRESHOLD) {
          const width = lightboxImage.clientWidth || Math.min(window.innerWidth * 0.92, 1200);
          const swipeSign = deltaX < 0 ? -1 : 1;
          if (lightboxPeekImage && lightboxPeekImage.hidden) {
            applyLightboxHorizontalPreview(deltaX);
          }

          lightboxImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
          lightboxImage.style.transform = `translate3d(${Math.round(swipeSign * width)}px, 0, 0) scale(0.98)`;
          lightboxImage.style.opacity = '0.6';

          if (lightboxPeekImage && !lightboxPeekImage.hidden) {
            lightboxPeekImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
            lightboxPeekImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
            lightboxPeekImage.style.opacity = '1';
          }

          window.setTimeout(() => {
            stepLightbox(deltaX < 0 ? 1 : -1);
            clearLightboxSwipeStyles();
          }, LIGHTBOX_SWIPE_MS + 10);
          return;
        }

        animateLightboxSnapBack(deltaX);
        return;
      }

      const isCloseSwipe = (
        Math.abs(deltaY) >= LIGHTBOX_CLOSE_SWIPE_THRESHOLD
        && Math.abs(deltaY) > Math.abs(deltaX) * 1.1
      );

      if (isCloseSwipe) {
        closeLightbox();
        return;
      }

      lightboxImage.style.transition = 'transform 180ms ease';
      lightboxImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
      window.setTimeout(clearLightboxSwipeStyles, 220);
    }, { passive: true });

    lightboxImage.addEventListener('touchcancel', () => {
      if (!lightboxState.touchActive) return;
      const deltaX = lightboxState.touchLastX - lightboxState.touchStartX;
      resetLightboxGestureState();
      animateLightboxSnapBack(deltaX);
    }, { passive: true });
  }

  window.addEventListener('keydown', (e) => {
    if (!lightbox || !lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      closeLightbox();
      return;
    }
    if (e.key === 'ArrowLeft') {
      stepLightbox(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      stepLightbox(1);
      return;
    }
    if (e.key === 'Tab') {
      const focusable = getLightboxFocusableElements();
      if (!focusable.length) {
        e.preventDefault();
        lightbox.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener('load', resetPageState, { once: true });
  window.addEventListener('pageshow', () => {
    // Covers normal reload and bfcache restore on mobile browsers.
    resetPageState();
  });

  function tick(t) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // stars
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    for (const s of stars) {
      const tw = 0.48 + 0.52 * Math.sin(s.ph + t * s.tw);
      const a = Math.max(0.07, Math.min(1, s.a * tw));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.cross && a > 0.56) drawStarCross(s.x, s.y, s.r, a);
    }

    // shooting stars
    for (let i = shooting.length - 1; i >= 0; i--) {
      const sh = shooting[i];
      sh.x += sh.vx; sh.y += sh.vy; sh.life += 1;

      const life01 = sh.life / sh.ttl;
      const alpha = Math.max(0, 1 - life01);

      const mag = Math.hypot(sh.vx, sh.vy) || 1;
      const ux = sh.vx / mag, uy = sh.vy / mag;

      const tx = sh.x, ty = sh.y;
      const hx = tx - ux * sh.len, hy = ty - uy * sh.len;
      const trailAlpha = Math.min(1, (0.48 + sh.prominence * 0.52) * alpha);
      const headAlpha = Math.min(1, (0.36 + sh.prominence * 0.44) * alpha);

      const grad = ctx.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, `rgba(${sh.color.rgb.r},${sh.color.rgb.g},${sh.color.rgb.b},${trailAlpha})`);
      grad.addColorStop(1, `rgba(${sh.color.rgb.r},${sh.color.rgb.g},${sh.color.rgb.b},0)`);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = sh.w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy); ctx.lineTo(tx, ty);
      ctx.stroke();

      // Draw a subtle, forward-leaning glow so the head reads as a streak tip, not a circle.
      ctx.fillStyle = `rgba(${sh.color.rgb.r},${sh.color.rgb.g},${sh.color.rgb.b},${headAlpha})`;
      const headLen = sh.w * (1.18 + sh.prominence * 0.34);
      const headWid = sh.w * (0.50 + sh.prominence * 0.16);
      const angle = Math.atan2(sh.vy, sh.vx);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(sh.w * 0.32, 0, headLen, headWid, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (sh.life >= sh.ttl || sh.x < -450 || sh.x > w + 450 || sh.y < -450 || sh.y > h + 450) {
        shooting.splice(i, 1);
      }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
