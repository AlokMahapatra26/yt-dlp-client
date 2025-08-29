const express = require("express");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let clients = [];

// SSE endpoint for progress
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

// Download endpoint
app.post("/download", (req, res) => {
  const { url, format } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  const args = [
    "--newline", // print progress line by line
    "-f", format || "bestvideo+bestaudio/best",
    "--merge-output-format", "mp4",
    "-o", "%(title)s.%(ext)s",
    url,
  ];

  const ytdlp = spawn("yt-dlp", args);

  // forward yt-dlp logs to terminal
  ytdlp.stdout.on("data", (data) => {
    const text = data.toString();
    process.stdout.write(text);

    // progress lines look like: [download]   12.3% of ...
    const match = text.match(/(\d+(?:\.\d+)?)%/);
    if (match) {
      const percent = match[1];
      clients.forEach((c) =>
        c.write(`data: ${JSON.stringify({ progress: percent })}\n\n`)
      );
    }
  });

  ytdlp.stderr.on("data", (data) => {
    process.stderr.write(data.toString()); // still see errors
  });

  ytdlp.on("close", (code) => {
    clients.forEach((c) =>
      c.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    );
    res.json({ success: code === 0 });
  });
});

app.listen(PORT, () => {
  console.log(`yt-dlp Express app running at http://localhost:${PORT}`);
});
