chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startVoice") {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Voice not supported in this browser.");
      return;
    }
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event) => {
      const spoken = event.results[0][0].transcript;
      sendResponse({ text: spoken });

      // Send command to backend
      const res = await fetch("https://ai-automation-pipeline-extension.onrender.com/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: spoken })
      });
      const data = await res.json();
      console.log("AI Response:", data);
    };

    recognition.onerror = (event) => {
      console.error("Voice error:", event.error);
    };

    recognition.start();
    return true; // keep sendResponse alive
  }
});
