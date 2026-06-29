import './style.css'
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Google Gemini AI Setup (with System Controls & Google Search Grounding) ───
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define desktop system-control tools
const systemTools = {
  functionDeclarations: [
    {
      name: "open_application",
      description: "Launch a local desktop application by name (e.g. 'notepad', 'calc', 'chrome', 'paint', 'cmd').",
      parameters: {
        type: "OBJECT",
        properties: {
          appName: { type: "STRING", description: "The name of the application to open." }
        },
        required: ["appName"]
      }
    },
    {
      name: "close_application",
      description: "Close a running local application by name.",
      parameters: {
        type: "OBJECT",
        properties: {
          appName: { type: "STRING", description: "The name of the application to close." }
        },
        required: ["appName"]
      }
    },
    {
      name: "search_web",
      description: "Open default web browser and search a query on Google.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "The search query." }
        },
        required: ["query"]
      }
    },
    {
      name: "get_datetime",
      description: "Return the current local date and time."
    },
    {
      name: "set_volume",
      description: "Adjust system audio volume level.",
      parameters: {
        type: "OBJECT",
        properties: {
          level: { type: "INTEGER", description: "Volume level from 0 to 100." }
        },
        required: ["level"]
      }
    },
    {
      name: "take_screenshot",
      description: "Capture and save a screenshot of the primary screen to disk."
    },
    {
      name: "read_file",
      description: "Read contents of a file from allowed workspace or logs directory.",
      parameters: {
        type: "OBJECT",
        properties: {
          filePath: { type: "STRING", description: "The path of the file to read." }
        },
        required: ["filePath"]
      }
    },
    {
      name: "write_file",
      description: "Create or overwrite a file with contents in allowed workspace or logs directory.",
      parameters: {
        type: "OBJECT",
        properties: {
          filePath: { type: "STRING", description: "The path of the file to write." },
          content: { type: "STRING", description: "The text content to write." }
        },
        required: ["filePath", "content"]
      }
    }
  ]
};

// Gemini 2.0 Flash with Google Search grounding and system controls enabled
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  tools: [{ googleSearch: {} }, systemTools],
});

// Maintain conversation history for context
const chatHistory = [];

// ─── State Management ──────────────────────────────────────────────────────
const state = {
  isListening: false,
  isSpeaking: false,
  isProcessing: false,
  isRecording: false,
  modelReady: false,
  language: 'en-US',
  useWhisper: true,      // Use open-source Whisper by default
  neuralCore: 'gemini',  // Switchable brain (gemini or ollama)
  ollamaModel: 'llama3', // Default local model name
  
  // Security / Voice Lock States
  voiceprintReady: false,
  voiceLock: false,
  ownerProfile: null,
  isRegistering: false,
  activeAudioData: null,
  pendingCommandText: null
};

// ─── UI Elements ───────────────────────────────────────────────────────────
const voiceToggle = document.getElementById('voice-toggle');
const dialogueHistory = document.getElementById('dialogue-history');
const ledVocal = document.getElementById('led-vocal');
const ledProcessing = document.getElementById('led-processing');
const ledModel = document.getElementById('led-model');
const ledSearch = document.getElementById('led-search');        // ← Google Search LED
const modelStatus = document.getElementById('model-status-text');
const searchStatusText = document.getElementById('search-status-text'); // ← search status label
const modelProgress = document.getElementById('model-progress');
const modelProgressBar = document.getElementById('model-progress-bar');
const btnEn = document.getElementById('lang-en');
const btnTa = document.getElementById('lang-ta');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const modeSwitchBtn = document.getElementById('mode-switch');
const coreGeminiBtn = document.getElementById('core-gemini');
const coreOllamaBtn = document.getElementById('core-ollama');
const ollamaConfig = document.getElementById('ollama-config');
const ollamaModelInput = document.getElementById('ollama-model-input');

const petCanvas = document.getElementById('cyber-pet-canvas');
const petCanvasCtx = petCanvas ? petCanvas.getContext('2d') : null;

// ─── Virtual Pet State Sync ────────────────────────────────────────────────
function updatePetVisuals() {
  const petEl = document.getElementById('cyber-pet');
  if (!petEl) return;

  petEl.classList.remove('pet-idle', 'pet-listening', 'pet-processing', 'pet-speaking');

  if (state.isSpeaking) {
    petEl.classList.add('pet-speaking');
  } else if (state.isProcessing) {
    petEl.classList.add('pet-processing');
  } else if (state.isListening) {
    petEl.classList.add('pet-listening');
  } else {
    petEl.classList.add('pet-idle');
  }
}

// ─── State Updater ─────────────────────────────────────────────────────────
function updateState(newState) {
  Object.assign(state, newState);
  updatePetVisuals();
}

// ─── Dialogue Renderer ─────────────────────────────────────────────────────
function addDialogueLine(sender, text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper ' +
    (sender === 'User' ? 'user-message-wrapper' : 'au-message-wrapper');

  const bubble = document.createElement('div');
  bubble.className = sender === 'User' ? 'user-text' : 'au-text';

  const label = document.createElement('span');
  label.className = 'msg-label';
  label.innerText = sender === 'User' ? 'YOU' : 'AU';

  const content = document.createElement('p');
  content.innerText = text;

  bubble.appendChild(label);
  bubble.appendChild(content);
  wrapper.appendChild(bubble);
  dialogueHistory.appendChild(wrapper);
  dialogueHistory.scrollTop = dialogueHistory.scrollHeight;
}

