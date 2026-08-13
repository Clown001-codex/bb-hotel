require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const helmet = require('helmet');
const nodemailer = require('nodemailer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'bbhotel.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_per_night INTEGER NOT NULL,
  inventory INTEGER NOT NULL DEFAULT 1,
  max_guests INTEGER NOT NULL DEFAULT 2,
  image TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  guest_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  room_id INTEGER NOT NULL,
  room_count INTEGER NOT NULL DEFAULT 1,
  guests INTEGER NOT NULL DEFAULT 1,
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  nights INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  special_requests TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread'
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
`);

const seedRooms = [
  {
    slug: 'deluxe-king',
    name: 'Deluxe King',
    description: 'A calm, bright room for easy nights and slow mornings.',
    price: 150000,
    inventory: 8,
    maxGuests: 2,
    image: 'asset/booking1.webp'
  },
  {
    slug: 'executive-suite',
    name: 'Executive Suite',
    description: 'More space to settle in, work, relax and entertain.',
    price: 220000,
    inventory: 5,
    maxGuests: 2,
    image: 'asset/dining1.webp'
  },
  {
    slug: 'presidential-suite',
    name: 'Presidential Suite',
    description: 'Our most generous stay, designed for celebrations and longer visits.',
    price: 350000,
    inventory: 2,
    maxGuests: 4,
    image: 'asset/dining3.webp'
  }
];

const roomInsert = db.prepare(`
  INSERT OR IGNORE INTO rooms
  (slug, name, description, price_per_night, inventory, max_guests, image)
  VALUES (@slug, @name, @description, @price, @inventory, @maxGuests, @image)
`);

for (const room of seedRooms) roomInsert.run(room);

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(process.env.ADMIN_EMAIL);
  if (!existing) {
    const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
    db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)')
      .run(process.env.ADMIN_EMAIL, passwordHash);
  }
}

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = !origin || /^(https?:\/\/localhost(?::\d+)?|https?:\/\/127\.0\.0\.1(?::\d+)?)$/.test(origin);
  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-before-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

function clean(value) {
  return String(value ?? '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nightsBetween(checkin, checkout) {
  const ms = checkout.getTime() - checkin.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function generateReference() {
  return `BB-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function getAvailability(roomId, checkin, checkout) {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return null;

  const booked = db.prepare(`
    SELECT COALESCE(SUM(room_count), 0) AS booked
    FROM bookings
    WHERE room_id = ?
      AND status IN ('pending', 'confirmed')
      AND checkin < ?
      AND checkout > ?
  `).get(roomId, checkout.toISOString(), checkin.toISOString()).booked;

  return {
    ...room,
    booked: Number(booked),
    available: Math.max(0, room.inventory - Number(booked))
  };
}

function createMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const mailer = createMailer();

async function sendBookingEmail(booking) {
  if (!mailer || !process.env.NOTIFICATION_EMAIL) return;

  const money = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(booking.total_amount);

  await mailer.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject: `New BB Hotel booking — ${booking.reference}`,
    text: [
      'NEW BB HOTEL BOOKING',
      `Reference: ${booking.reference}`,
      `Guest: ${booking.guest_name}`,
      `Email: ${booking.email}`,
      `Phone: ${booking.phone || 'Not provided'}`,
      `Room: ${booking.room_name}`,
      `Rooms: ${booking.room_count}`,
      `Guests: ${booking.guests}`,
      `Check-in: ${booking.checkin}`,
      `Check-out: ${booking.checkout}`,
      `Nights: ${booking.nights}`,
      `Total: ${money}`,
      `Special requests: ${booking.special_requests || 'None'}`
    ].join('\n')
  });
}

function sendContactEmail(message) {
  if (!mailer || !process.env.NOTIFICATION_EMAIL) return Promise.resolve();

  return mailer.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject: `BB Hotel contact message from ${message.name}`,
    text: [
      `Name: ${message.name}`,
      `Email: ${message.email}`,
      `Phone: ${message.phone || 'Not provided'}`,
      '',
      message.message
    ].join('\n')
  });
}

// Public: room types and availability for a requested stay.
app.get('/api/rooms', (req, res) => {
  const checkin = parseDateTime(clean(req.query.checkin));
  const checkout = parseDateTime(clean(req.query.checkout));
  const guests = Math.max(1, Number(req.query.guests || 1));
  const roomCount = Math.max(1, Number(req.query.rooms || 1));

  const rooms = db.prepare('SELECT * FROM rooms ORDER BY price_per_night ASC').all();

  if (!checkin || !checkout || checkout <= checkin) {
    return res.json(rooms.map(room => ({ ...room, available: room.inventory })));
  }

  return res.json(rooms.map(room => {
    const availability = getAvailability(room.id, checkin, checkout);
    return {
      ...availability,
      suitableForGuests: guests <= room.max_guests * roomCount,
      enoughRooms: availability.available >= roomCount
    };
  }));
});

