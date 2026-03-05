(() => {
  const DATA_URL = '/data/travels.json';
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
    mapStatus: document.getElementById('map-status'),
    mapFrame: document.getElementById('map-frame'),
    mapEmpty: document.getElementById('map-empty'),
    map: document.getElementById('travel-map'),
    stage: document.getElementById('trip-stage'),
    lightbox: document.getElementById('travel-lightbox'),
    lightboxImage: document.getElementById('travel-lightbox-image'),
    lightboxClose: document.getElementById('travel-lightbox-close'),
    lightboxPrev: document.getElementById('travel-lightbox-prev'),
    lightboxNext: document.getElementById('travel-lightbox-next'),
    lightboxIndicator: document.getElementById('travel-lightbox-indicator')
  };

  const state = {
    trips: [],
    activeTripIndex: 0,
    activePhotoIndex: 0,
    map: null,
    tileLayer: null,
    markers: [],
    markerLayer: null,
    lightboxOpen: false
  };

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

  function setMapFallback(message) {
    if (!elements.mapEmpty || !elements.mapFrame || !elements.mapStatus) return;
    elements.mapStatus.textContent = message;
    elements.mapEmpty.hidden = false;
    elements.mapFrame.classList.add('is-unavailable');
  }

  function clearMapFallback(statusText) {
    if (!elements.mapEmpty || !elements.mapFrame || !elements.mapStatus) return;
    elements.mapEmpty.hidden = true;
    elements.mapFrame.classList.remove('is-unavailable');
    elements.mapStatus.textContent = statusText;
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
    clearMapFallback('Map synced to current photo');

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
    if (elements.photoCount) {
      elements.photoCount.textContent = `${state.activePhotoIndex + 1} / ${trip.photos.length}`;
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

    state.lightboxOpen = true;
    elements.lightbox.classList.add('is-open');
    elements.lightbox.setAttribute('aria-hidden', 'false');
    elements.lightboxImage.src = photo.src;
    elements.lightboxImage.alt = photo.alt;
    document.body.classList.add('lightbox-open');
    syncLightbox();
    if (elements.lightboxClose) elements.lightboxClose.focus();
  }

  function syncLightbox() {
    const photo = getPhoto();
    const trip = getTrip();
    if (!state.lightboxOpen || !photo || !trip || !elements.lightboxImage) return;

    elements.lightboxImage.src = photo.src;
    elements.lightboxImage.alt = photo.alt;
    if (elements.lightboxIndicator) {
      elements.lightboxIndicator.textContent = `${trip.title} • ${state.activePhotoIndex + 1} / ${trip.photos.length}`;
    }
  }

  function closeLightbox() {
    if (!elements.lightbox || !elements.lightboxImage) return;
    state.lightboxOpen = false;
    elements.lightbox.classList.remove('is-open');
    elements.lightbox.setAttribute('aria-hidden', 'true');
    elements.lightboxImage.removeAttribute('src');
    elements.lightboxImage.removeAttribute('alt');
    document.body.classList.remove('lightbox-open');
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
    elements.heroButton.addEventListener('click', openLightbox);
  }

  if (elements.lightboxClose) {
    elements.lightboxClose.addEventListener('click', closeLightbox);
  }

  if (elements.lightboxPrev) {
    elements.lightboxPrev.addEventListener('click', () => setActivePhoto(state.activePhotoIndex - 1));
  }

  if (elements.lightboxNext) {
    elements.lightboxNext.addEventListener('click', () => setActivePhoto(state.activePhotoIndex + 1));
  }

  if (elements.lightbox) {
    elements.lightbox.addEventListener('click', (event) => {
      if (event.target === elements.lightbox) closeLightbox();
    });
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
  }, { passive: true });

  loadTrips();
})();
