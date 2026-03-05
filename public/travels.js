(() => {
  const DATA_URL = '/data/travels.json';
  const CAROUSEL_SWIPE_THRESHOLD = 44;
  const LIGHTBOX_CLOSE_SWIPE_THRESHOLD = 96;
  const SWIPE_DIRECTION_LOCK_PX = 10;
  const LIGHTBOX_NAV_SWIPE_THRESHOLD = 56;
  const CAROUSEL_SWIPE_OUT_MS = 150;
  const CAROUSEL_SWIPE_IN_MS = 180;
  const LIGHTBOX_SWIPE_MS = 180;

  const elements = {
    tripList: document.getElementById('trip-list'),
    tripPrev: document.getElementById('trip-prev'),
    tripNext: document.getElementById('trip-next'),
    tripTitle: document.getElementById('trip-title'),
    tripSummary: document.getElementById('trip-summary'),
    heroImage: document.getElementById('hero-image'),
    heroButton: document.getElementById('hero-photo-button'),
    photoCount: document.getElementById('photo-count'),
    photoLocation: document.getElementById('photo-location'),
    photoPrev: document.getElementById('photo-prev'),
    photoNext: document.getElementById('photo-next'),
    mapTitle: document.getElementById('map-title'),
    mapFrame: document.getElementById('map-frame'),
    mapEmpty: document.getElementById('map-empty'),
    map: document.getElementById('travel-map'),
    stage: document.getElementById('trip-stage'),
    lightbox: document.getElementById('travel-lightbox'),
    lightboxImage: document.getElementById('travel-lightbox-image'),
    lightboxClose: document.getElementById('travel-lightbox-close'),
    lightboxPrev: document.getElementById('travel-lightbox-prev'),
    lightboxNext: document.getElementById('travel-lightbox-next'),
    lightboxIndicator: document.getElementById('travel-lightbox-indicator'),
    lightboxIndicatorTitle: document.getElementById('travel-lightbox-indicator-title'),
    lightboxIndicatorCount: document.getElementById('travel-lightbox-indicator-count')
  };

  const state = {
    trips: [],
    activeTripIndex: 0,
    activePhotoIndex: 0,
    map: null,
    tileLayer: null,
    markers: [],
    markerLayer: null,
    lightboxOpen: false,
    lightboxPreviouslyFocused: null
  };

  const heroSwipeState = {
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

  const lightboxSwipeState = {
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    gesture: null,
    previewIndex: -1
  };

  const heroPreviewImage = (elements.heroButton && elements.heroImage)
    ? (() => {
      const preview = document.createElement('img');
      preview.className = 'hero-image hero-image-preview';
      preview.alt = '';
      preview.decoding = 'async';
      preview.loading = 'eager';
      preview.draggable = false;
      preview.hidden = true;
      preview.setAttribute('aria-hidden', 'true');
      elements.heroButton.append(preview);
      return preview;
    })()
    : null;

  const lightboxPeekImage = (elements.lightbox && elements.lightboxImage)
    ? (() => {
      const preview = document.createElement('img');
      preview.className = 'travel-lightbox-image travel-lightbox-peek-image';
      preview.alt = '';
      preview.decoding = 'async';
      preview.loading = 'eager';
      preview.draggable = false;
      preview.hidden = true;
      preview.setAttribute('aria-hidden', 'true');
      elements.lightbox.append(preview);
      return preview;
    })()
    : null;

  function formatDateRange(dateStart, dateEnd) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric'
    });
    const start = new Date(`${dateStart}T00:00:00`);
    const end = new Date(`${dateEnd}T00:00:00`);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return '';
    const startLabel = formatter.format(start);
    const endLabel = formatter.format(end);
    return startLabel === endLabel ? startLabel : `${startLabel} to ${endLabel}`;
  }

  function getTrip(index = state.activeTripIndex) {
    return state.trips[index] || null;
  }

  function getPhoto(index = state.activePhotoIndex) {
    const trip = getTrip();
    return trip && trip.photos[index] ? trip.photos[index] : null;
  }

  function wrapIndex(index, total) {
    return ((index % total) + total) % total;
  }

  function getPhotoCountLabel(index = state.activePhotoIndex, trip = getTrip()) {
    if (!trip || !trip.photos.length) return '';
    return `${wrapIndex(index, trip.photos.length) + 1} / ${trip.photos.length}`;
  }

  function getLightboxTitle(photo, trip) {
    const preferred = String(photo && photo.location_name ? photo.location_name : '').trim();
    if (preferred) return preferred;
    const fallback = String(trip && trip.title ? trip.title : '').trim();
    return fallback || 'Travel photo';
  }

  function updateLightboxIndicatorLayout() {
    if (!elements.lightboxIndicator || elements.lightboxIndicator.hidden) return;
    elements.lightboxIndicator.classList.remove('is-stacked');
    window.requestAnimationFrame(() => {
      if (!state.lightboxOpen || !elements.lightboxIndicator || elements.lightboxIndicator.hidden) return;
      elements.lightboxIndicator.classList.remove('is-stacked');
      if (elements.lightboxIndicator.scrollWidth > elements.lightboxIndicator.clientWidth + 1) {
        elements.lightboxIndicator.classList.add('is-stacked');
      }
    });
  }

  function hideHeroPreviewImage() {
    if (!heroPreviewImage) return;
    heroSwipeState.previewIndex = -1;
    heroPreviewImage.hidden = true;
    heroPreviewImage.removeAttribute('src');
    heroPreviewImage.style.transition = '';
    heroPreviewImage.style.transform = '';
    heroPreviewImage.style.opacity = '';
  }

  function clearHeroSwipeStyles() {
    if (!elements.heroImage) return;
    elements.heroImage.style.transition = '';
    elements.heroImage.style.transform = '';
    elements.heroImage.style.opacity = '';
    hideHeroPreviewImage();
  }

  function setHeroPreviewImage(previewIndex) {
    const trip = getTrip();
    if (!trip || !heroPreviewImage) return;
    if (heroSwipeState.previewIndex === previewIndex && !heroPreviewImage.hidden) return;
    const previewPhoto = trip.photos[previewIndex];
    if (!previewPhoto) return;
    heroSwipeState.previewIndex = previewIndex;
    heroPreviewImage.src = previewPhoto.src;
    heroPreviewImage.hidden = false;
  }

  function applyHeroDragPreview(deltaX) {
    const trip = getTrip();
    if (!trip || trip.photos.length <= 1 || !elements.heroImage || !elements.heroButton || !heroPreviewImage) return;
    const width = elements.heroButton.clientWidth || elements.heroImage.clientWidth || 220;
    const swipeSign = deltaX < 0 ? -1 : 1;
    const direction = swipeSign < 0 ? 1 : -1;
    const previewIndex = wrapIndex(state.activePhotoIndex + direction, trip.photos.length);
    setHeroPreviewImage(previewIndex);

    const scale = Math.max(0.98, 1 - (Math.abs(deltaX) / 1800));
    const opacity = Math.max(0.72, 1 - (Math.abs(deltaX) / 420));
    elements.heroImage.style.transition = 'none';
    elements.heroImage.style.transform = `translate3d(${deltaX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(3)})`;
    elements.heroImage.style.opacity = opacity.toFixed(3);

    const previewX = deltaX - (swipeSign * width);
    heroPreviewImage.style.transition = 'none';
    heroPreviewImage.style.transform = `translate3d(${previewX.toFixed(2)}px, 0, 0) scale(1)`;
    heroPreviewImage.style.opacity = '0.98';
  }

  function animateHeroSnapBack(deltaX = 0) {
    if (!elements.heroImage || !elements.heroButton) return;
    const width = elements.heroButton.clientWidth || elements.heroImage.clientWidth || 220;
    const swipeSign = deltaX < 0 ? -1 : 1;
    if (heroPreviewImage && !heroPreviewImage.hidden) {
      heroPreviewImage.style.transition = `transform ${CAROUSEL_SWIPE_IN_MS}ms ease, opacity ${CAROUSEL_SWIPE_IN_MS}ms ease`;
      heroPreviewImage.style.transform = `translate3d(${Math.round(-swipeSign * width)}px, 0, 0) scale(1)`;
      heroPreviewImage.style.opacity = '0';
    }
    elements.heroImage.style.transition = `transform ${CAROUSEL_SWIPE_IN_MS}ms ease, opacity ${CAROUSEL_SWIPE_IN_MS}ms ease`;
    elements.heroImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
    elements.heroImage.style.opacity = '1';
    window.setTimeout(clearHeroSwipeStyles, CAROUSEL_SWIPE_IN_MS + 25);
  }

  function commitHeroSwipe(direction) {
    const trip = getTrip();
    if (!trip || trip.photos.length <= 1 || !elements.heroImage || !elements.heroButton) return false;
    if (heroSwipeState.animating) return false;
    if (direction !== 1 && direction !== -1) return false;
    const width = elements.heroButton.clientWidth || elements.heroImage.clientWidth || 220;
    const swipeSign = direction === 1 ? -1 : 1;

    if (heroPreviewImage && heroPreviewImage.hidden) {
      setHeroPreviewImage(wrapIndex(state.activePhotoIndex + direction, trip.photos.length));
    }

    heroSwipeState.animating = true;
    elements.heroImage.style.transition = `transform ${CAROUSEL_SWIPE_OUT_MS}ms ease, opacity ${CAROUSEL_SWIPE_OUT_MS}ms ease`;
    elements.heroImage.style.transform = `translate3d(${Math.round(swipeSign * width)}px, 0, 0) scale(0.98)`;
    elements.heroImage.style.opacity = '0.58';
    if (heroPreviewImage) {
      heroPreviewImage.style.transition = `transform ${CAROUSEL_SWIPE_OUT_MS}ms ease, opacity ${CAROUSEL_SWIPE_OUT_MS}ms ease`;
      heroPreviewImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
      heroPreviewImage.style.opacity = '1';
    }

    window.setTimeout(() => {
      setActivePhoto(state.activePhotoIndex + direction);
      heroSwipeState.animating = false;
      clearHeroSwipeStyles();
    }, CAROUSEL_SWIPE_OUT_MS + 10);

    elements.heroButton.dataset.suppressLightboxUntil = String(Date.now() + 500);
    return true;
  }

  function handleHeroSwipe(deltaX, deltaY, options = {}) {
    const { ignoreVertical = false, preferDirection = 0 } = options;
    if (preferDirection === 1 || preferDirection === -1) {
      return commitHeroSwipe(preferDirection);
    }

    if (Math.abs(deltaX) < CAROUSEL_SWIPE_THRESHOLD) return false;
    if (!ignoreVertical) {
      if (Math.abs(deltaY) > 72) return false;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) return false;
    }
    return commitHeroSwipe(deltaX < 0 ? 1 : -1);
  }

  function hideLightboxPreviewImage() {
    if (!lightboxPeekImage) return;
    lightboxSwipeState.previewIndex = -1;
    lightboxPeekImage.hidden = true;
    lightboxPeekImage.removeAttribute('src');
    lightboxPeekImage.style.transition = '';
    lightboxPeekImage.style.transform = '';
    lightboxPeekImage.style.opacity = '';
  }

  function clearLightboxSwipeStyles() {
    if (!elements.lightboxImage) return;
    elements.lightboxImage.style.transition = '';
    elements.lightboxImage.style.transform = '';
    elements.lightboxImage.style.opacity = '';
    hideLightboxPreviewImage();
  }

  function resetLightboxGestureState() {
    lightboxSwipeState.active = false;
    lightboxSwipeState.startX = 0;
    lightboxSwipeState.startY = 0;
    lightboxSwipeState.lastX = 0;
    lightboxSwipeState.lastY = 0;
    lightboxSwipeState.gesture = null;
    lightboxSwipeState.previewIndex = -1;
  }

  function setLightboxPreviewImage(previewIndex) {
    const trip = getTrip();
    if (!trip || !lightboxPeekImage) return;
    if (lightboxSwipeState.previewIndex === previewIndex && !lightboxPeekImage.hidden) return;
    const previewPhoto = trip.photos[previewIndex];
    if (!previewPhoto) return;
    lightboxSwipeState.previewIndex = previewIndex;
    lightboxPeekImage.src = previewPhoto.src;
    lightboxPeekImage.hidden = false;
  }

  function applyLightboxHorizontalPreview(deltaX) {
    const trip = getTrip();
    if (!trip || trip.photos.length <= 1 || !elements.lightboxImage || !lightboxPeekImage) return;
    const width = elements.lightboxImage.clientWidth || Math.min(window.innerWidth * 0.92, 1220);
    const swipeSign = deltaX < 0 ? -1 : 1;
    const direction = swipeSign < 0 ? 1 : -1;
    const previewIndex = wrapIndex(state.activePhotoIndex + direction, trip.photos.length);
    setLightboxPreviewImage(previewIndex);

    const scale = Math.max(0.95, 1 - (Math.abs(deltaX) / 2400));
    elements.lightboxImage.style.transform = `translate3d(${deltaX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(3)})`;
    lightboxPeekImage.style.transition = 'none';
    lightboxPeekImage.style.transform = `translate3d(${(deltaX - (swipeSign * width)).toFixed(2)}px, 0, 0) scale(1)`;
    lightboxPeekImage.style.opacity = '1';
  }

  function animateLightboxSnapBack(deltaX = 0) {
    if (!elements.lightboxImage) return;
    const width = elements.lightboxImage.clientWidth || Math.min(window.innerWidth * 0.92, 1220);
    const swipeSign = deltaX < 0 ? -1 : 1;

    if (lightboxPeekImage && !lightboxPeekImage.hidden) {
      lightboxPeekImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
      lightboxPeekImage.style.transform = `translate3d(${Math.round(-swipeSign * width)}px, 0, 0) scale(1)`;
      lightboxPeekImage.style.opacity = '0';
    }

    elements.lightboxImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease`;
    elements.lightboxImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
    window.setTimeout(clearLightboxSwipeStyles, LIGHTBOX_SWIPE_MS + 25);
  }

  function setMapFallback(message) {
    if (!elements.mapEmpty || !elements.mapFrame) return;
    elements.mapEmpty.hidden = false;
    elements.mapFrame.classList.add('is-unavailable');
  }

  function clearMapFallback() {
    if (!elements.mapEmpty || !elements.mapFrame) return;
    elements.mapEmpty.hidden = true;
    elements.mapFrame.classList.remove('is-unavailable');
  }

  function ensureMap() {
    if (state.map || !elements.map || !window.L) return;

    state.map = window.L.map(elements.map, {
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: true,
      touchZoom: true,
      tap: true,
      attributionControl: true
    });

    state.tileLayer = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    });
    state.tileLayer.on('tileerror', () => {
      setMapFallback('Map tiles unavailable');
    });
    state.tileLayer.addTo(state.map);

    state.markerLayer = window.L.layerGroup().addTo(state.map);
    window.L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  }

  function updateMarkerSelection() {
    const activePhoto = getPhoto();
    for (const entry of state.markers) {
      const isActive = activePhoto && entry.photo.id === activePhoto.id;
      entry.marker.setStyle({
        radius: isActive ? 10 : 7,
        weight: isActive ? 2.5 : 1.5,
        color: isActive ? '#ffe39a' : 'rgba(255,255,255,0.68)',
        fillColor: isActive ? '#ff8f7a' : '#7bc7ff',
        fillOpacity: isActive ? 1 : 0.78
      });
      if (isActive) {
        entry.marker.bringToFront();
      }
    }
  }

  function renderMap() {
    const trip = getTrip();
    if (!trip) return;

    if (!window.L) {
      setMapFallback('Map library unavailable');
      return;
    }

    ensureMap();
    clearMapFallback();

    const validPhotos = trip.photos.filter((photo) => Number.isFinite(photo.lat) && Number.isFinite(photo.lng));
    if (!validPhotos.length) {
      setMapFallback('No map points for this trip');
      if (state.markerLayer) state.markerLayer.clearLayers();
      state.markers = [];
      return;
    }

    if (!state.markerLayer || !state.map) return;

    state.markerLayer.clearLayers();
    state.markers = validPhotos.map((photo) => {
      const marker = window.L.circleMarker([photo.lat, photo.lng], {
        radius: 7,
        weight: 1.5,
        color: 'rgba(255,255,255,0.68)',
        fillColor: '#7bc7ff',
        fillOpacity: 0.78
      });

      marker.bindTooltip(photo.location_name, {
        direction: 'top',
        offset: [0, -8],
        opacity: 0.92
      });

      marker.on('click', () => {
        const index = trip.photos.findIndex((entry) => entry.id === photo.id);
        if (index >= 0) setActivePhoto(index);
      });

      marker.addTo(state.markerLayer);
      return { marker, photo };
    });

    const bounds = window.L.latLngBounds(validPhotos.map((photo) => [photo.lat, photo.lng]));
    if (bounds.isValid()) {
      state.map.fitBounds(bounds, {
        padding: [24, 24],
        maxZoom: 11
      });
    }

    window.setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 120);

    updateMarkerSelection();
  }

  function updateTripListAlignment() {
    if (!elements.tripList) return;

    const hasOverflow = elements.tripList.scrollWidth > (elements.tripList.clientWidth + 1);
    elements.tripList.classList.toggle('is-centered', !hasOverflow);
    if (!hasOverflow) elements.tripList.scrollLeft = 0;
  }

  function renderTripList() {
    if (!elements.tripList) return;

    elements.tripList.innerHTML = '';

    state.trips.forEach((trip, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'trip-card';
      if (index === state.activeTripIndex) button.classList.add('is-active');
      button.setAttribute('aria-pressed', index === state.activeTripIndex ? 'true' : 'false');
      button.innerHTML = `
        <img class="trip-card-image" src="${trip.cover_image}" alt="${trip.title} cover image" />
        <span class="trip-card-copy">
          <span class="trip-card-title">${trip.title}</span>
          <span class="trip-card-date">${formatDateRange(trip.date_start, trip.date_end)}</span>
        </span>
      `;
      button.addEventListener('click', () => {
        setActiveTrip(index);
      });
      elements.tripList.append(button);
    });

    window.requestAnimationFrame(updateTripListAlignment);

    const activeCard = elements.tripList.querySelector('.trip-card.is-active');
    if (activeCard instanceof HTMLElement) {
      activeCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }

  function syncPhoto() {
    const photo = getPhoto();
    const trip = getTrip();
    if (!trip || !photo) return;

    if (elements.tripTitle) elements.tripTitle.textContent = trip.title;
    if (elements.tripSummary) {
      const summary = (trip.summary || '').trim();
      elements.tripSummary.textContent = summary;
      elements.tripSummary.hidden = !summary;
    }

    if (elements.heroImage) {
      elements.heroImage.src = photo.src;
      elements.heroImage.alt = photo.alt;
    }
    if (elements.heroButton) {
      elements.heroButton.setAttribute('aria-label', `Open enlarged photo from ${photo.location_name}`);
    }
    if (elements.photoCount) {
      elements.photoCount.textContent = getPhotoCountLabel();
    }
    if (elements.photoLocation) elements.photoLocation.textContent = photo.location_name;
    if (elements.mapTitle) elements.mapTitle.textContent = photo.location_name;

    updateMarkerSelection();

    if (state.lightboxOpen) syncLightbox();
  }

  function setActivePhoto(index) {
    const trip = getTrip();
    if (!trip || !trip.photos.length) return;
    state.activePhotoIndex = wrapIndex(index, trip.photos.length);
    syncPhoto();
  }

  function setActiveTrip(index) {
    state.activeTripIndex = wrapIndex(index, state.trips.length);
    state.activePhotoIndex = 0;
    renderTripList();
    renderMap();
    syncPhoto();
  }

  function openLightbox() {
    const photo = getPhoto();
    const trip = getTrip();
    if (!photo || !trip || !elements.lightbox || !elements.lightboxImage) return;

    state.lightboxPreviouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.lightboxOpen = true;
    elements.lightbox.classList.add('is-open');
    elements.lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
    syncLightbox();
    if (elements.lightboxClose) elements.lightboxClose.focus();
  }

  function syncLightbox() {
    const photo = getPhoto();
    const trip = getTrip();
    if (!state.lightboxOpen || !photo || !trip || !elements.lightboxImage) return;

    clearLightboxSwipeStyles();
    elements.lightboxImage.src = photo.src;
    elements.lightboxImage.alt = photo.alt;
    if (elements.lightboxIndicator) {
      if (elements.lightboxIndicatorTitle) {
        elements.lightboxIndicatorTitle.textContent = getLightboxTitle(photo, trip);
      }
      if (elements.lightboxIndicatorCount) {
        elements.lightboxIndicatorCount.textContent = getPhotoCountLabel();
      }
      elements.lightboxIndicator.hidden = false;
      updateLightboxIndicatorLayout();
    }
  }

  function closeLightbox() {
    if (!elements.lightbox || !elements.lightboxImage) return;
    state.lightboxOpen = false;
    elements.lightbox.classList.remove('is-open');
    elements.lightbox.setAttribute('aria-hidden', 'true');
    clearLightboxSwipeStyles();
    elements.lightboxImage.removeAttribute('src');
    elements.lightboxImage.removeAttribute('alt');
    document.body.classList.remove('lightbox-open');
    if (elements.lightboxIndicator) {
      elements.lightboxIndicator.hidden = true;
      elements.lightboxIndicator.classList.remove('is-stacked');
    }
    resetLightboxGestureState();
    if (state.lightboxPreviouslyFocused && typeof state.lightboxPreviouslyFocused.focus === 'function') {
      state.lightboxPreviouslyFocused.focus();
    }
    state.lightboxPreviouslyFocused = null;
  }

  function showEmptyState(message) {
    if (!elements.stage) return;
    elements.stage.innerHTML = `
      <div class="empty-state">
        <p>${message}</p>
        <span>Update <code>/public/data/travels.json</code> with trip data and images to populate this page.</span>
      </div>
    `;
  }

  async function loadTrips() {
    try {
      const response = await fetch(DATA_URL, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const payload = await response.json();
      const trips = Array.isArray(payload.trips) ? payload.trips : [];

      state.trips = trips
        .filter((trip) => trip && typeof trip === 'object' && Array.isArray(trip.photos) && trip.photos.length)
        .map((trip) => ({
          ...trip,
          photos: trip.photos.filter((photo) => photo && photo.src && photo.location_name)
        }))
        .filter((trip) => trip.photos.length)
        .sort((left, right) => String(left.date_start).localeCompare(String(right.date_start)));

      if (!state.trips.length) {
        showEmptyState('No trips are available yet.');
        return;
      }

      renderTripList();
      renderMap();
      syncPhoto();
    } catch (_error) {
      showEmptyState('Travel data could not be loaded.');
    }
  }

  if (elements.photoPrev) {
    elements.photoPrev.addEventListener('click', () => setActivePhoto(state.activePhotoIndex - 1));
  }

  if (elements.photoNext) {
    elements.photoNext.addEventListener('click', () => setActivePhoto(state.activePhotoIndex + 1));
  }

  if (elements.tripPrev) {
    elements.tripPrev.addEventListener('click', () => {
      if (!state.trips.length) return;
      setActiveTrip(state.activeTripIndex - 1);
    });
  }

  if (elements.tripNext) {
    elements.tripNext.addEventListener('click', () => {
      if (!state.trips.length) return;
      setActiveTrip(state.activeTripIndex + 1);
    });
  }

  if (elements.heroButton) {
    elements.heroButton.addEventListener('click', (event) => {
      const suppressUntil = Number(elements.heroButton.dataset.suppressLightboxUntil || 0);
      if (Number.isFinite(suppressUntil) && suppressUntil > Date.now()) {
        event.preventDefault();
        return;
      }
      openLightbox();
    });
  }

  if (elements.lightboxClose) {
    elements.lightboxClose.addEventListener('click', closeLightbox);
  }

  if (elements.lightboxPrev) {
    elements.lightboxPrev.addEventListener('click', (event) => {
      event.preventDefault();
      setActivePhoto(state.activePhotoIndex - 1);
    });
  }

  if (elements.lightboxNext) {
    elements.lightboxNext.addEventListener('click', (event) => {
      event.preventDefault();
      setActivePhoto(state.activePhotoIndex + 1);
    });
  }

  if (elements.lightbox) {
    elements.lightbox.addEventListener('click', (event) => {
      if (event.target === elements.lightbox) closeLightbox();
    });
  }

  if (elements.heroButton && elements.heroImage) {
    elements.heroButton.addEventListener('touchstart', (event) => {
      const trip = getTrip();
      if (!trip || trip.photos.length <= 1 || heroSwipeState.animating) return;
      const touch = event.touches[0];
      if (!touch) return;
      heroSwipeState.active = true;
      heroSwipeState.startX = touch.clientX;
      heroSwipeState.startY = touch.clientY;
      heroSwipeState.lastX = touch.clientX;
      heroSwipeState.lastY = touch.clientY;
      heroSwipeState.gesture = null;
      heroSwipeState.intentDirection = 0;
    }, { passive: true });

    elements.heroButton.addEventListener('touchmove', (event) => {
      if (!heroSwipeState.active || heroSwipeState.animating) return;
      const touch = event.touches[0];
      if (!touch) return;
      heroSwipeState.lastX = touch.clientX;
      heroSwipeState.lastY = touch.clientY;
      const deltaX = touch.clientX - heroSwipeState.startX;
      const deltaY = touch.clientY - heroSwipeState.startY;

      if (!heroSwipeState.gesture) {
        if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK_PX && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK_PX) return;
        heroSwipeState.gesture = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? 'horizontal' : 'vertical';
      }

      if (heroSwipeState.gesture === 'horizontal') {
        event.preventDefault();
        applyHeroDragPreview(deltaX * 0.96);
        if (Math.abs(deltaX) >= CAROUSEL_SWIPE_THRESHOLD) {
          heroSwipeState.intentDirection = deltaX < 0 ? 1 : -1;
        }
      }
    }, { passive: false });

    elements.heroButton.addEventListener('touchend', (event) => {
      if (!heroSwipeState.active || heroSwipeState.animating) return;
      const touch = event.changedTouches[0];
      const endX = touch ? touch.clientX : heroSwipeState.lastX;
      const endY = touch ? touch.clientY : heroSwipeState.lastY;
      const deltaX = endX - heroSwipeState.startX;
      const deltaY = endY - heroSwipeState.startY;
      const isHorizontalGesture = heroSwipeState.gesture === 'horizontal';
      const intentDirection = heroSwipeState.intentDirection;
      heroSwipeState.active = false;
      heroSwipeState.gesture = null;
      heroSwipeState.intentDirection = 0;

      if (!isHorizontalGesture) {
        clearHeroSwipeStyles();
        return;
      }

      let didCommit = handleHeroSwipe(deltaX, deltaY, { ignoreVertical: true });
      if (!didCommit && (intentDirection === 1 || intentDirection === -1)) {
        didCommit = handleHeroSwipe(deltaX, deltaY, { preferDirection: intentDirection });
      }
      if (!didCommit) {
        elements.heroButton.dataset.suppressLightboxUntil = String(Date.now() + 320);
        animateHeroSnapBack(deltaX);
      }
    }, { passive: true });

    elements.heroButton.addEventListener('touchcancel', () => {
      if (heroSwipeState.animating) return;
      heroSwipeState.active = false;
      heroSwipeState.gesture = null;
      heroSwipeState.intentDirection = 0;
      animateHeroSnapBack(heroSwipeState.lastX - heroSwipeState.startX);
    }, { passive: true });
  }

  if (elements.lightbox && elements.lightboxImage) {
    elements.lightboxImage.addEventListener('touchstart', (event) => {
      if (!elements.lightbox.classList.contains('is-open')) return;
      if (event.touches.length > 1) {
        resetLightboxGestureState();
        clearLightboxSwipeStyles();
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      lightboxSwipeState.active = true;
      lightboxSwipeState.startX = touch.clientX;
      lightboxSwipeState.startY = touch.clientY;
      lightboxSwipeState.lastX = touch.clientX;
      lightboxSwipeState.lastY = touch.clientY;
      lightboxSwipeState.gesture = null;
      elements.lightboxImage.style.transition = 'none';
    }, { passive: true });

    elements.lightboxImage.addEventListener('touchmove', (event) => {
      if (event.touches.length > 1) {
        resetLightboxGestureState();
        clearLightboxSwipeStyles();
        return;
      }
      if (!lightboxSwipeState.active) return;
      const touch = event.touches[0];
      if (!touch) return;
      lightboxSwipeState.lastX = touch.clientX;
      lightboxSwipeState.lastY = touch.clientY;
      const deltaX = touch.clientX - lightboxSwipeState.startX;
      const deltaY = touch.clientY - lightboxSwipeState.startY;

      if (!lightboxSwipeState.gesture) {
        if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK_PX && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK_PX) return;
        lightboxSwipeState.gesture = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? 'horizontal' : 'vertical';
      }

      if (lightboxSwipeState.gesture === 'horizontal') {
        event.preventDefault();
        applyLightboxHorizontalPreview(deltaX);
        return;
      }

      event.preventDefault();
      const absY = Math.abs(deltaY);
      const scale = Math.max(0.92, 1 - (absY / 1200));
      elements.lightboxImage.style.transform = `translate3d(0, ${deltaY}px, 0) scale(${scale.toFixed(3)})`;
    }, { passive: false });

    elements.lightboxImage.addEventListener('touchend', (event) => {
      if (!lightboxSwipeState.active) return;
      const touch = event.changedTouches[0];
      const endX = touch ? touch.clientX : lightboxSwipeState.lastX;
      const endY = touch ? touch.clientY : lightboxSwipeState.lastY;
      const deltaX = endX - lightboxSwipeState.startX;
      const deltaY = endY - lightboxSwipeState.startY;
      const gesture = lightboxSwipeState.gesture;
      resetLightboxGestureState();

      if (gesture === 'horizontal') {
        const trip = getTrip();
        const hasCarousel = !!(trip && trip.photos.length > 1);
        if (hasCarousel && Math.abs(deltaX) >= LIGHTBOX_NAV_SWIPE_THRESHOLD) {
          const width = elements.lightboxImage.clientWidth || Math.min(window.innerWidth * 0.92, 1220);
          const swipeSign = deltaX < 0 ? -1 : 1;
          if (lightboxPeekImage && lightboxPeekImage.hidden) {
            applyLightboxHorizontalPreview(deltaX);
          }

          elements.lightboxImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
          elements.lightboxImage.style.transform = `translate3d(${Math.round(swipeSign * width)}px, 0, 0) scale(0.98)`;
          elements.lightboxImage.style.opacity = '0.6';

          if (lightboxPeekImage && !lightboxPeekImage.hidden) {
            lightboxPeekImage.style.transition = `transform ${LIGHTBOX_SWIPE_MS}ms ease, opacity ${LIGHTBOX_SWIPE_MS}ms ease`;
            lightboxPeekImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
            lightboxPeekImage.style.opacity = '1';
          }

          window.setTimeout(() => {
            setActivePhoto(state.activePhotoIndex + (deltaX < 0 ? 1 : -1));
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

      elements.lightboxImage.style.transition = 'transform 180ms ease';
      elements.lightboxImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
      window.setTimeout(clearLightboxSwipeStyles, 220);
    }, { passive: true });

    elements.lightboxImage.addEventListener('touchcancel', () => {
      if (!lightboxSwipeState.active) return;
      const deltaX = lightboxSwipeState.lastX - lightboxSwipeState.startX;
      resetLightboxGestureState();
      animateLightboxSnapBack(deltaX);
    }, { passive: true });
  }

  window.addEventListener('keydown', (event) => {
    if (!state.trips.length) return;

    if (state.lightboxOpen && event.key === 'Escape') {
      closeLightbox();
      return;
    }

    if (event.key === 'ArrowLeft') {
      setActivePhoto(state.activePhotoIndex - 1);
    } else if (event.key === 'ArrowRight') {
      setActivePhoto(state.activePhotoIndex + 1);
    }
  });

  window.addEventListener('resize', () => {
    updateTripListAlignment();
    if (state.map) state.map.invalidateSize();
    if (state.lightboxOpen) updateLightboxIndicatorLayout();
  }, { passive: true });

  loadTrips();
})();
