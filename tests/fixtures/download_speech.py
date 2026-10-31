from hashlib import sha256
from pathlib import Path
from urllib.request import urlopen


url = "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/159e0fd398b57d12a34e6a01e426e9e416ffce30/jfk.wav"
expected = "aa81c2552465568567e670f3823117e633900d16bd6202346a72f3c8464c74c8"
destination = Path(__file__).resolve().parents[2] / ".artifacts/fixtures/jfk.wav"
with urlopen(url, timeout=60) as response:
    data = response.read(2 * 1024 * 1024)
if sha256(data).hexdigest() != expected:
    raise SystemExit("Speech fixture checksum did not match. No file was saved.")
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_bytes(data)
print(destination)
