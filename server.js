const express = require("express");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // serve frontend

// API route
app.post("/download", (req, res) => {
  const { url, format } = req.body;

  if (!url) {
    return res.status(400).json({ error: "No URL provided" });
  }

  // yt-dlp args
  const args = [
    "-f",
    format || "bestvideo+bestaudio/best",
    "--merge-output-format",
    "mp4",
    "-o",
    "%(title)s.%(ext)s",
    url,
  ];

  const ytdlp = spawn("yt-dlp", args);

  ytdlp.stdout.on("data", (data) => {
    console.log(`[yt-dlp] ${data}`);
  });

  ytdlp.stderr.on("data", (data) => {
    console.error(`[yt-dlp error] ${data}`);
  });

  ytdlp.on("close", (code) => {
    if (code === 0) {
      res.json({ success: true, message: "Download complete!" });
    } else {
      res.status(500).json({ error: "yt-dlp failed" });
    }
  });
});

app.listen(PORT, () => {
  console.log(`yt-dlp Express app running at http://localhost:${PORT}`);
});