// ─── Search Source Citations ────────────────────────────────────────────────
function addSourceCitations(sources) {
  const wrapper = document.createElement('div');
  wrapper.className = 'au-message-wrapper sources-wrapper';

  const box = document.createElement('div');
  box.className = 'sources-box';

  const label = document.createElement('div');
  label.className = 'sources-label';
  label.innerHTML = '🔍 <span>Google Search Sources</span>';

  box.appendChild(label);

  sources.slice(0, 4).forEach(src => {
    const link = document.createElement('a');
    link.className = 'source-link';
    link.href = src.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = src.url;
    link.innerText = src.title.length > 50 ? src.title.slice(0, 50) + '…' : src.title;
    box.appendChild(link);
  });

  wrapper.appendChild(box);
  dialogueHistory.appendChild(wrapper);
  dialogueHistory.scrollTop = dialogueHistory.scrollHeight;
}

// ─── Typing Indicator ─────────────────────────────────────────────────────
function showTypingIndicator() {
  const wrapper = document.createElement('div');
  wrapper.id = 'typing-indicator';
  wrapper.className = 'au-message-wrapper';
  wrapper.innerHTML = `
    <div class="au-text typing-bubble">
      <span class="msg-label">AU</span>
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  dialogueHistory.appendChild(wrapper);
  dialogueHistory.scrollTop = dialogueHistory.scrollHeight;
}

function removeTypingIndicator() {
  const ind = document.getElementById('typing-indicator');
  if (ind) ind.remove();
}

// ─── Text to Speech (Enhanced) ────────────────────────────────────────────
let voices = [];
function loadVoices() {
  voices = window.speechSynthesis.getVoices();
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speak(text) {
  return new Promise((resolve) => {
    if (!text) { resolve(); return; }
    window.speechSynthesis.cancel();

    // Clean markdown symbols for speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\n/g, ' ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    let selectedVoice;

    if (state.language === 'ta-IN') {
      selectedVoice =
        voices.find(v => v.lang.includes('ta-IN')) ||
        voices.find(v => v.lang.includes('ta')) ||
        voices.find(v => v.lang.includes('IN'));
    } else {
      // Prefer a natural female English voice (e.g. Zira on Windows, Google US English, Samantha, Hazel, or any containing Female)
      selectedVoice =
        voices.find(v => v.name.includes('Google US English') && v.lang.startsWith('en')) ||
        voices.find(v => v.name.includes('Zira') && v.lang.startsWith('en')) ||
        voices.find(v => v.name.includes('Samantha') && v.lang.startsWith('en')) ||
        voices.find(v => v.name.includes('Hazel') && v.lang.startsWith('en')) ||
        voices.find(v => v.name.includes('Google UK English Female') && v.lang.startsWith('en')) ||
        voices.find(v => v.name.toLowerCase().includes('female') && v.lang.startsWith('en')) ||
        voices.find(v => v.lang.startsWith('en'));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log(`🔊 Voice: ${selectedVoice.name}`);
    }

    utterance.lang = state.language;
    utterance.pitch = 0.95;
    utterance.rate = 1.05;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      updateState({ isSpeaking: true });
      ledProcessing.classList.add('active');
      document.querySelector('.core-center')?.classList.add('speaking');
    };

    utterance.onend = () => {
      updateState({ isSpeaking: false });
      ledProcessing.classList.remove('active');
      document.querySelector('.core-center')?.classList.remove('speaking');
      resolve();
    };

    utterance.onerror = (e) => {
      console.error("Speech Error:", e);
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}

// ─── Retry Helper (Exponential Backoff) ──────────────────────────────────
async function retryWithBackoff(fn, maxRetries = 3) {
  let delay = 2000; // start at 2 seconds
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error.status === 429 || error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit');
      if (isRateLimit && attempt < maxRetries) {
        console.warn(`Rate limit hit. Retrying in ${delay / 1000}s... (attempt ${attempt}/${maxRetries})`);
        addDialogueLine('System', `Rate limit reached. Retrying in ${delay / 1000} seconds... (attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // exponential backoff: 2s → 4s → 8s
      } else {
        throw error; // rethrow if not rate limit or out of retries
      }
    }
  }
}

