const express = require("express");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let clients = [];

// Get the correct yt-dlp binary path
function getYtDlpPath() {
  const platform = os.platform();
  const binariesDir = path.join(__dirname, "binaries");
  
  let binaryName;
  if (platform === "win32") {
    binaryName = "yt-dlp.exe";
  } else if (platform === "linux" || platform === "darwin") {
    binaryName = "yt-dlp";
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  
  const binaryPath = path.join(binariesDir, binaryName);
  
  console.log(`Platform: ${platform}`);
  console.log(`Looking for binary at: ${binaryPath}`);
  console.log(`Binary exists: ${fs.existsSync(binaryPath)}`);
  
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}`);
  }
  
  if (platform !== "win32") {
    try {
      fs.chmodSync(binaryPath, 0o755);
      console.log(`Set executable permissions on ${binaryPath}`);
    } catch (error) {
      console.warn("Could not set executable permissions:", error.message);
    }
  }
  
  return binaryPath;
}

// SSE endpoint for progress
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

// Download endpoint
app.post("/download", (req, res) => {
  const { url, format, audioQuality } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    const ytdlpPath = getYtDlpPath();
    
    let args;
    
    // Check if it's audio-only format
    if (format === "bestaudio/best") {
      // For audio-only downloads, extract as MP3
      args = [
        "--newline",
        "-f", "bestaudio/best",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", audioQuality || "256K",
        "-o", "downloads/%(title)s.%(ext)s",
        url,
      ];
    } else {
      // For video downloads, keep as MP4
      args = [
        "--newline",
        "-f", format || "bestvideo+bestaudio/best",
        "--merge-output-format", "mp4",
        "-o", "downloads/%(title)s.%(ext)s",
        url,
      ];
    }

    console.log(`Executing: ${ytdlpPath} ${args.join(' ')}`);

    const downloadsDir = path.join(__dirname, "downloads");
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
      console.log(`Created downloads directory: ${downloadsDir}`);
    }

    const ytdlp = spawn(ytdlpPath, args, {
      cwd: __dirname
    });

    ytdlp.stdout.on("data", (data) => {
      const text = data.toString();
      console.log('STDOUT:', text);

      const match = text.match(/(\d+(?:\.\d+)?)%/) || text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        const percent = Math.round(parseFloat(match[1]));
        console.log(`Progress: ${percent}%`);
        clients.forEach((c) => {
          try {
            c.write(`data: ${JSON.stringify({ progress: percent })}\n\n`);
          } catch (err) {
            console.log('Client disconnected');
          }
        });
      }
    });

    ytdlp.stderr.on("data", (data) => {
      const text = data.toString();
      console.log('STDERR:', text);
    });

    ytdlp.on("close", (code) => {
      console.log(`Process exited with code: ${code}`);
      clients.forEach((c) => {
        try {
          c.write(`data: ${JSON.stringify({ done: true, success: code === 0 })}\n\n`);
        } catch (err) {
          console.log('Client disconnected');
        }
      });
      res.json({ success: code === 0 });
    });

    ytdlp.on("error", (error) => {
      console.error("Spawn error:", error);
      res.status(500).json({ error: `Failed to start download: ${error.message}` });
    });

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  try {
    const ytdlpPath = getYtDlpPath();
    res.json({ 
      status: "ok", 
      platform: os.platform(),
      binaryPath: ytdlpPath
    });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`yt-dlp Web GUI running at http://localhost:${PORT}`);
  
  try {
    const ytdlpPath = getYtDlpPath();
    console.log(`Using yt-dlp binary: ${ytdlpPath}`);
  } catch (error) {
    console.error("Warning:", error.message);
  }
});
