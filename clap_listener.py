import sounddevice as sd
import numpy as np
import subprocess
import time
import os

# Configuration
THRESHOLD = 0.25  # Absolute amplitude threshold (0.0 to 1.0)
COOLDOWN = 2.0   # Cooldown in seconds between detections
SAMPLE_RATE = 16000
BLOCK_SIZE = 1024 # ~64ms blocks

print("AU Voice Assistant - Background Clap Detector")
print("---------------------------------------------")
print("Monitoring microphone levels...")
print("Please clap hands to wake up the assistant.")

last_clap_time = 0
background_energy = 0.01

def audio_callback(indata, frames, time_info, status):
    global last_clap_time, background_energy
    if status:
        print(status)
    
    # Compute RMS energy of the current block
    volume = np.linalg.norm(indata) / np.sqrt(len(indata))
    
    # Update rolling background noise level slowly
    background_energy = 0.98 * background_energy + 0.02 * volume
    
    current_time = time.time()
    if current_time - last_clap_time > COOLDOWN:
        # Check if the volume spike is high relative to background and absolute threshold
        if volume > THRESHOLD and volume > background_energy * 6:
            print(f"[Clap Detected] Peak: {volume:.4f} (Background: {background_energy:.4f}) -> Waking up AU...")
            last_clap_time = current_time
            # Launch the Electron app
            try:
                subprocess.Popen("npm run desktop", shell=True, cwd=os.path.dirname(os.path.abspath(__file__)))
            except Exception as e:
                print("Failed to launch app:", e)

# Open audio stream
try:
    with sd.InputStream(callback=audio_callback, channels=1, samplerate=SAMPLE_RATE, blocksize=BLOCK_SIZE):
        while True:
            time.sleep(1)
except KeyboardInterrupt:
    print("\nStopping Clap Detector.")
except Exception as e:
    print("\nError opening stream:", e)
    print("Please make sure you have microphone permissions and have installed sounddevice and numpy:")
    print("  pip install sounddevice numpy")