// ─── Google Gemini AI + Google Search / Ollama Processing ──────────────────
async function processInput(input) {
  if (!input || !input.trim()) return;
  updateState({ isProcessing: true });
  ledProcessing.classList.add('active');
  if (state.neuralCore === 'gemini') {
    ledSearch.classList.add('loading');
  }
  document.querySelector('.core-outer')?.classList.add('processing');

  showTypingIndicator();

  let response = "";
  let sources = [];

  if (state.neuralCore === 'ollama') {
    // ─── Ollama Local LLM Execution ───
    try {
      const systemPrompt = state.language === 'ta-IN'
        ? `You are AU, a brilliant AI assistant modeled after JARVIS from Iron Man, but speaking Tamil.
           You are witty, concise, knowledgeable and warm. Always respond in Tamil (தமிழ்).
           You can execute local system tools when asked. Available tools:
           - open_application(appName) (notepad, calc, chrome, paint)
           - close_application(appName) (closes notepad, chrome, etc.)
           - search_web(query)
           - get_datetime()
           - set_volume(level) (0-100)
           - take_screenshot()
           
           If the user asks you to perform one of these, you MUST output a tool call block like:
           [TOOL_CALL: name{"arg": "value"}]
           Example: [TOOL_CALL: open_application{"appName": "notepad"}]
           Keep responses under 4 sentences unless more detail is needed.`
        : `You are AU, a brilliant AI assistant modeled after JARVIS from Iron Man.
           You are witty, concise, knowledgeable and have a warm personality.
           You refer to the user as "sir" or "ma'am" occasionally.
           You can execute local system tools when asked. Available tools:
           - open_application(appName) (notepad, calc, chrome, paint)
           - close_application(appName) (closes notepad, chrome, etc.)
           - search_web(query)
           - get_datetime()
           - set_volume(level) (0-100)
           - take_screenshot()
           
           If the user asks you to perform one of these, you MUST output a tool call block like:
           [TOOL_CALL: name{"arg": "value"}]
           Example: [TOOL_CALL: open_application{"appName": "notepad"}]
           Keep responses conversational and under 4 sentences.`;

      // Build message context
      const messages = [{ role: 'system', content: systemPrompt }];
      chatHistory.slice(-6).forEach(m => {
        messages.push({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        });
      });
      messages.push({ role: 'user', content: input });

      const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: state.ollamaModel || 'llama3',
          messages: messages,
          stream: false
        })
      });

      if (!res.ok) {
        throw new Error(`Ollama responded with status: ${res.status}`);
      }

      const data = await res.json();
      response = data.message?.content || "";

      // Check for Ollama tool call in response
      const toolCallRegex = /\[TOOL_CALL:\s*(\w+)\s*(\{.*?\})\]/;
      const match = response.match(toolCallRegex);
      if (match) {
        const name = match[1];
        const argsStr = match[2];
        try {
          const args = JSON.parse(argsStr);
          addDialogueLine('System', `Executing Action: ${name}...`);
          
          const actionResult = await window.electronAPI.executeAction(name, args);
          if (actionResult.success) {
            addDialogueLine('System', `Success: System action ${name} executed.`);
          } else {
            addDialogueLine('System', `Failed: ${actionResult.error}`);
          }
        } catch (err) {
          console.error(`Error parsing Ollama tool call args:`, err);
        }
        
        // Clean the tool call block from response
        response = response.replace(toolCallRegex, '').trim();
        if (!response) {
          response = state.language === 'ta-IN' ? "செயல்முறை வெற்றிகரமாக முடிந்தது." : "Task completed, sir.";
        }
      }

      // Save to chat history
      chatHistory.push({ role: 'user', content: input });
      chatHistory.push({ role: 'assistant', content: response });

    } catch (error) {
      console.error("Ollama Core Error:", error);
      response = state.language === 'ta-IN'
        ? "மன்னிக்கவும் ஐயா, உள்ளூர் ஒல்லாமா (Ollama) சேவையகத்தை இணைக்க முடியவில்லை. ஒல்லாமா இயங்குகிறதா என்று சரிபார்க்கவும்."
        : "I apologize, sir. I was unable to connect to my local Ollama neural core. Please make sure Ollama is running on your system.";
    }
  } else {
    // ─── Google Gemini AI Execution ───
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      response = state.language === 'ta-IN'
        ? "Gemini API சாவி இல்லை. .env கோப்பில் உங்கள் API சாவியை சேர்க்கவும்."
        : "Gemini API key is missing, sir. Please open the .env file and paste your key from https://aistudio.google.com/app/apikey";
    } else {
      try {
        const systemPrompt = state.language === 'ta-IN'
          ? `You are AU, a brilliant AI assistant modeled after JARVIS from Iron Man, but speaking Tamil.
             You have real-time Google Search access — use it for current events, weather, news, facts.
             You have access to local system control tools. When requested, call the appropriate tools.
             Always prioritize tool execution if the user asks you to perform a system task.
             Always respond in Tamil (தமிழ்). Keep responses under 4 sentences.`
          : `You are AU, a brilliant AI assistant modeled after JARVIS from Iron Man.
             You have real-time Google Search access — use it to answer questions about current events.
             You have access to local system control tools (opening/closing applications, setting volume, screenshot).
             When the user requests a system action, call the appropriate tool.
             You refer to the user as "sir" or "ma'am" occasionally.
             Always cite the source if you used a web search. Keep responses conversational and under 4 sentences.`;

        const contextMessages = chatHistory.slice(-6).map(m =>
          `${m.role === 'user' ? 'User' : 'AU'}: ${m.content}`
        ).join('\n');

        let fullPrompt = `${systemPrompt}\n\n${contextMessages ? 'Conversation so far:\n' + contextMessages + '\n\n' : ''
          }User: ${input}`;

        let result = await retryWithBackoff(() => model.generateContent(fullPrompt));
        let responseObj = result.response;
        
        // Handle Gemini function calls
        const functionCalls = responseObj.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
          let followUpNeeded = false;
          let toolResultsNote = "\n\n";
          
          for (const call of functionCalls) {
            const { name, args } = call;
            addDialogueLine('System', `Executing Action: ${name}...`);
            
            try {
              const actionResult = await window.electronAPI.executeAction(name, args);
              console.log(`[Tool Result] ${name}:`, actionResult);
              
              if (actionResult.success) {
                addDialogueLine('System', `Success: System action ${name} executed.`);
                toolResultsNote += `[SYSTEM NOTE: System tool '${name}' was executed successfully. Result details: ${JSON.stringify(actionResult)}. Please report this to the user in your warm persona.]\n`;
                followUpNeeded = true;
              } else {
                addDialogueLine('System', `Failed: ${actionResult.error}`);
                toolResultsNote += `[SYSTEM NOTE: System tool '${name}' failed with error: ${actionResult.error}. Please inform the user.]\n`;
                followUpNeeded = true;
              }
            } catch (err) {
              console.error(`Error in tool execution:`, err);
              addDialogueLine('System', `Error: ${err.message}`);
              toolResultsNote += `[SYSTEM NOTE: System tool '${name}' failed with error: ${err.message}. Please inform the user.]\n`;
              followUpNeeded = true;
            }
          }
          
          if (followUpNeeded) {
            // Generate final response reflecting tool outputs
            const finalPrompt = `${fullPrompt}${toolResultsNote}`;
            result = await retryWithBackoff(() => model.generateContent(finalPrompt));
            responseObj = result.response;
          }
        }
        
        response = responseObj.text();

        const groundingMeta = responseObj.candidates?.[0]?.groundingMetadata;
        if (groundingMeta?.groundingChunks?.length > 0) {
          ledSearch.classList.remove('loading');
          ledSearch.classList.add('active');
          searchStatusText.innerText = 'Search: Active';

          sources = groundingMeta.groundingChunks
             .filter(c => c.web?.uri)
             .map(c => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
        } else {
          ledSearch.classList.remove('loading', 'active');
          searchStatusText.innerText = 'Search: Standby';
        }

        chatHistory.push({ role: 'user', content: input });
        chatHistory.push({ role: 'assistant', content: response });
      } catch (error) {
        console.error("Gemini AI Error:", error);
        ledSearch.classList.remove('loading', 'active');
        searchStatusText.innerText = 'Search: Error';

        if (error.status === 400 || error.message?.includes('API_KEY')) {
          response = "System: Invalid Gemini API Key. Please check your .env file.";
        } else if (error.status === 429 || error.message?.includes('429')) {
          response = "System: Rate limit exceeded after multiple retries. Please wait a minute before trying again, or check your Gemini API quota at https://aistudio.google.com/app/apikey";
        } else {
          response = state.language === 'ta-IN'
            ? "மன்னிக்கவும், Google AI உடன் இணைப்பில் சிக்கல் உள்ளது."
            : "I apologize, sir. I'm having trouble connecting to my neural core. Please check the API key.";
        }
      }
    }
  }

  removeTypingIndicator();
  updateState({ isProcessing: false });
  ledProcessing.classList.remove('active');
  ledSearch.classList.remove('loading');
  document.querySelector('.core-outer')?.classList.remove('processing');

  addDialogueLine('Au', response);

  if (sources.length > 0) {
    addSourceCitations(sources);
  }

  await speak(response);
}

