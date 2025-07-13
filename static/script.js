document.addEventListener("DOMContentLoaded", function () {
  // Web Speech API Configuration
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  // Audio Context Setup
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const typingIndicator = document.getElementById("typingIndicator");
  
  // Audio Analysers
  const mainAnalyser = audioContext.createAnalyser();
  mainAnalyser.fftSize = 256;
  const mainDataArray = new Uint8Array(mainAnalyser.frequencyBinCount);
  
  const micAnalyser = audioContext.createAnalyser();
  micAnalyser.fftSize = 64;
  const micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
  
  // Audio State
  let audioSource = null;
  let micStream = null;
  let micSource = null;
  let currentAudio = null;
  let isMicMuted = true; // Start muted by default
  let isListening = false;
  let controller = null;
  let isRecognitionActive = false;

  // UI Elements
  const toggleMicButton = document.getElementById("toggleMic");
  const chatMessages = document.getElementById("chatMessages");
  const userInput = document.getElementById("userInput");
  const sendButton = document.getElementById("sendButton");
  const micCanvas = document.getElementById("micVisualizer");
  const micCtx = micCanvas.getContext("2d");
  
  // Visualizer Elements
  const visualizerBars = document.querySelectorAll('.visualizer-bar');
  const visualizerContainer = document.querySelector('.visualizer');
  let isIdle = true;

  // Initialize
  let conversationHistory = [];
  resizeCanvases();
  window.addEventListener("resize", resizeCanvases);
  initializeMicrophone();
  let hasGreeted = false;

  function safeGreet() {
    if (!hasGreeted) {
      greetUser();
      hasGreeted = true;
    }
  }

  if (speechSynthesis.getVoices().length > 0) {
    safeGreet();
  } else {
    speechSynthesis.onvoiceschanged = safeGreet;
  }

  initVisualizer();

  // Functions
  function resizeCanvases() {
    micCanvas.width = micCanvas.offsetWidth;
    micCanvas.height = micCanvas.offsetHeight;
  }

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeCanvases, 200);
  });
  async function initializeMicrophone() {
    try {
      // Just check permission, don't keep stream open initially
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      console.log("Microphone access granted");
    } catch (error) {
      console.error("Microphone access error:", error);
      alert("Microphone access is required for voice interactions");
    }
  }

  function greetUser() {
    const greeting = "Hello! How can I assist you today?";
    addMessage("ai", greeting);

    const speech = new SpeechSynthesisUtterance(greeting);
    speech.lang = "en-US";
    speech.volume = 1;
    speech.rate = 1;
    speech.pitch = 1;

    const voices = speechSynthesis.getVoices();
    const emma = voices.find(v => v.name.includes("Emma"));
    if (emma) {
        speech.voice = emma;
    } else {
        console.warn("Emma voice not found, using default.");
    }

    speechSynthesis.speak(speech);
}


  function initVisualizer() {
    visualizerBars.forEach(bar => {
      bar.style.transition = 'height 0.15s ease-out, box-shadow 0.15s ease-out';
    });
    drawVisualizers();
  }

  function drawVisualizers() {
    requestAnimationFrame(drawVisualizers);
    
    // Main visualizer (DOM-based)
    mainAnalyser.getByteFrequencyData(mainDataArray);
    updateMainVisualizer(mainDataArray);
    
    // Microphone visualizer (canvas-based)
    micAnalyser.getByteFrequencyData(micDataArray);
    drawMicVisualizer(micDataArray);
  }

  function updateMainVisualizer(dataArray) {
    const activityLevel = calculateActivityLevel(dataArray);
    
    if (activityLevel < 2) {
      if (!isIdle) {
        document.getElementById('visualizerBars').classList.add('visualizer-idle');
        isIdle = true;
        
        // Set all bars to minimum height but not zero
        visualizerBars.forEach((bar, index) => {
          bar.style.height = '5px';
          bar.style.boxShadow = index === 4 ? '0 0 5px rgba(0, 255, 255, 0.3)' : 'none';
        });
      }
      return;
    } else {
      if (isIdle) {
        document.getElementById('visualizerBars').classList.remove('visualizer-idle');
        isIdle = false;
      }
    }
  
    // For 9 bars, divide the frequency spectrum into 9 groups
    const groupSize = Math.floor(dataArray.length / 9);
    visualizerBars.forEach((bar, index) => {
      const group = dataArray.slice(index * groupSize, (index + 1) * groupSize);
      const maxVal = Math.max(...group);
      const height = Math.max(5, (maxVal / 255) * 150); // Min height 5px, max 150px
      
      bar.style.height = `${height}px`;
      
      // Center bar (index 4) gets the glow effect
      if (index === 4) {
        bar.style.boxShadow = `0 0 ${height/3}px rgba(0, 255, 255, 0.7)`;
      } else {
        bar.style.boxShadow = 'none';
      }
    });
  }

  function calculateActivityLevel(dataArray) {
    let sum = 0;
    let weightedSum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const weight = 1 + (i / dataArray.length); // Higher frequencies weigh more
      weightedSum += dataArray[i] * weight;
      sum += weight;
    }
    return weightedSum / sum;
  }

  function drawMicVisualizer(dataArray) {
    micCtx.clearRect(0, 0, micCanvas.width, micCanvas.height);
    
    const barCount = 10;
    const barWidth = 4;
    const maxHeight = micCanvas.height * 0.9;
    const centerY = micCanvas.height / 2;
    
    for (let i = 0; i < barCount; i++) {
      const value = dataArray[Math.floor(i * (dataArray.length / barCount))];
      const barHeight = (value / 255) * maxHeight;
      const x = i * (barWidth + 2);
      const yPos = centerY - barHeight/2;
      
      let barColor;
      if (isListening) {
        barColor = `hsl(${160 + value/2}, 100%, 50%)`;
      } else if (isMicMuted) {
        barColor = `hsl(0, 100%, ${50 + value/5}%)`;
      } else {
        barColor = `hsl(200, 100%, ${50 + value/5}%)`;
      }
      
      micCtx.fillStyle = barColor;
      micCtx.fillRect(x, yPos, barWidth, barHeight);
    }
  }

  async function startMicrophone() {
    try {
      if (!micStream) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micSource = audioContext.createMediaStreamSource(micStream);
      }
      
      if (!isMicConnected()) {
        micSource.connect(micAnalyser);
      }
      
      isMicMuted = false;
      toggleMicButton.classList.remove("muted");
      console.log("Microphone activated");
      return true;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      return false;
    }
  }

  function isMicConnected() {
    return micSource && micSource.context.state !== 'closed' && 
           micSource.numberOfOutputs > 0;
  }

  function stopMicrophone() {
    if (micSource && isMicConnected()) {
      try {
        micSource.disconnect(micAnalyser);
      } catch (e) {
        console.warn("Error disconnecting mic:", e);
      }
    }
    isMicMuted = true;
    toggleMicButton.classList.add("muted");
    console.log("Microphone muted");
  }

  function cleanupMicrophone() {
    stopMicrophone();
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    micSource = null;
  }

  function startAudioVisualizer(audioElement) {
    if (audioSource) audioSource.disconnect();
    audioSource = audioContext.createMediaElementSource(audioElement);
    audioSource.connect(mainAnalyser);
    audioSource.connect(audioContext.destination);
  }

  function addMessage(sender, text) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", `${sender}-message`);
    messageDiv.textContent = text;
    messageDiv.style.opacity = 0;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    requestAnimationFrame(() => {
      messageDiv.style.opacity = 1;
      messageDiv.style.transition = "opacity 0.4s ease";
    });
    conversationHistory.push({ role: sender === "user" ? "user" : "assistant", content: text });

  }

  function disableChatInput(disabled) {
    userInput.disabled = disabled;
    sendButton.disabled = disabled;
    userInput.style.opacity = disabled ? 0.6 : 1;
  }

  async function processUserInput() {
    disableChatInput(true);
    typingIndicator.style.display = 'block';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (controller) controller.abort();
    controller = new AbortController();

    let thinkingSpoken = false;
    let responseFinished = false;

    // Make sure voices are loaded first
    await new Promise(resolve => {
      const voices = speechSynthesis.getVoices();
      if (voices.length) {
        resolve();
      } else {
        speechSynthesis.onvoiceschanged = () => resolve();
      }
    });

    // ⏳ Setup timeout to trigger thinking speech
    const thinkingTimeout = setTimeout(() => {
      if (!responseFinished) {
        const thinkingMsg = new SpeechSynthesisUtterance("AI is thinking...");
        thinkingMsg.lang = "en-US";
        thinkingMsg.volume = 1;
        thinkingMsg.rate = 1;
        thinkingMsg.pitch = 1;

        const voices = speechSynthesis.getVoices();
        const emma = voices.find(v => v.name.includes("Emma"));
        if (emma) thinkingMsg.voice = emma;

        speechSynthesis.speak(thinkingMsg);
        thinkingSpoken = true;
      }
    }, 10000); // Trigger only after 10 seconds

    try {
      const maxHistory = 6;
      const recentConversation = conversationHistory.slice(-maxHistory);
      const response = await fetch("/get_response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: recentConversation,
      }),
      signal: controller.signal
    });

      responseFinished = true;
      clearTimeout(thinkingTimeout); // Cancel timeout if response came fast

      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();
      typingIndicator.style.display = 'none';
      addMessage("ai", data.response);

      if (data.audio_url) playAudioResponse(data.audio_url);

    } catch (error) {
      responseFinished = true;
      clearTimeout(thinkingTimeout);
      typingIndicator.style.display = 'none';

      if (error.name !== "AbortError") {
        console.error("Processing error:", error);
        addMessage("ai", "Sorry, I'm having trouble responding right now.");
      }
    }
    disableChatInput(false);
}



  function playAudioResponse(url) {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    
    const audio = new Audio(url);
    audio.onplay = () => {
      startAudioVisualizer(audio);
      visualizerContainer.classList.add('visualizer-active');
      isIdle = false;
      document.getElementById('visualizerBars').classList.remove('visualizer-idle');
    };
    
    audio.onended = () => {
      visualizerContainer.classList.remove('visualizer-active');
    };
    
    currentAudio = audio;
    audio.play().catch(error => console.error("Audio playback error:", error));
  }

  function handleTextInput() {
    const text = userInput.value.trim();
    if (text === "") return;
    addMessage("user", text);
    userInput.value = "";
    processUserInput(text);
  }

  // Event Listeners
  document.addEventListener("click", async () => {
    if (audioContext.state === "suspended") await audioContext.resume();
  }, { once: true });

  toggleMicButton.addEventListener("click", async () => {
    if (!isRecognitionActive) {
      try {
        const micStarted = await startMicrophone();
        if (micStarted) {
          recognition.start();
          isRecognitionActive = true;
        }
      } catch (error) {
        console.error("Error starting recognition:", error);
      }
    } else {
      recognition.stop();
      cleanupMicrophone();
      isRecognitionActive = false;
    }
  });

  recognition.onstart = () => {
    isListening = true;
    toggleMicButton.classList.add("active");
    console.log("Speech recognition started");
  };

  recognition.onend = () => {
    isListening = false;
    toggleMicButton.classList.remove("active");
    console.log("Speech recognition ended");
    
    if (isRecognitionActive) {
      setTimeout(() => {
        if (isRecognitionActive) {
          recognition.start();
        }
      }, 100);
    }
  };

let hasStartedSpeaking = false;
  
recognition.onresult = async (event) => {
  const results = Array.from(event.results);
  const lastResult = results[results.length - 1];

  // 🚨 This block triggers as soon as user starts speaking (interim result)
  if (!hasStartedSpeaking && !lastResult.isFinal) {
    hasStartedSpeaking = true;

    // Stop audio + speech
    if (currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      visualizerContainer.classList.remove('visualizer-active');
    }

    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    console.log("User started speaking.");
  }

  // ✅ Final transcript handling
  if (lastResult.isFinal) {
    hasStartedSpeaking = false; // Reset for next round
    const transcript = lastResult[0].transcript.trim();
    if (transcript) {
      addMessage("user", transcript);
      await processUserInput();
    }
  }
};


  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (event.error === 'no-speech' || event.error === 'audio-capture') {
      stopMicrophone();
    }
    
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      isRecognitionActive = false;
      cleanupMicrophone();
    }
  };

  userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleTextInput();
  });

  sendButton.addEventListener("click", handleTextInput);
});