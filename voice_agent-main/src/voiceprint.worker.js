import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor = null;

// Report progress back to main thread
function sendProgress(data) {
    self.postMessage({ type: "progress", ...data });
}

// Initialize the speaker verification model
async function initModel() {
    sendProgress({ status: "loading", message: "Loading Voice Security model..." });

    try {
        extractor = await pipeline(
            "feature-extraction",
            "Xenova/wavlm-base-plus-sv",
            {
                progress_callback: (progress) => {
                    if (progress.status === "downloading") {
                        sendProgress({
                            status: "downloading",
                            message: `Downloading Voice model: ${Math.round(progress.progress || 0)}%`,
                            progress: progress.progress || 0,
                        });
                    }
                },
            }
        );

        sendProgress({ status: "ready", message: "Voice verification model ready!" });
    } catch (err) {
        sendProgress({ status: "error", message: err.message });
    }
}

// Extract embedding from audio data
async function extractEmbedding(audioData) {
    if (!extractor) {
        self.postMessage({ type: "error", message: "Voice verification model not loaded yet." });
        return;
    }

    try {
        sendProgress({ status: "processing", message: "Analyzing voice print..." });

        // Run the model on raw Float32 audio data (16kHz)
        // Mean pooling is default/recommended for speaker verification embeddings
        const output = await extractor(audioData, { pooling: "mean" });
        
        // Convert Float32Array to standard array for transferring across threads
        const embedding = Array.from(output.data);

        self.postMessage({ type: "result", embedding });
    } catch (err) {
        self.postMessage({ type: "error", message: err.message });
    }
}

// Message handler
self.addEventListener("message", async (event) => {
    const { type, audioData } = event.data;

    if (type === "init") {
        await initModel();
    } else if (type === "extract") {
        await extractEmbedding(audioData);
    }
});