// ─── Open Source Whisper Voice Pipeline ───────────────────────────────────
let whisperWorker = null;
let mediaRecorder = null;
let audioChunks = [];

function initWhisperWorker() {
  if (whisperWorker) return;

  whisperWorker = new Worker(
    new URL('./whisper.worker.js', import.meta.url),
    { type: 'module' }
  );

  whisperWorker.onmessage = (event) => {
    const { type, status, message, progress, text } = event.data;

    if (type === 'progress') {
      handleWorkerProgress(status, message, progress);
    } else if (type === 'result') {
      handleTranscriptionResult(text);
    } else if (type === 'error') {
      console.error('Whisper Worker Error:', message);
      addDialogueLine('System', 'Speech recognition error: ' + message);
      stopRecordingUI();
    }
  };

  // Initialize the whisper model
  setModelStatus('loading', 'Initializing Whisper AI...');
  whisperWorker.postMessage({ type: 'init', language: state.language });
}

function handleWorkerProgress(status, message, progress) {
  switch (status) {
    case 'loading':
    case 'downloading':
      setModelStatus('loading', message);
      if (progress !== undefined) {
        modelProgressBar.style.width = progress + '%';
        modelProgress.style.display = 'block';
      }
      break;
    case 'ready':
      setModelStatus('ready', '✓ Whisper Ready');
      modelProgress.style.display = 'none';
      updateState({ modelReady: true });
      ledModel.classList.add('active');
      voiceToggle.disabled = false;
      voiceToggle.innerText = 'ACTIVATE VOICE';
      break;
    case 'transcribing':
      setModelStatus('busy', 'Transcribing...');
      break;
    case 'error':
      setModelStatus('error', 'Model Error ⚠');
      break;
  }
}

