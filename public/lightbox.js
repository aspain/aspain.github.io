(() => {
  const LIGHTBOX_CLOSE_SWIPE_THRESHOLD = 96;
  const LIGHTBOX_SWIPE_DIRECTION_LOCK_PX = 10;
  const LIGHTBOX_NAV_SWIPE_THRESHOLD = 56;
  const LIGHTBOX_DOUBLE_TAP_MS = 280;
  const LIGHTBOX_DOUBLE_TAP_DISTANCE = 28;
  const LIGHTBOX_TAP_MAX_MOVEMENT = 14;
  const LIGHTBOX_DOUBLE_TAP_SCALE = 2.2;
  const LIGHTBOX_SWIPE_MS = 180;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createPortfolioLightbox(options) {
    const {
      root,
      image,
      closeButton,
      prevButton,
      nextButton,
      indicator,
      renderIndicator,
      clearIndicator,
      peekImageClassName,
      maxWidth = 1200,
      openClass = 'is-open',
      zoomClass = 'is-zoomed',
      bodyOpenClass = 'lightbox-open',
      onOpenChange
    } = options || {};

    if (!(root instanceof HTMLElement) || !(image instanceof HTMLElement)) {
      return {
        open() {},
        close() {},
        sync() {},
        isOpen() {
          return false;
        }
      };
    }

    const peekImage = document.createElement('img');
    peekImage.className = peekImageClassName || image.className;
    peekImage.alt = '';
    peekImage.decoding = 'async';
    peekImage.loading = 'eager';
    peekImage.draggable = false;
    peekImage.hidden = true;
    peekImage.setAttribute('aria-hidden', 'true');
    root.append(peekImage);

    const state = {
      open: false,
      source: null,
      previouslyFocused: null,
      touchActive: false,
      touchStartX: 0,
      touchStartY: 0,
      touchLastX: 0,
      touchLastY: 0,
      touchGesture: null,
      touchPreviewKey: '',
      zoomed: false,
      zoomOriginX: 50,
      zoomOriginY: 50,
      lastTapTime: 0,
      lastTapX: 0,
      lastTapY: 0
    };

    function clearTapState() {
      state.lastTapTime = 0;
      state.lastTapX = 0;
      state.lastTapY = 0;
    }

    function getTotal() {
      if (!state.source || typeof state.source.getTotal !== 'function') return 0;
      return Math.max(0, Number(state.source.getTotal()) || 0);
    }

    function getCurrentItem() {
      if (!state.source || typeof state.source.getCurrentItem !== 'function') return null;
      return state.source.getCurrentItem();
    }

    function getAdjacentItem(direction) {
      if (!state.source || typeof state.source.getAdjacentItem !== 'function') return null;
      return state.source.getAdjacentItem(direction);
    }

    function setIndicatorVisible(visible) {
      if (!indicator) return;
      indicator.hidden = !visible;
      indicator.style.display = visible ? '' : 'none';
    }

    function resetIndicator() {
      setIndicatorVisible(false);
      if (typeof clearIndicator === 'function') clearIndicator();
    }

    function applyZoomTransform(animate = false) {
      root.classList.toggle(zoomClass, state.zoomed);
      image.style.transition = animate ? 'transform 180ms ease' : '';
      image.style.transformOrigin = `${state.zoomOriginX}% ${state.zoomOriginY}%`;
      image.style.transform = state.zoomed
        ? `translate3d(0, 0, 0) scale(${LIGHTBOX_DOUBLE_TAP_SCALE})`
        : '';
      image.style.opacity = '1';
    }

    function resetZoom(animate = false) {
      state.zoomed = false;
      state.zoomOriginX = 50;
      state.zoomOriginY = 50;
      applyZoomTransform(animate);
    }

    function toggleZoom(clientX, clientY) {
      if (state.zoomed) {
        resetZoom(true);
        return;
      }

      const rect = image.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        state.zoomOriginX = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
        state.zoomOriginY = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      } else {
        state.zoomOriginX = 50;
        state.zoomOriginY = 50;
      }

      state.zoomed = true;
      applyZoomTransform(true);
    }

    function hidePreviewImage() {
      state.touchPreviewKey = '';
      peekImage.hidden = true;
      peekImage.removeAttribute('src');
      peekImage.style.transition = '';
      peekImage.style.transform = '';
      peekImage.style.opacity = '';
    }

    function clearSwipeStyles() {
      image.style.transition = '';
      image.style.opacity = '';
      image.style.transformOrigin = `${state.zoomOriginX}% ${state.zoomOriginY}%`;
      image.style.transform = state.zoomed
        ? `translate3d(0, 0, 0) scale(${LIGHTBOX_DOUBLE_TAP_SCALE})`
        : '';
      hidePreviewImage();
    }

    function resetGestureState() {
      state.touchActive = false;
      state.touchStartX = 0;
      state.touchStartY = 0;
      state.touchLastX = 0;
      state.touchLastY = 0;
      state.touchGesture = null;
      state.touchPreviewKey = '';
    }

    function setPreviewImage(item) {
      if (!item || !item.src) return;
      if (state.touchPreviewKey === item.src && !peekImage.hidden) return;
      state.touchPreviewKey = item.src;
      peekImage.src = item.src;
      peekImage.hidden = false;
    }

    function applyHorizontalPreview(deltaX) {
      if (getTotal() <= 1) return;
      const swipeSign = deltaX < 0 ? -1 : 1;
      const direction = swipeSign < 0 ? 1 : -1;
      const previewItem = getAdjacentItem(direction);
      if (!previewItem) return;
      setPreviewImage(previewItem);

      const width = image.clientWidth || Math.min(window.innerWidth * 0.92, maxWidth);
      const scale = Math.max(0.95, 1 - (Math.abs(deltaX) / 2400));
      image.style.transform = `translate3d(${deltaX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(3)})`;
      peekImage.style.transition = 'none';
      peekImage.style.transform = `translate3d(${(deltaX - (swipeSign * width)).toFixed(2)}px, 0, 0) scale(1)`;
      peekImage.style.opacity = '1';
    }

    function animateSnapBack(deltaX = 0) {
      const width = image.clientWidth || Math.min(window.innerWidth * 0.92, maxWidth);
      const swipeSign = deltaX < 0 ? -1 : 1;

      if (!peekImage.hidden) {
        peekImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
        peekImage.style.transform = `translate3d(${Math.round(-swipeSign * width)}px, 0, 0) scale(1)`;
        peekImage.style.opacity = '0';
      }

      image.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease`;
      image.style.transform = 'translate3d(0, 0, 0) scale(1)';
      window.setTimeout(clearSwipeStyles, LIGHTBOX_SWIPE_MS + 25);
    }

    function getFocusableElements() {
      return Array.from(root.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => (
          element instanceof HTMLElement
          && !element.hasAttribute('disabled')
          && element.getAttribute('aria-hidden') !== 'true'
          && element.offsetParent !== null
        ));
    }

    function sync() {
      if (!state.open || !state.source) return;
      const item = getCurrentItem();
      if (!item || !item.src) return;

      clearTapState();
      resetZoom();
      clearSwipeStyles();

      image.src = item.src;
      image.alt = item.alt || 'Image preview';

      const total = getTotal();
      const hasMultiple = total > 1;
      if (prevButton) prevButton.style.display = hasMultiple ? 'inline-flex' : 'none';
      if (nextButton) nextButton.style.display = hasMultiple ? 'inline-flex' : 'none';

      if (hasMultiple) {
        setIndicatorVisible(true);
        if (typeof renderIndicator === 'function') renderIndicator({ indicator, item, source: state.source, total });
      } else {
        resetIndicator();
      }
    }

    function step(delta) {
      if (!state.source || getTotal() <= 1 || typeof state.source.step !== 'function') return;
      state.source.step(delta);
      sync();
    }

    function open(source, providedFocus) {
      if (!source) return;
      state.source = source;
      state.previouslyFocused = providedFocus instanceof HTMLElement
        ? providedFocus
        : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      state.open = true;
      if (typeof onOpenChange === 'function') onOpenChange(true);
      root.classList.add(openClass);
      root.setAttribute('aria-hidden', 'false');
      document.body.classList.add(bodyOpenClass);
      sync();
      if (closeButton instanceof HTMLElement) {
        closeButton.focus();
      } else {
        root.focus();
      }
    }

    function close() {
      if (!state.open) return;
      root.classList.remove(openClass);
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.remove(bodyOpenClass);
      clearTapState();
      resetZoom();
      clearSwipeStyles();
      image.removeAttribute('src');
      image.removeAttribute('alt');
      resetIndicator();
      resetGestureState();
      state.open = false;
      if (typeof onOpenChange === 'function') onOpenChange(false);
      if (state.previouslyFocused && typeof state.previouslyFocused.focus === 'function') {
        state.previouslyFocused.focus();
      }
      state.previouslyFocused = null;
      state.source = null;
    }

    root.addEventListener('click', (event) => {
      if (event.target === root) close();
    });

    if (closeButton) {
      closeButton.addEventListener('click', close);
    }

    if (prevButton) {
      prevButton.addEventListener('click', (event) => {
        event.preventDefault();
        step(-1);
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', (event) => {
        event.preventDefault();
        step(1);
      });
    }

    image.addEventListener('touchstart', (event) => {
      if (!state.open) return;
      if (event.touches.length > 1) {
        clearTapState();
        resetGestureState();
        clearSwipeStyles();
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      state.touchActive = true;
      state.touchStartX = touch.clientX;
      state.touchStartY = touch.clientY;
      state.touchLastX = touch.clientX;
      state.touchLastY = touch.clientY;
      state.touchGesture = null;
      image.style.transition = 'none';
    }, { passive: true });

    image.addEventListener('touchmove', (event) => {
      if (event.touches.length > 1) {
        resetGestureState();
        clearSwipeStyles();
        return;
      }
      if (!state.touchActive) return;

      const touch = event.touches[0];
      if (!touch) return;
      state.touchLastX = touch.clientX;
      state.touchLastY = touch.clientY;
      const deltaX = touch.clientX - state.touchStartX;
      const deltaY = touch.clientY - state.touchStartY;

      if (state.zoomed) return;

      if (!state.touchGesture) {
        if (Math.abs(deltaX) < LIGHTBOX_SWIPE_DIRECTION_LOCK_PX && Math.abs(deltaY) < LIGHTBOX_SWIPE_DIRECTION_LOCK_PX) return;
        state.touchGesture = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? 'horizontal' : 'vertical';
      }

      if (state.touchGesture === 'horizontal') {
        event.preventDefault();
        applyHorizontalPreview(deltaX);
        return;
      }

      event.preventDefault();
      const absY = Math.abs(deltaY);
      const scale = Math.max(0.92, 1 - (absY / 1200));
      image.style.transform = `translate3d(0, ${deltaY}px, 0) scale(${scale.toFixed(3)})`;
    }, { passive: false });

    image.addEventListener('touchend', (event) => {
      if (!state.touchActive) return;
      const touch = event.changedTouches[0];
      const endX = touch ? touch.clientX : state.touchLastX;
      const endY = touch ? touch.clientY : state.touchLastY;
      const deltaX = endX - state.touchStartX;
      const deltaY = endY - state.touchStartY;
      const gesture = state.touchGesture;
      const wasZoomed = state.zoomed;
      const isTap = (
        !gesture
        && Math.abs(deltaX) <= LIGHTBOX_TAP_MAX_MOVEMENT
        && Math.abs(deltaY) <= LIGHTBOX_TAP_MAX_MOVEMENT
      );
      resetGestureState();

      if (isTap) {
        const now = Date.now();
        const isDoubleTap = (
          state.lastTapTime > 0
          && (now - state.lastTapTime) <= LIGHTBOX_DOUBLE_TAP_MS
          && Math.hypot(endX - state.lastTapX, endY - state.lastTapY) <= LIGHTBOX_DOUBLE_TAP_DISTANCE
        );

        if (isDoubleTap) {
          clearTapState();
          toggleZoom(endX, endY);
          return;
        }

        state.lastTapTime = now;
        state.lastTapX = endX;
        state.lastTapY = endY;
        if (wasZoomed) applyZoomTransform(true);
        return;
      }

      clearTapState();

      if (wasZoomed) {
        applyZoomTransform(true);
        return;
      }

      if (gesture === 'horizontal') {
        if (getTotal() > 1 && Math.abs(deltaX) >= LIGHTBOX_NAV_SWIPE_THRESHOLD) {
          const width = image.clientWidth || Math.min(window.innerWidth * 0.92, maxWidth);
          const swipeSign = deltaX < 0 ? -1 : 1;
          if (peekImage.hidden) applyHorizontalPreview(deltaX);

          image.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
          image.style.transform = `translate3d(${Math.round(swipeSign * width)}px, 0, 0) scale(0.98)`;
          image.style.opacity = '0.6';

          if (!peekImage.hidden) {
            peekImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
            peekImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
            peekImage.style.opacity = '1';
          }

          window.setTimeout(() => {
            step(deltaX < 0 ? 1 : -1);
            clearSwipeStyles();
          }, LIGHTBOX_SWIPE_MS + 10);
          return;
        }

        animateSnapBack(deltaX);
        return;
      }

      const isCloseSwipe = (
        Math.abs(deltaY) >= LIGHTBOX_CLOSE_SWIPE_THRESHOLD
        && Math.abs(deltaY) > Math.abs(deltaX) * 1.1
      );

      if (isCloseSwipe) {
        close();
        return;
      }

      image.style.transition = 'transform 180ms ease';
      image.style.transform = 'translate3d(0, 0, 0) scale(1)';
      window.setTimeout(clearSwipeStyles, 220);
    }, { passive: true });

    image.addEventListener('touchcancel', () => {
      if (!state.touchActive) return;
      const wasZoomed = state.zoomed;
      const deltaX = state.touchLastX - state.touchStartX;
      clearTapState();
      resetGestureState();
      if (wasZoomed) {
        applyZoomTransform(true);
        return;
      }
      animateSnapBack(deltaX);
    }, { passive: true });

    image.addEventListener('dblclick', (event) => {
      event.preventDefault();
      clearTapState();
      toggleZoom(event.clientX, event.clientY);
    });

    window.addEventListener('keydown', (event) => {
      if (!state.open) return;
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'ArrowLeft') {
        step(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        step(1);
        return;
      }
      if (event.key === 'Tab') {
        const focusable = getFocusableElements();
        if (!focusable.length) {
          event.preventDefault();
          root.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    return {
      open,
      close,
      sync,
      isOpen() {
        return state.open;
      }
    };
  }

  window.createPortfolioLightbox = createPortfolioLightbox;
})();
