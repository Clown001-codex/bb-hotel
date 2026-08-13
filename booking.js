document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  const checkinDate = document.getElementById('checkinDate');
  const checkinTime = document.getElementById('checkinTime');
  const checkoutDate = document.getElementById('checkoutDate');
  const checkoutTime = document.getElementById('checkoutTime');
  const guests = document.getElementById('guests');
  const rooms = document.getElementById('rooms');
  const roomOptions = document.getElementById('roomOptions');
  const availabilityNote = document.getElementById('availabilityNote');
  const summaryText = document.getElementById('summaryText');
  const totalText = document.getElementById('totalText');
  const message = document.getElementById('bookingMessage');

  let roomData = [];
  let selectedRoomId = null;

  // The booking system runs on Node/Express at port 3000.
  // This also lets the frontend work if you preview it with Live Server.
  const API_BASE = (() => {
    const host = window.location.hostname;
    const port = window.location.port;
    const localHost = host === 'localhost' || host === '127.0.0.1';
    return localHost && port && port !== '3000'
      ? 'http://localhost:3000'
      : '';
  })();

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const preview = (await response.text()).slice(0, 120);
      throw new Error(
        'The hotel booking server did not return JSON. Start BB Hotel with "npm start" and open http://localhost:3000. ' +
        (preview ? `Server response: ${preview}` : '')
      );
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  const today = new Date();
  const todayString = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-');
  checkinDate.min = todayString;
  checkoutDate.min = todayString;

  function localDateTime(date, time) {
    return new Date(`${date}T${time}`);
  }

  function nights() {
    if (!checkinDate.value || !checkoutDate.value) return 0;
    const start = localDateTime(checkinDate.value, checkinTime.value);
    const end = localDateTime(checkoutDate.value, checkoutTime.value);
    const diff = end - start;
    return diff > 0 ? Math.ceil(diff / 86400000) : 0;
  }

  function money(value) {
    return new Intl.NumberFormat('en-NG', { style:'currency', currency:'NGN', maximumFractionDigits:0 }).format(value);
  }

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `booking-message ${type}`;
    message.style.display = 'block';
  }

  function hideMessage() {
    message.style.display = 'none';
  }

  function updateSummary() {
    const n = nights();
    const room = roomData.find(r => r.id === selectedRoomId);
    const roomCount = Number(rooms.value || 1);

    if (!n || !room) {
      summaryText.textContent = 'Select your dates and room';
      totalText.textContent = '₦0';
      return;
    }

    summaryText.textContent = `${n} night${n === 1 ? '' : 's'} · ${room.name} · ${roomCount} room${roomCount === 1 ? '' : 's'}`;
    totalText.textContent = money(room.price_per_night * n * roomCount);
  }

  function renderRooms() {
    const roomCount = Number(rooms.value || 1);
    const guestCount = Number(guests.value || 1);

    roomOptions.innerHTML = roomData.map(room => {
      const available = room.available >= roomCount;
      const suitable = room.suitableForGuests !== false;
      const canBook = available && suitable;
      const selected = Number(room.id) === Number(selectedRoomId) && canBook;

      let note = `${room.available} available`;
      if (!suitable) note = `Up to ${room.max_guests} guests per room`;
      if (!available) note = 'Not enough rooms for these dates';

      return `<button type="button" class="room-option ${selected ? 'selected' : ''} ${canBook ? '' : 'unavailable'}" data-room-id="${room.id}" ${canBook ? '' : 'disabled'}>
        <small>${room.name}</small>
        <strong>${money(room.price_per_night)} / night</strong>
        <small>${note}</small>
      </button>`;
    }).join('');

    if (!selectedRoomId || !roomData.some(r => Number(r.id) === Number(selectedRoomId) && r.available >= roomCount && r.suitableForGuests !== false)) {
      const first = roomData.find(r => r.available >= roomCount && r.suitableForGuests !== false);
      selectedRoomId = first ? first.id : null;
    }

    roomOptions.querySelectorAll('[data-room-id]').forEach(button => {
      button.addEventListener('click', () => {
        selectedRoomId = Number(button.dataset.roomId);
        renderRooms();
        updateSummary();
      });
    });

    const hasDates = checkinDate.value && checkoutDate.value;
    if (hasDates) {
      const availableCount = roomData.filter(r => r.available >= roomCount && r.suitableForGuests !== false).length;
      availabilityNote.textContent = availableCount ? 'Rooms shown below are available for your selected stay.' : 'No room type has enough availability for your selected stay.';
      availabilityNote.className = `availability-note ${availableCount ? 'ok' : 'bad'}`;
    } else {
      availabilityNote.textContent = 'Choose your dates to check availability.';
      availabilityNote.className = 'availability-note';
    }
  }

  async function loadAvailability() {
    hideMessage();
    if (!checkinDate.value || !checkoutDate.value) {
      roomData = [];
      roomOptions.innerHTML = '<div class="availability-note">Choose your dates to see available rooms.</div>';
      updateSummary();
      return;
    }

    const start = localDateTime(checkinDate.value, checkinTime.value);
    const end = localDateTime(checkoutDate.value, checkoutTime.value);

    if (end <= start) {
      availabilityNote.textContent = 'Check-out must be after check-in.';
      availabilityNote.className = 'availability-note bad';
      roomOptions.innerHTML = '';
      updateSummary();
      return;
    }

    availabilityNote.textContent = 'Checking live availability…';
    availabilityNote.className = 'availability-note';

    try {
      const params = new URLSearchParams({
        checkin: start.toISOString(),
        checkout: end.toISOString(),
        guests: guests.value,
        rooms: rooms.value
      });

      const data = await apiFetch(`/api/rooms?${params}`);
      roomData = Array.isArray(data) ? data : (data.rooms || []);
      renderRooms();
      updateSummary();
    } catch (error) {
      roomOptions.innerHTML = '';
      availabilityNote.textContent = error.message;
      availabilityNote.className = 'availability-note bad';
    }
  }

  [checkinDate, checkinTime, checkoutDate, checkoutTime, guests, rooms].forEach(element => {
    element.addEventListener('change', () => {
      if (checkinDate.value) checkoutDate.min = checkinDate.value;
      loadAvailability();
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    hideMessage();

    if (!selectedRoomId) {
      showMessage('Please select an available room.', 'booking-error');
      return;
    }

    const start = localDateTime(checkinDate.value, checkinTime.value);
    const end = localDateTime(checkoutDate.value, checkoutTime.value);

    if (start <= new Date()) {
      showMessage('Your check-in date and time must be in the future.', 'booking-error');
      return;
    }

    if (end <= start) {
      showMessage('Your check-out must be after your check-in.', 'booking-error');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Sending reservation…';

    try {
      const data = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('name').value,
          email: document.getElementById('email').value,
          phone: document.getElementById('phone').value,
          roomId: selectedRoomId,
          roomCount: Number(rooms.value),
          guests: Number(guests.value),
          checkin: start.toISOString(),
          checkout: end.toISOString(),
          specialRequests: document.getElementById('specialRequests').value
        })
      });

      showMessage(`Reservation received. Your booking reference is ${data.booking.reference}. We have recorded your ${data.booking.room} stay for ${data.booking.nights} night(s).`, 'booking-success');
      form.reset();
      checkinTime.value = '14:00';
      checkoutTime.value = '12:00';
      guests.value = '2';
      rooms.value = '1';
      selectedRoomId = null;
      roomData = [];
      roomOptions.innerHTML = '';
      availabilityNote.textContent = 'Your reservation has been received.';
      summaryText.textContent = 'Reservation received';
      totalText.textContent = money(data.booking.totalAmount);
    } catch (error) {
      showMessage(error.message, 'booking-error');
      await loadAvailability();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Request reservation →';
    }
  });

  roomOptions.innerHTML = '<div class="availability-note">Choose your dates to see available rooms.</div>';
});