function setModelStatus(state, text) {
  modelStatus.innerText = text;
  ledModel.className = 'led';
  if (state === 'ready') ledModel.classList.add('active');
  if (state === 'loading') ledModel.classList.add('loading');
  if (state === 'error') ledModel.classList.add('error');
  if (state === 'busy') ledModel.classList.add('active');
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function handleTranscriptionResult(text) {
  stopRecordingUI();
  if (!text || text.trim().length < 2) {
    addDialogueLine('System', 'Could not detect speech. Please try again.');
    return;
  }
  
  if (state.voiceLock && state.ownerProfile && state.activeAudioData) {
    state.pendingCommandText = text;
    setModelStatus('busy', 'Verifying voice...');
    voiceprintWorker.postMessage({ type: 'extract', audioData: state.activeAudioData });
  } else {
    addDialogueLine('User', text);
    processInput(text);
  }
}

// ─── Recording Controls ────────────────────────────────────────────────────
async function startRecording() {
  if (!state.modelReady) {
    addDialogueLine('System', 'Whisper model is still loading. Please wait...');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    initVisualizer(stream);

    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // Stop all stream tracks
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();

      try {
        // Decode WebM into raw 16kHz Float32 PCM (required by Whisper)
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const float32PCM = audioBuffer.getChannelData(0); // Mono channel

        if (state.isRegistering) {
          setModelStatus('busy', 'Analyzing voice...');
          voiceprintWorker.postMessage({ type: 'extract', audioData: float32PCM });
          await audioCtx.close();
          return;
        }

        if (state.voiceLock && state.ownerProfile) {
          state.activeAudioData = float32PCM;
        } else {
          state.activeAudioData = null;
        }

        // Send raw Float32 PCM to the worker
        whisperWorker.postMessage({
          type: 'transcribe',
          audioData: float32PCM,
          language: state.language,
        });

        // Close the audio context to release system resources
        await audioCtx.close();
      } catch (err) {
        console.error('Audio decoding error:', err);
        addDialogueLine('System', 'Audio decoding error: ' + err.message);
        stopRecordingUI();
        return;
      }

      setModelStatus('busy', 'Transcribing...');
    };

    mediaRecorder.start();
    updateState({ isListening: true, isRecording: true });

    voiceToggle.innerText = '■ STOP RECORDING';
    voiceToggle.classList.add('listening');
    ledVocal.classList.add('active');
  } catch (err) {
    console.error('Mic error:', err);
    addDialogueLine('System', 'Microphone access denied. Check browser permissions.');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  updateState({ isListening: false, isRecording: false });
  stopRecordingUI();
}

function stopRecordingUI() {
  voiceToggle.innerText = 'ACTIVATE VOICE';
  voiceToggle.classList.remove('listening');
  ledVocal.classList.remove('active');
  if (state.modelReady) setModelStatus('ready', '✓ Whisper Ready');
}

// ─── Native Web Speech API Fallback ───────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

function initNativeSpeech() {
  if (!SpeechRecognition) {
    voiceToggle.innerText = 'TYPE TO CHAT';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = state.language;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    updateState({ isListening: true });
    voiceToggle.innerText = 'LISTENING...';
    voiceToggle.classList.add('listening');
    ledVocal.classList.add('active');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    addDialogueLine('User', transcript);
    processInput(transcript);
  };

  recognition.onend = () => {
    updateState({ isListening: false });
    voiceToggle.innerText = 'ACTIVATE VOICE';
    voiceToggle.classList.remove('listening');
    ledVocal.classList.remove('active');
  };

  recognition.onerror = (event) => {
    updateState({ isListening: false });
    const msgs = {
      'no-speech': 'No speech detected. Please try again.',
      'not-allowed': 'Microphone access denied. Check browser permissions.',
    };
    addDialogueLine('System', msgs[event.error] || 'Speech error: ' + event.error);
    stopRecordingUI();
  };
}

// ─── Audio Visualizer ─────────────────────────────────────────────────────
let audioContext;
let analyzer;
let dataArray;
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

let mediaStreamSource;

function initVisualizer(stream) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;
    const bufferLength = analyzer.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    canvas.width = 800;
    canvas.height = 800;
    draw();
  }

  if (mediaStreamSource) {
    try {
      mediaStreamSource.disconnect();
    } catch (e) {
      console.log("Disconnect error:", e);
    }
  }
  mediaStreamSource = audioContext.createMediaStreamSource(stream);
  mediaStreamSource.connect(analyzer);
}

function draw() {
  requestAnimationFrame(draw);
  if (!analyzer) return;

  analyzer.getByteFrequencyData(dataArray);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 350;

  // Outer glow ring
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < dataArray.length; i++) {
    const barHeight = dataArray[i] / 2;
    const angle = (i * 2 * Math.PI) / dataArray.length;
    ctx.moveTo(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius
    );
    ctx.lineTo(
      centerX + Math.cos(angle) * (radius + barHeight),
      centerY + Math.sin(angle) * (radius + barHeight)
    );
  }
  ctx.stroke();

  // Inner reflection
  ctx.strokeStyle = 'rgba(0, 210, 255, 0.3)';
  ctx.beginPath();
  for (let i = 0; i < dataArray.length; i++) {
    const barHeight = dataArray[i] / 4;
    const angle = (i * 2 * Math.PI) / dataArray.length;
    ctx.moveTo(
      centerX + Math.cos(-angle) * radius,
      centerY + Math.sin(-angle) * radius
    );
    ctx.lineTo(
      centerX + Math.cos(-angle) * (radius - barHeight),
      centerY + Math.sin(-angle) * (radius - barHeight)
    );
  }
  ctx.stroke();
}

// ─── Voice Toggle Button ───────────────────────────────────────────────────
voiceToggle.addEventListener('click', () => {
  if (state.useWhisper) {
    // Whisper mode
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  } else {
    // Native Web Speech API fallback
    if (!recognition) initNativeSpeech();
    if (state.isListening) {
      recognition.stop();
    } else {
      recognition.lang = state.language;
      recognition.start();
    }
  }
});

// ─── Text Input (Fallback / Alternative) ──────────────────────────────────
function sendTextInput() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = '';
  addDialogueLine('User', text);
  processInput(text);
}

sendBtn.addEventListener('click', sendTextInput);
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextInput();
  }
});

// ─── Mode Switch (Whisper ↔ Native) ───────────────────────────────────────
modeSwitchBtn.addEventListener('click', () => {
  state.useWhisper = !state.useWhisper;
  modeSwitchBtn.innerText = state.useWhisper ? 'MODE: WHISPER AI' : 'MODE: NATIVE STT';

  if (!state.useWhisper) {
    // Immediate native speech ready
    updateState({ modelReady: true });
    setModelStatus('ready', '✓ Native STT Ready');
    voiceToggle.disabled = false;
    voiceToggle.innerText = 'ACTIVATE VOICE';
    ledModel.classList.add('active');
  } else {
    // Switch back: re-init whisper
    updateState({ modelReady: false });
    voiceToggle.disabled = true;
    voiceToggle.innerText = 'LOADING MODEL...';
    initWhisperWorker();
  }
});

// ─── Language Selectors ────────────────────────────────────────────────────
btnEn.addEventListener('click', () => {
  state.language = 'en-US';
  if (recognition) recognition.lang = 'en-US';
  btnEn.classList.add('active');
  btnTa.classList.remove('active');
  addDialogueLine('Au', 'Language set to English. Ready for your commands, sir.');
});

