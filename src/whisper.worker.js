import { pipeline, env } from "@huggingface/transformers";

// Use the local cache, don't download if cached
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;

// Report progress back to main thread
function sendProgress(data) {
    self.postMessage({ type: "progress", ...data });
}

// Initialize the Whisper model
async function initModel(language) {
    sendProgress({ status: "loading", message: "Loading Whisper model..." });

    try {
        transcriber = await pipeline(
            "automatic-speech-recognition",
            "Xenova/whisper-tiny",
            {
                progress_callback: (progress) => {
                    if (progress.status === "downloading") {
                        sendProgress({
                            status: "downloading",
                            message: `Downloading model: ${Math.round(progress.progress || 0)}%`,
                            progress: progress.progress || 0,
                        });
                    }
                },
            }
        );

        sendProgress({ status: "ready", message: "Whisper model ready!" });
    } catch (err) {
        sendProgress({ status: "error", message: err.message });
    }
}

// Transcribe audio
async function transcribe(audioData, language) {
    if (!transcriber) {
        self.postMessage({ type: "error", message: "Model not loaded yet." });
        return;
    }

    try {
        sendProgress({ status: "transcribing", message: "Transcribing..." });

        const langCode = language === "ta-IN" ? "ta" : "en";

        const result = await transcriber(audioData, {
            language: langCode,
            task: "transcribe",
            chunk_length_s: 30,
        });

        self.postMessage({ type: "result", text: result.text.trim() });
    } catch (err) {
        self.postMessage({ type: "error", message: err.message });
    }
}

// Message handler
self.addEventListener("message", async (event) => {
    const { type, audioData, language } = event.data;

    if (type === "init") {
        await initModel(language);
    } else if (type === "transcribe") {
        await transcribe(audioData, language);
    }
});
