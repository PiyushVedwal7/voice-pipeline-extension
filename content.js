// content.js
// Restored Render API comments fetch + frontend Gemini summarization
// -----------------------------------------------------------------
// Configure these:
const BACKEND_URL = "https://ai-automation-pipeline-extension.onrender.com/command"; // your Render endpoint
const GEMINI_API_KEY = "AIzaSyCoroWQ4p3RfI6D0piLDAymAmwtcXzz35Y"; // replace with restricted key (if using frontend)
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;


// Optional YouTube API key (only used if you want to fetch via Google API instead of backend)
const YT_API_KEY = ""; // leave empty if you don't want to use it

console.log("🟢 AI YouTube Assistant (Render fetch + Gemini frontend) loaded.");

// ---------- Utilities ----------
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("v");
}

function extractPageDetails() {
  const title = document.querySelector("h1.title")?.innerText || document.title || "";
  const description = document.querySelector("#description")?.innerText || "";
  return { title, description };
}

function commentsArrayToText(arr) {
  if (!arr) return "";
  if (Array.isArray(arr)) return arr.join("\n\n");
  return String(arr);
}

// ---------- Fetch comments from Render backend ----------
async function fetchCommentsFromRender(videoId) {
  if (!videoId) throw new Error("No video ID provided");
  // The backend previously expected a body like { command: "<json-string>" }
  // We'll send the same structure to keep compatibility.
  const commandStr = JSON.stringify({ action: "fetch_comments", video_id: videoId });

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: commandStr })
    });

    const json = await res.json();
    // handle non-OK
    if (!res.ok) {
      const msg = json?.error || JSON.stringify(json);
      throw new Error(`Backend error: ${msg}`);
    }

    // Accept multiple result shapes (array of strings, single string, object)
    const result = json?.result;
    if (!result) throw new Error("No result in backend response");

    // If already array of strings -> return
    if (Array.isArray(result)) {
      // Normalize to plain strings (in case items are objects)
      return result.map(item => {
        if (typeof item === "string") return item;
        if (item?.text) return String(item.text);
        if (item?.snippet?.topLevelComment?.snippet?.textDisplay) return item.snippet.topLevelComment.snippet.textDisplay;
        return JSON.stringify(item);
      });
    }

    // If single string (newline separated), split into array
    if (typeof result === "string") {
      return result.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }

    // If object with comments property
    if (Array.isArray(result?.comments)) {
      return result.comments.map(c => (typeof c === "string" ? c : JSON.stringify(c)));
    }

    // fallback: stringify the whole result
    return [JSON.stringify(result)];
  } catch (err) {
    console.warn("fetchCommentsFromRender failed:", err);
    throw err;
  }
}