btnTa.addEventListener('click', () => {
  state.language = 'ta-IN';
  if (recognition) recognition.lang = 'ta-IN';
  btnTa.classList.add('active');
  btnEn.classList.remove('active');
  addDialogueLine('Au', 'மொழி தமிழுக்கு மாற்றப்பட்டது.');
  speak('மொழி தமிழுக்கு மாற்றப்பட்டது.');
});


// ─── Neural Core Selectors (Gemini ↔ Ollama) ───────────────────────────────
coreGeminiBtn.addEventListener('click', () => {
  updateState({ neuralCore: 'gemini' });
  coreGeminiBtn.classList.add('active');
  coreOllamaBtn.classList.remove('active');
  ollamaConfig.style.display = 'none';
  searchStatusText.innerText = 'Search: Standby';
  addDialogueLine('Au', 'Neural core switched to Gemini 2.0 Flash.');
  speak('Neural core switched to Gemini.');
});

coreOllamaBtn.addEventListener('click', () => {
  updateState({ neuralCore: 'ollama' });
  coreOllamaBtn.classList.add('active');
  coreGeminiBtn.classList.remove('active');
  ollamaConfig.style.display = 'block';
  searchStatusText.innerText = 'Search: N/A';
  ledSearch.className = 'led'; // Turn off search LED
  addDialogueLine('Au', `Neural core switched to local Ollama. Target model: ${state.ollamaModel}`);
  speak(`Neural core switched to local Ollama. Using model ${state.ollamaModel}.`);
});

ollamaModelInput.addEventListener('change', () => {
  const modelVal = ollamaModelInput.value.trim();
  if (modelVal) {
    updateState({ ollamaModel: modelVal });
    addDialogueLine('System', `Ollama model updated to: ${modelVal}`);
  }
});

// ─── 3D Hologram Orb Initialization ──────────────────────────────────────────
const points3D = [];
const numLat = 16;
const numLon = 28;
const sphereBaseRadius = 110;

for (let i = 0; i < numLat; i++) {
  const theta = (i * Math.PI) / (numLat - 1);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  for (let j = 0; j < numLon; j++) {
    const phi = (j * 2 * Math.PI) / numLon;
    const x = sinTheta * Math.cos(phi);
    const y = sinTheta * Math.sin(phi);
    const z = cosTheta;
    points3D.push({ x, y, z, lat: i, lon: j });
  }
}

let angleX = 0;
let angleY = 0;

