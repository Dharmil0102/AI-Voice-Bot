from flask import Flask, render_template, request, jsonify, send_file
import openai
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from waitress import serve
from dotenv import load_dotenv


app = Flask(__name__)

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
INSTRUCTIONS = """You're a helpful and friendly AI assistant. Keep answers short and to the point, and be playful, but not overly verbose. Use a friendly tone and avoid technical jargon. If you don't know the answer, say so politely. Always respond in a way that is engaging and encourages further interaction. and only answer under 100 words."""

# Directory to store audio files
AUDIO_DIR = "static/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

# Thread pool for parallel execution
executor = ThreadPoolExecutor(max_workers=2)

# Global variable to track the current audio process
current_audio_process = None

def cleanup_old_files(directory, keep_latest=5):
    """Remove old audio files, keeping only the most recent ones."""
    files = sorted(
        [os.path.join(directory, f) for f in os.listdir(directory) if f.endswith(".wav")],
        key=os.path.getctime
    )
    for file in files[:-keep_latest]:  # Delete older files
        os.remove(file)

def chatgpt_response(prompt):
    """Get a response from OpenAI's GPT-4o-mini with instructions."""
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": INSTRUCTIONS},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error interacting with OpenAI: {e}")
        return "Sorry, I couldn't generate a response at the moment."

def generate_tts(text):
    """Generate speech from text using OpenAI's TTS API and return filename as .wav."""
    try:
        timestamp = int(time.time())
        filename = f"response_{timestamp}.wav"
        audio_path = os.path.join(AUDIO_DIR, filename)

        response = openai.audio.speech.create(
            model="tts-1",
            voice="sage",
            input=text
        )
        with open(audio_path, "wb") as f:
            f.write(response.content)

        # Cleanup old files after generating new one
        cleanup_old_files(AUDIO_DIR)

        return filename
    except Exception as e:
        print(f"Error generating TTS: {e}")
        return None

def stop_current_audio():
    """Stop the currently playing audio."""
    global current_audio_process
    if current_audio_process:
        try:
            current_audio_process.terminate()  # Stop playback process
            current_audio_process = None
        except Exception as e:
            print(f"Error stopping audio: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_response', methods=['POST'])
def get_response():
    """Process user input, get AI response, generate TTS, and stop existing playback."""
    global current_audio_process

    data = request.get_json()
    user_text = data.get("text", "")

    # Stop current audio if user speaks
    stop_current_audio()

    # Run GPT and TTS in parallel using ThreadPoolExecutor
    response_text = executor.submit(chatgpt_response, user_text).result()
    audio_filename = executor.submit(generate_tts, response_text).result()

    return jsonify({
        "response": response_text,
        "audio_url": f"/play_audio/{audio_filename}" if audio_filename else None
    })

@app.route('/play_audio/<filename>')
def play_audio(filename):
    """Serve the generated audio file dynamically and start playback."""
    audio_path = os.path.join(AUDIO_DIR, filename)

    # Return the audio file so that the browser can handle playback
    return send_file(audio_path, mimetype="audio/wav")

if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=5000)