// ---------- Optional: Fetch YouTube comments directly (fallback or alternate) ----------
async function fetchYouTubeCommentsDirect(videoId) {
  if (!videoId) throw new Error("No videoId");
  if (!YT_API_KEY) throw new Error("No YT API key configured");
  const apiUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50&key=${YT_API_KEY}`;
  const res = await fetch(apiUrl);
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  if (!json.items) return [];
  return json.items.map(i => i.snippet.topLevelComment.snippet.textDisplay || "");
}

// ---------- Fallback: on-page comments ----------
function fetchOnPageComments(limit = 20) {
  const elems = Array.from(document.querySelectorAll("#content-text")).slice(0, limit);
  return elems.map(e => e.innerText || e.textContent || "").filter(Boolean);
}

// ---------- Gemini summarization (frontend) ----------
async function summarizeWithGemini(text) {
  if (!GEMINI_API_KEY) {
    console.warn("No GEMINI_API_KEY set; summarization cannot run in frontend.");
    return "Error: Gemini API key not provided.";
  }

  const payload = {
    contents: [
      { parts: [{ text: `Summarize this YouTube content concisely for a viewer:\n\n${text}` }] }
    ]
  };

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!res.ok) {
      console.error("Gemini API error:", json);
      return `Gemini error: ${JSON.stringify(json)}`;
    }

    // new response shape: candidates -> content -> parts -> text
    const summary = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (summary) return summary;
    // fallback: try other paths
    if (json?.output?.text) return json.output.text;
    return "No summary returned from Gemini.";
  } catch (err) {
    console.error("summarizeWithGemini failed:", err);
    return "Error connecting to Gemini API.";
  }
}

// ---------- UI: Floating Panel ----------
const panel = document.createElement("div");
panel.style.position = "fixed";
panel.style.top = "20px";
panel.style.right = "20px";
panel.style.width = "360px";
panel.style.background = "#fff";
panel.style.border = "1px solid #ccc";
panel.style.borderRadius = "12px";
panel.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
panel.style.fontFamily = "Arial, sans-serif";
panel.style.zIndex = "999999";
panel.style.transition = "opacity 0.2s ease";
panel.innerHTML = `
  <div id="ai-drag" style="
      cursor: grab;
      background:#f6f6f6;
      padding:10px;
      font-weight:600;
      border-radius:12px 12px 0 0;
      text-align:center;
      user-select:none;">
    🤖 AI Assistant
  </div>
  <div style="padding:12px;">
    <div style="display:flex; gap:6px; margin-bottom:8px;">
      <button id="fetchCommentsBtn" style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;background:#007bff;color:#fff;">Fetch Comments</button>
      <button id="summarizeBtn" style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;background:#1a73e8;color:#fff;">Summarize</button>
      <button id="sentimentBtn" style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;background:#6c757d;color:#fff;">Sentiment</button>
    </div>
    <div style="position:relative;">
      <div id="ai-output" style="
          max-height:220px;overflow:auto;font-size:13px;
          background:#fdfdfd;border:1px solid #e6e6e6;padding:10px 40px 10px 10px;border-radius:8px;line-height:1.4;
          white-space:pre-wrap;color:#222;"></div>
      <button id="ai-copy" style="
          position:absolute;top:6px;right:6px;border:none;background:#198754;color:white;padding:4px 6px;border-radius:6px;font-size:12px;cursor:pointer;">
        Copy
      </button>
    </div>
  </div>
`;
document.body.appendChild(panel);

// copy handler
document.getElementById("ai-copy").addEventListener("click", async (e) => {
  const out = document.getElementById("ai-output");
  const text = out.textContent || "";
  try {
    await navigator.clipboard.writeText(text);
    const btn = e.currentTarget;
    btn.textContent = "✅ Copied";
    setTimeout(() => (btn.textContent = "Copy"), 1400);
  } catch (err) {
    console.warn("Clipboard write failed:", err);
  }
});

// draggable
const drag = document.getElementById("ai-drag");
let dragging = false, dx = 0, dy = 0;
drag.addEventListener("mousedown", (ev) => {
  dragging = true;
  const rect = panel.getBoundingClientRect();
  dx = ev.clientX - rect.left;
  dy = ev.clientY - rect.top;
  panel.style.opacity = "0.9";
  document.body.style.userSelect = "none";
});
document.addEventListener("mouseup", () => {
  if (dragging) {
    dragging = false;
    panel.style.opacity = "1";
    document.body.style.userSelect = "auto";
  }
});
document.addEventListener("mousemove", (ev) => {
  if (!dragging) return;
  panel.style.left = (ev.clientX - dx) + "px";
  panel.style.top = (ev.clientY - dy) + "px";
  panel.style.right = "auto";
});

// ---------- State ----------
let commentsCache = null; // array of strings

// ---------- Handlers ----------
async function handleFetchComments(showResult = true) {
  const out = document.getElementById("ai-output");
  out.textContent = "⏳ Fetching comments from backend...";
  const videoId = getVideoId();

  try {
    // Attempt backend fetch first
    const comments = await fetchCommentsFromRender(videoId);
    commentsCache = comments;
    if (showResult) out.textContent = commentsArrayToText(comments) || "No comments returned.";
    return comments;
  } catch (backendErr) {
    console.warn("Backend fetch failed, attempting fallbacks:", backendErr);

    // Try direct YouTube API if key exists
    try {
      if (YT_API_KEY) {
        const direct = await fetchYouTubeCommentsDirect(videoId);
        commentsCache = direct;
        if (showResult) out.textContent = commentsArrayToText(direct);
        return direct;
      }
    } catch (ytErr) {
      console.warn("Direct YouTube API failed:", ytErr);
    }

    // Fallback to on-page comments
    const onpage = fetchOnPageComments(30);
    commentsCache = onpage;
    if (showResult) out.textContent = "⚠️ Backend failed — showing page comments.\n\n" + commentsArrayToText(onpage);
    return onpage;
  }
}

async function handleSummarize() {
  const out = document.getElementById("ai-output");
  out.textContent = "⏳ Preparing summary...";
  const videoId = getVideoId();
  const { title, description } = extractPageDetails();

  // Ensure we have comments
  let comments = commentsCache;
  if (!comments) {
    try {
      comments = await handleFetchComments(false); // fetch but don't overwrite UI text
    } catch (err) {
      console.warn("Failed to fetch comments before summary:", err);
      comments = fetchOnPageComments(20);
    }
  }

  const combined = `Title: ${title}\n\nDescription: ${description}\n\nTop Comments:\n${commentsArrayToText(comments).slice(0, 40_000)}`; // limit size
  out.textContent = "⏳ Sending content to Gemini for summarization...";
  const summary = await summarizeWithGemini(combined);
  out.textContent = summary;
}

function handleSentiment() {
  const out = document.getElementById("ai-output");
  // Basic heuristic sentiment using cached comments or on-page
  const comments = commentsCache || fetchOnPageComments(30);
  if (!comments || comments.length === 0) {
    out.textContent = "No comments available for sentiment analysis.";
    return;
  }
  let pos = 0, neg = 0;
  const posRe = /good|great|love|awesome|excellent|nice|amazing|best|happy|fantastic/i;
  const negRe = /bad|terrible|hate|awful|worst|sucks|poor|disappoint/i;
  comments.forEach(c => {
    if (posRe.test(c)) pos++;
    else if (negRe.test(c)) neg++;
  });
  const total = comments.length;
  const neutral = total - pos - neg;
  out.textContent = `Sentiment (simple):\nPositive: ${pos}\nNegative: ${neg}\nNeutral: ${neutral}\n\n(Analyzed ${total} comments)`;
}

// ---------- Wire buttons ----------
document.getElementById("fetchCommentsBtn").addEventListener("click", () => handleFetchComments(true));
document.getElementById("summarizeBtn").addEventListener("click", () => handleSummarize());
document.getElementById("sentimentBtn").addEventListener("click", () => handleSentiment());

// ---------- Also add a below-player Summarize button (like previous versions) ----------
function addBelowPlayerSummarizeButton() {
  if (document.getElementById("yt-summarize-button")) return;
  // YouTube frequently changes structure; prefer a stable container (#below or #info-contents)
  const below = document.querySelector("#below") || document.querySelector("#info-contents") || document.querySelector("#top-row");
  if (!below) return;

  const btn = document.createElement("button");
  btn.id = "yt-summarize-button";
  btn.textContent = "🧠 Summarize Video";
  btn.style.background = "#1a73e8";
  btn.style.color = "white";
  btn.style.border = "none";
  btn.style.padding = "8px 12px";
  btn.style.borderRadius = "8px";
  btn.style.cursor = "pointer";
  btn.style.marginLeft = "8px";
  btn.style.fontSize = "13px";

  btn.onclick = async () => {
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "⏳ Fetching & Summarizing...";
    try {
      // fetch comments via backend (preferred)
      await handleFetchComments(false);
      await handleSummarize();
    } catch (err) {
      console.warn("Summarize (below-player) error:", err);
      // still try to summarize with page comments
      await handleSummarize();
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  };

  // Prepend or append depending on container shape
  try {
    below.prepend(btn);
  } catch (e) {
    below.appendChild(btn);
  }
}

// ---------- Auto-init: add below-player button when on a watch page ----------
const urlObserver = new MutationObserver(() => {
  if (window.location.href.includes("watch")) {
    addBelowPlayerSummarizeButton();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// ---------- Optional auto-fetch on panel load (commented out) ----------
// setTimeout(() => { document.getElementById("fetchCommentsBtn").click(); }, 2000);

