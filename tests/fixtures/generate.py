from pathlib import Path
import math
import struct
import subprocess
import wave


root = Path(__file__).resolve().parent
rate = 16000
for name, frequency in (("tone-a.wav", 220), ("tone-b.wav", 330)):
    with wave.open(str(root / name), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        samples = bytearray()
        for frame in range(rate * 8):
            time = frame / rate
            fade = min(1, time * 20, (8 - time) * 20)
            value = math.sin(2 * math.pi * frequency * time) * 0.12 * fade
            samples.extend(struct.pack("<h", round(value * 32767)))
        output.writeframes(samples)

subprocess.run([
    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=8",
    "-i", str(root / "tone-b.wav"),
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libvpx", "-crf", "35", "-b:v", "0",
    "-c:a", "libvorbis", "-q:a", "3", "-shortest",
    str(root / "backdrop.webm"),
], check=True)
