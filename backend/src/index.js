import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "pullup-api" });
});

// TEMP: fake event endpoint so frontend has something to hit
app.get("/events/:slug", (req, res) => {
  const { slug } = req.params;
  // fake event – later we load from Supabase
  res.json({
    slug,
    title: "PullUp Launch Party",
    description: "A sexy test event for PullUp.",
    location: "Stockholm",
    startsAt: "2025-12-31T21:00:00Z",
    isPaid: false,
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PullUp API running on http://localhost:${PORT}`);
});
