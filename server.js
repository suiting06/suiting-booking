const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bookings.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const ADMIN_PASSWORD = "msuiting2026";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Helpers ---
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (!data.fishMap) data.fishMap = {};
    if (!data.blockedSlots) data.blockedSlots = [];
    if (!data.bookings) data.bookings = [];
    return data;
  } catch {
    return { fishCounter: 0, fishMap: {}, blockedSlots: [], bookings: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Check if a time range overlaps with any blocked slot
function conflictsBlocked(data, date, startTime, endTime) {
  return data.blockedSlots.find(
    (b) =>
      b.date === date &&
      !(endTime <= b.startTime || startTime >= b.endTime)
  );
}

// Check if a time range overlaps with any confirmed booking
function conflictsBooking(data, date, startTime, endTime, excludeId) {
  return data.bookings.find(
    (b) =>
      b.id !== excludeId &&
      b.date === date &&
      b.status === "confirmed" &&
      !(endTime <= b.startTime || startTime >= b.endTime)
  );
}

// --- Public APIs ---

// Claim a fish number — persistent per device
app.post("/api/claim-fish", (req, res) => {
  const { deviceId, name } = req.body;
  const data = readData();

  // If device already has a fish number, return it
  if (deviceId && data.fishMap[deviceId]) {
    const existing = data.fishMap[deviceId];
    // Update name if provided and different
    if (name && name.trim() && !existing.name) {
      existing.name = name.trim();
      writeData(data);
    }
    return res.json({
      fishNumber: existing.fishNumber,
      returning: true,
      name: existing.name || "",
    });
  }

  // New device — assign a new fish number
  data.fishCounter += 1;
  const fishNumber = data.fishCounter;
  if (deviceId) {
    data.fishMap[deviceId] = {
      fishNumber,
      name: (name || "").trim(),
      createdAt: new Date().toISOString(),
    };
  }
  writeData(data);
  res.json({ fishNumber, returning: false, name: "" });
});

// Get all bookings + blocked slots for calendar display (public)
app.get("/api/bookings", (_req, res) => {
  const data = readData();
  const publicBookings = data.bookings
    .filter((b) => b.status === "confirmed")
    .map((b) => ({
      type: "booking",
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      fishNumber: b.fishNumber,
      fishEmoji: b.fishEmoji || "🐟",
    }));

  const publicBlocked = data.blockedSlots.map((b) => ({
    type: "blocked",
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    label: b.label || "wu is busy diving",
  }));

  res.json([...publicBookings, ...publicBlocked]);
});

// Submit a new invitation
app.post("/api/invite", (req, res) => {
  const { fishNumber, name, event, date, startTime, endTime, fishEmoji } = req.body;

  if (!fishNumber || !name || !event || !date || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const data = readData();

  // Check conflict with confirmed bookings
  const bookingConflict = conflictsBooking(data, date, startTime, endTime);
  if (bookingConflict) {
    return res.status(409).json({
      error: "This time slot is already taken by Fish Number " + bookingConflict.fishNumber,
    });
  }

  // Check conflict with blocked slots
  const blockedConflict = conflictsBlocked(data, date, startTime, endTime);
  if (blockedConflict) {
    return res.status(409).json({
      error: "This time slot is blocked — wu is busy diving! 🤿",
    });
  }

  const newBooking = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    fishNumber,
    name,
    fishEmoji: fishEmoji || "🐟",
    event,
    date,
    startTime,
    endTime,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  data.bookings.push(newBooking);
  writeData(data);

  res.json({ success: true, booking: newBooking });
});

// Check booking status
app.get("/api/booking-status/:id", (req, res) => {
  const data = readData();
  const booking = data.bookings.find((b) => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  res.json({
    status: booking.status,
    fishNumber: booking.fishNumber,
  });
});

// --- Admin APIs ---

// Get all bookings including pending + blocked slots (for admin)
app.post("/api/admin/bookings", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }
  const data = readData();
  res.json({
    bookings: data.bookings,
    blockedSlots: data.blockedSlots,
    fishCounter: data.fishCounter,
  });
});

// Confirm a booking
app.post("/api/admin/confirm", (req, res) => {
  const { password, bookingId } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  const data = readData();
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  // Check for conflicts again (bookings + blocked)
  const bookingConflict = conflictsBooking(data, booking.date, booking.startTime, booking.endTime, bookingId);
  if (bookingConflict) {
    return res.status(409).json({
      error: "Time conflict with Fish Number " + bookingConflict.fishNumber,
    });
  }

  const blockedConflict = conflictsBlocked(data, booking.date, booking.startTime, booking.endTime);
  if (blockedConflict) {
    return res.status(409).json({
      error: "Time conflict with a blocked slot — wu is busy diving!",
    });
  }

  booking.status = "confirmed";
  writeData(data);
  res.json({ success: true, booking });
});

// Reject a booking
app.post("/api/admin/reject", (req, res) => {
  const { password, bookingId } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  const data = readData();
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  booking.status = "rejected";
  writeData(data);
  res.json({ success: true, booking });
});

// Block a time slot (wu is busy diving)
app.post("/api/admin/block", (req, res) => {
  const { password, date, startTime, endTime, label } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }
  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing date/time" });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  const data = readData();

  // Check conflict with confirmed bookings
  const bookingConflict = conflictsBooking(data, date, startTime, endTime);
  if (bookingConflict) {
    return res.status(409).json({
      error: "Conflict with Fish #" + bookingConflict.fishNumber + " — " + bookingConflict.name,
    });
  }

  // Check conflict with existing blocked slots
  const blockedConflict = conflictsBlocked(data, date, startTime, endTime);
  if (blockedConflict) {
    return res.status(409).json({ error: "This time already has a block" });
  }

  const block = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    date,
    startTime,
    endTime,
    label: label || "wu is busy diving",
    createdAt: new Date().toISOString(),
  };

  data.blockedSlots.push(block);
  writeData(data);
  res.json({ success: true, block });
});

// Unblock a time slot
app.post("/api/admin/unblock", (req, res) => {
  const { password, blockId } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  const data = readData();
  const idx = data.blockedSlots.findIndex((b) => b.id === blockId);
  if (idx === -1) {
    return res.status(404).json({ error: "Block not found" });
  }

  data.blockedSlots.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🐟 Msuiting Booking Server running on port ${PORT}`);
  console.log(`📁 Data stored at: ${DATA_FILE}`);
});