function draw3DOrb() {
  requestAnimationFrame(draw3DOrb);
  if (!petCanvas || !petCanvasCtx) return;

  // Clear 3D canvas
  petCanvasCtx.clearRect(0, 0, petCanvas.width, petCanvas.height);

  const cx = petCanvas.width / 2;
  const cy = petCanvas.height / 2;

  // Dynamic parameters based on assistant state
  let speedX = 0.003;
  let speedY = 0.005;
  let color = '#00d2ff'; // Default idle cyan
  let pulseScale = 1.0;
  let distortion = 0.0;

  if (state.isSpeaking) {
    color = '#00ff9d'; // Speaking green
    speedX = 0.005;
    speedY = 0.009;
    const speakTime = Date.now() * 0.01;
    // Organic pulsing simulating voice levels
    pulseScale = 1.0 + Math.sin(speakTime * 0.8) * 0.08 + Math.cos(speakTime * 1.5) * 0.04;
    distortion = 0.12 * Math.sin(speakTime * 1.2);
  } else if (state.isProcessing) {
    color = '#ffaa00'; // Processing yellow/amber
    speedX = 0.018;
    speedY = 0.028; // Rapid spin
    const procTime = Date.now() * 0.025;
    pulseScale = 0.9 + Math.sin(procTime) * 0.05;
    distortion = 0.05 * Math.sin(procTime * 2);
  } else if (state.isListening) {
    color = '#ff3c00'; // Listening red/orange
    speedX = 0.002;
    speedY = 0.004; // Slower alert rotation
    
    // Check if we have active microphone frequency data
    if (analyzer && dataArray) {
      analyzer.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avgVol = sum / dataArray.length; // 0 to 255
      pulseScale = 1.0 + (avgVol / 255) * 0.35;
      distortion = (avgVol / 255) * 0.3;
    } else {
      const listenTime = Date.now() * 0.012;
      pulseScale = 1.0 + Math.sin(listenTime) * 0.08;
      distortion = 0.06;
    }
  } else {
    // Idle state: slow, calm breathing
    const idleTime = Date.now() * 0.002;
    pulseScale = 1.0 + Math.sin(idleTime) * 0.03;
  }

  angleX += speedX;
  angleY += speedY;

  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);
  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);

  // Draw glowing solid core inside the wireframe sphere shell
  const coreRadius = 42 * pulseScale;
  const coreGlow = petCanvasCtx.createRadialGradient(cx, cy, 2, cx, cy, coreRadius);
  coreGlow.addColorStop(0, '#ffffff'); // white hot center
  coreGlow.addColorStop(0.35, color);  // transition to state color
  coreGlow.addColorStop(0.75, hexToRgb(color, 0.45));
  coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  petCanvasCtx.fillStyle = coreGlow;
  petCanvasCtx.beginPath();
  petCanvasCtx.arc(cx, cy, coreRadius, 0, 2 * Math.PI);
  petCanvasCtx.fill();

  const projected = [];

  // Project points into 3D
  points3D.forEach(p => {
    // Y-axis rotation
    let x1 = p.x * cosY - p.z * sinY;
    let z1 = p.x * sinY + p.z * cosY;

    // X-axis rotation
    let y2 = p.y * cosX - z1 * sinX;
    let z2 = p.y * sinX + z1 * cosX;

    // Wave distortion
    let finalRadius = sphereBaseRadius;
    if (distortion > 0) {
      const timeVal = Date.now() * 0.004;
      const wave = Math.sin(p.x * 3 + timeVal) * 
                   Math.cos(p.y * 3 + timeVal) * 
                   Math.sin(p.z * 3 + timeVal);
      finalRadius += wave * sphereBaseRadius * distortion;
    }

    const r = finalRadius * pulseScale;
    const rx = x1 * r;
    const ry = y2 * r;
    const rz = z2 * r;

    // Camera distance perspective
    const cameraDist = 350;
    const scale = cameraDist / (cameraDist + rz);
    const screenX = cx + rx * scale;
    const screenY = cy + ry * scale;

    projected.push({
      x: screenX,
      y: screenY,
      z: rz,
      scale: scale,
      lat: p.lat,
      lon: p.lon
    });
  });

  // Sort by depth (Z coord) for painter's algorithm
  const sortedPoints = [...projected].sort((a, b) => b.z - a.z);

  // Draw 3D Grid Lines (Latitude)
  for (let lat = 0; lat < numLat; lat++) {
    petCanvasCtx.beginPath();
    for (let lon = 0; lon <= numLon; lon++) {
      const p = projected.find(pt => pt.lat === lat && pt.lon === (lon % numLon));
      if (p) {
        // Opacity mapping based on depth z-coordinate (foreground is brighter)
        const opacity = Math.max(0.06, Math.min(0.6, (p.z + sphereBaseRadius) / (2 * sphereBaseRadius)));
        petCanvasCtx.strokeStyle = hexToRgb(color, opacity * 0.8);
        petCanvasCtx.lineWidth = 0.7 * p.scale;
        
        if (lon === 0) {
          petCanvasCtx.moveTo(p.x, p.y);
        } else {
          petCanvasCtx.lineTo(p.x, p.y);
        }
      }
    }
    petCanvasCtx.stroke();
  }

  // Draw 3D Grid Lines (Longitude)
  for (let lon = 0; lon < numLon; lon++) {
    petCanvasCtx.beginPath();
    for (let lat = 0; lat < numLat; lat++) {
      const p = projected.find(pt => pt.lat === lat && pt.lon === lon);
      if (p) {
        const opacity = Math.max(0.06, Math.min(0.6, (p.z + sphereBaseRadius) / (2 * sphereBaseRadius)));
        petCanvasCtx.strokeStyle = hexToRgb(color, opacity * 0.8);
        petCanvasCtx.lineWidth = 0.7 * p.scale;

        if (lat === 0) {
          petCanvasCtx.moveTo(p.x, p.y);
        } else {
          petCanvasCtx.lineTo(p.x, p.y);
        }
      }
    }
    petCanvasCtx.stroke();
  }

  // Draw Foreground Nodes (with subtle shadows/glows for depth)
  sortedPoints.forEach(p => {
    const opacity = Math.max(0.1, Math.min(0.85, (p.z + sphereBaseRadius) / (2 * sphereBaseRadius)));
    petCanvasCtx.fillStyle = hexToRgb(color, opacity);

    petCanvasCtx.beginPath();
    const ptSize = Math.max(1, 2.2 * p.scale);
    petCanvasCtx.arc(p.x, p.y, ptSize, 0, 2 * Math.PI);
    petCanvasCtx.fill();

    // Give foreground particles extra glow
    if (p.z < -40) {
      petCanvasCtx.shadowColor = color;
      petCanvasCtx.shadowBlur = 8 * p.scale;
      petCanvasCtx.beginPath();
      petCanvasCtx.arc(p.x, p.y, ptSize * 0.8, 0, 2 * Math.PI);
      petCanvasCtx.fill();
      petCanvasCtx.shadowBlur = 0; // reset
    }
  });
}