// Public: create a booking.
app.post('/api/bookings', async (req, res) => {
  try {
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const phone = clean(req.body.phone);
    const roomId = Number(req.body.roomId);
    const roomCount = Math.max(1, Number(req.body.roomCount || 1));
    const guests = Math.max(1, Number(req.body.guests || 1));
    const specialRequests = clean(req.body.specialRequests);
    const checkin = parseDateTime(clean(req.body.checkin));
    const checkout = parseDateTime(clean(req.body.checkout));

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Please enter your full name.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (!roomId || !checkin || !checkout) {
      return res.status(400).json({ error: 'Please select your room, check-in and check-out.' });
    }

    if (checkin <= new Date()) {
      return res.status(400).json({ error: 'Your check-in must be in the future.' });
    }

    if (checkout <= checkin) {
      return res.status(400).json({ error: 'Check-out must be after check-in.' });
    }

    const nights = nightsBetween(checkin, checkout);
    if (nights < 1) {
      return res.status(400).json({ error: 'Your stay must be at least one night.' });
    }

    const room = getAvailability(roomId, checkin, checkout);
    if (!room) {
      return res.status(404).json({ error: 'That room type could not be found.' });
    }

    if (guests > room.max_guests * roomCount) {
      return res.status(400).json({
        error: `${room.name} accommodates up to ${room.max_guests} guest(s) per room.`
      });
    }

    if (room.available < roomCount) {
      return res.status(409).json({
        error: `Only ${room.available} ${room.name} room(s) are available for those dates.`
      });
    }

    const reference = generateReference();
    const totalAmount = room.price_per_night * nights * roomCount;
    const createdAt = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO bookings
      (reference, guest_name, email, phone, room_id, room_count, guests, checkin, checkout, nights, total_amount, special_requests, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    const transaction = db.transaction(() => {
      // Re-check availability inside the transaction immediately before insert.
      const fresh = getAvailability(roomId, checkin, checkout);
      if (!fresh || fresh.available < roomCount) {
        throw new Error('ROOM_UNAVAILABLE');
      }

      const result = insert.run(
        reference,
        name,
        email,
        phone,
        roomId,
        roomCount,
        guests,
        checkin.toISOString(),
        checkout.toISOString(),
        nights,
        totalAmount,
        specialRequests,
        createdAt
      );

      return result.lastInsertRowid;
    });

    let bookingId;
    try {
      bookingId = transaction();
    } catch (error) {
      if (error.message === 'ROOM_UNAVAILABLE') {
        return res.status(409).json({ error: 'That room was just booked by another guest. Please choose another room or date.' });
      }
      throw error;
    }

    const booking = db.prepare(`
      SELECT b.*, r.name AS room_name
      FROM bookings b
      JOIN rooms r ON r.id = b.room_id
      WHERE b.id = ?
    `).get(bookingId);

    try {
      await sendBookingEmail(booking);
    } catch (emailError) {
      console.error('Booking email failed:', emailError.message);
    }

    return res.status(201).json({
      message: 'Your reservation request has been received.',
      booking: {
        reference: booking.reference,
        guestName: booking.guest_name,
        room: booking.room_name,
        roomCount: booking.room_count,
        guests: booking.guests,
        checkin: booking.checkin,
        checkout: booking.checkout,
        nights: booking.nights,
        totalAmount: booking.total_amount,
        status: booking.status
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong while creating your reservation.' });
  }
});

// Public contact form.
app.post('/api/contact', async (req, res) => {
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const phone = clean(req.body.phone);
  const message = clean(req.body.message);

  if (!name || !isValidEmail(email) || !message) {
    return res.status(400).json({ error: 'Please provide your name, a valid email and your message.' });
  }

  const createdAt = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO contact_messages (name, email, phone, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email, phone, message, createdAt);

  try {
    await sendContactEmail({ name, email, phone, message });
  } catch (error) {
    console.error('Contact email failed:', error.message);
  }

  res.status(201).json({ id: result.lastInsertRowid, message: 'Your message has been received.' });
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Administrator login required.' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = clean(req.body.password);
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid administrator credentials.' });
  }

  req.session.adminId = admin.id;
  req.session.adminEmail = admin.email;

  res.json({ message: 'Logged in.' });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({
    authenticated: Boolean(req.session.adminId),
    email: req.session.adminEmail || null
  });
});

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, r.name AS room_name
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    ORDER BY b.created_at DESC
  `).all();

  res.json(bookings);
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body.status);

  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid booking status.' });
  }

  const result = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);

  if (!result.changes) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  res.json({ message: 'Booking updated.' });
});

app.get('/api/admin/messages', requireAdmin, (req, res) => {
  const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
  res.json(messages);
});

app.patch('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body.status);

  if (!['unread', 'read'].includes(status)) {
    return res.status(400).json({ error: 'Invalid message status.' });
  }

  const result = db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status, id);
  if (!result.changes) return res.status(404).json({ error: 'Message not found.' });

  res.json({ message: 'Message updated.' });
});

// Serve the existing BB Hotel frontend.
app.use(express.static(ROOT, {
  extensions: ['html']
}));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`\nBB Hotel is running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  console.log('Bookings are stored in data/bbhotel.db');
});
