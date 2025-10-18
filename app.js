//app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-key.json"), "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve frontend files

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Malformed Authorization header" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token", details: err.message });
  }
}

app.get("/api/events", async (req, res) => {
  try {
    // Just returns all fields including category/startDate/endDate/startTime/endTime
    const snapshot = await db.collection("events").orderBy("createdAt", "desc").get();
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.post("/api/events", verifyAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      venue,
      lat,
      lon,
      category,
      startDate,
      startTime,
      endDate,
      endTime
    } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    // Store all fields
    const newEvent = {
      title,
      description: description || "",
      venue: venue || "",
      lat: lat ?? null,
      lon: lon ?? null,
      category: category || "",
      startDate: startDate || "",
      startTime: startTime || "",
      endDate: endDate || "",
      endTime: endTime || "",
      createdAt: new Date(),
      userId: req.user.uid,
      userEmail: req.user.email || null
    };

    const docRef = await db.collection("events").add(newEvent);
    res.status(201).json({ id: docRef.id, ...newEvent });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.put("/api/events/:id", verifyAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const docRef = db.collection("events").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Event not found" });

    const event = doc.data();
    if (event.userId !== req.user.uid) return res.status(403).json({ error: "Forbidden: you are not the owner of this event" });

    const {
      title,
      description,
      venue,
      lat,
      lon,
      category,
      startDate,
      startTime,
      endDate,
      endTime
    } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (venue !== undefined) updates.venue = venue;
    if (lat !== undefined) updates.lat = lat;
    if (lon !== undefined) updates.lon = lon;
    if (category !== undefined) updates.category = category;
    if (startDate !== undefined) updates.startDate = startDate;
    if (startTime !== undefined) updates.startTime = startTime;
    if (endDate !== undefined) updates.endDate = endDate;
    if (endTime !== undefined) updates.endTime = endTime;
    updates.updatedAt = new Date();

    await docRef.update(updates);
    const updatedDoc = await docRef.get();
    res.json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.delete("/api/events/:id", verifyAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const docRef = db.collection("events").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Event not found" });

    const event = doc.data();
    if (event.userId !== req.user.uid) return res.status(403).json({ error: "Forbidden: you are not the owner of this event" });

    await docRef.delete();
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});
app.post("/api/events/:id/like", verifyAuth, async (req, res) => {
  try {
    const eventRef = db.collection("events").doc(req.params.id);
    const doc = await eventRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Event not found" });

    const data = doc.data();
    const likedBy = data.likedBy || {};
    const userId = req.user.uid;

    if (likedBy[userId]) {
      // User already liked this event, so unlike it
      delete likedBy[userId];
    } else {
      // User likes event
      likedBy[userId] = true;
    }

    await eventRef.update({ likedBy });
    return res.json({ success: true, liked: !!likedBy[userId] });
  } catch (err) {
    console.error("Error handling like route:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