function hexToRgb(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Test Vocal Button ─────────────────────────────────────────────────────
document.getElementById('test-vocal').addEventListener('click', () => {
  const text = state.language === 'ta-IN'
    ? "வணக்கம், நான் ஏயூ (AU). என் குரல் கேட்கிறதா?"
    : "Online and ready, sir. All systems are fully operational.";
  speak(text);
});

// ─── Voice Security / Voiceprint Bootstrap ───────────────────────────────
let voiceprintWorker = null;

function initVoiceprintWorker() {
  if (voiceprintWorker) return;

  voiceprintWorker = new Worker(
    new URL('./voiceprint.worker.js', import.meta.url),
    { type: 'module' }
  );

  voiceprintWorker.onmessage = (event) => {
    const { type, status, message, progress, embedding } = event.data;

    if (type === 'progress') {
      if (status === 'ready') {
        updateState({ voiceprintReady: true });
        document.getElementById('led-security').className = 'led active';
        document.getElementById('security-status-text').innerText = state.ownerProfile ? 'Profile: Registered' : 'Profile: Unregistered';
      } else if (status === 'loading' || status === 'downloading') {
        document.getElementById('led-security').className = 'led loading';
        document.getElementById('security-status-text').innerText = 'Model Loading...';
      }
    } else if (type === 'result' && embedding) {
      if (state.isRegistering) {
        window.electronAPI.saveVoiceProfile(embedding).then((res) => {
          if (res.success) {
            updateState({ ownerProfile: embedding, isRegistering: false });
            document.getElementById('security-status-text').innerText = 'Profile: Registered';
            voiceLockBtn.disabled = false;
            registerVoiceBtn.innerText = 'REGISTER OWNER VOICE';
            registerVoiceBtn.classList.remove('active');
            addDialogueLine('System', 'Voice profile registered successfully!');
            speak(state.language === 'ta-IN' 
              ? 'குரல் பதிவு வெற்றிகரமாக முடிந்தது ஐயா. சிஸ்டம் லாக் இப்போது தயாராக உள்ளது.' 
              : 'Voice print registered successfully, sir. System voice lock is now available.');
          } else {
            addDialogueLine('System', 'Failed to save voice profile: ' + res.error);
            updateState({ isRegistering: false });
            registerVoiceBtn.innerText = 'REGISTER OWNER VOICE';
          }
        });
      } else if (state.activeAudioData && state.pendingCommandText) {
        const score = cosineSimilarity(embedding, state.ownerProfile);
        console.log(`[Voice Security] Cosine Similarity: ${score}`);
        
        // A threshold of 0.80 - 0.85 is standard for WavLM speaker verification.
        const threshold = 0.82;
        
        if (score >= threshold) {
          addDialogueLine('System', `Voice Verified (Match: ${(score * 100).toFixed(1)}%). Executing...`);
          const text = state.pendingCommandText;
          state.pendingCommandText = null;
          state.activeAudioData = null;
          
          addDialogueLine('User', text);
          processInput(text);
        } else {
          addDialogueLine('System', `Access Denied: Speaker mismatch (Match: ${(score * 100).toFixed(1)}%).`);
          speak(state.language === 'ta-IN' 
            ? 'அணுகல் மறுக்கப்பட்டது. குரல் பொருந்தவில்லை.' 
            : 'Access denied. Speaker voice profile mismatch.');
          state.pendingCommandText = null;
          state.activeAudioData = null;
          stopRecordingUI();
        }
      }
    } else if (type === 'error') {
      console.error('Voiceprint Worker Error:', message);
      document.getElementById('led-security').className = 'led error';
      document.getElementById('security-status-text').innerText = 'Model Error ⚠';
    }
  };

  voiceprintWorker.postMessage({ type: 'init' });
}

// Security UI Controls
const registerVoiceBtn = document.getElementById('register-voice-btn');
const voiceLockBtn = document.getElementById('voice-lock-btn');

registerVoiceBtn.addEventListener('click', () => {
  if (state.isRegistering) {
    updateState({ isRegistering: false });
    registerVoiceBtn.innerText = 'REGISTER OWNER VOICE';
    registerVoiceBtn.classList.remove('active');
    addDialogueLine('System', 'Voice registration cancelled.');
  } else {
    updateState({ isRegistering: true });
    registerVoiceBtn.innerText = '■ CANCEL REGISTRATION';
    registerVoiceBtn.classList.add('active');
    addDialogueLine('System', 'Please click ACTIVATE VOICE and speak for a few seconds to register your voice.');
    speak(state.language === 'ta-IN'
      ? 'குரல் பதிவு செய்ய, தயவுசெய்து ஆக்டிவேட் வாய்ஸ் கிளிக் செய்து சில வினாடிகள் பேசவும்.'
      : 'Please activate voice and speak for a few seconds to register your voice print, sir.');
  }
});

voiceLockBtn.addEventListener('click', () => {
  const newLockState = !state.voiceLock;
  updateState({ voiceLock: newLockState });
  
  if (newLockState) {
    voiceLockBtn.innerText = 'ON';
    voiceLockBtn.classList.add('active');
    addDialogueLine('System', 'Voice Lock ENABLED. AU will only respond to the registered owner.');
    speak(state.language === 'ta-IN' ? 'வாய்ஸ் லாக் இயக்கப்பட்டது.' : 'Voice lock enabled, sir.');
  } else {
    voiceLockBtn.innerText = 'OFF';
    voiceLockBtn.classList.remove('active');
    addDialogueLine('System', 'Voice Lock DISABLED. AU will respond to any speaker.');
    speak(state.language === 'ta-IN' ? 'வாய்ஸ் லாக் அணைக்கப்பட்டது.' : 'Voice lock disabled.');
  }
});

// ─── Bootstrap ────────────────────────────────────────────────────────────
voiceToggle.disabled = true;
voiceToggle.innerText = 'LOADING MODEL...';

// Load voice profile on startup and initialize worker
window.electronAPI.loadVoiceProfile().then((profile) => {
  if (profile) {
    updateState({ ownerProfile: profile });
    document.getElementById('security-status-text').innerText = 'Profile: Registered';
    voiceLockBtn.disabled = false;
  }
  initVoiceprintWorker();
});

// Start loading Whisper on page load
setTimeout(() => {
  initWhisperWorker();
}, 500);

// Also start the visualizer draw loop early
requestAnimationFrame(draw);
requestAnimationFrame(draw3DOrb);

// Greeting
addDialogueLine('Au', state.language === 'ta-IN'
  ? 'வணக்கம் ஐயா. நான் AU. என்ன உதவி செய்யட்டும்?'
  : 'Good day, sir. I am AU, your personal AI assistant. Neural core is initializing.'
);

// ─── Virtual Pet Click Interaction ─────────────────────────────────────────
document.getElementById('cyber-pet').addEventListener('click', () => {
  if (state.isSpeaking) {
    // Cancel active TTS output
    window.speechSynthesis.cancel();
    updateState({ isSpeaking: false });
    ledProcessing.classList.remove('active');
    document.querySelector('.core-center')?.classList.remove('speaking');
  } else if (!voiceToggle.disabled) {
    // Trigger recording / voice activation if the model is ready
    voiceToggle.click();
  }
});
