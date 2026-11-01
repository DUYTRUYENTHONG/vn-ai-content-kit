# Local VieNeu previews

Text/RAG tools do not require voice assets. For speech, install a compatible local VieNeu3.8.3 environment and obtain the model/preset assets under their separate licenses. This repository does not ship an automatic downloader or certify a third-party preset's likeness rights.

Copy runtime-link.example.json to runtime-link.local.json and point voiceHome to a directory containing runtime.json. Keep real paths/config outside Git. The optional python field supports corpus preparation; rendering reads the Python executable from runtime.json.

runtime.json must declare provider=vieneu, version=3.8.3, language=vi-VN, absolute python/modelManifest/hfCache/ffmpeg paths, modelSha256 for the manifest, a configured voice present in presetVoices, speed1.0–2.0, temperature0.5–1.0 and referenceStyle=preset or speaker-only. The model manifest contains a nonempty files array; each entry needs an absolute path and SHA256. Status verifies all bytes before inference. No fallback download occurs.

Use your own environment/preset names rather than treating the original machine's voice selection as listening approval. The launcher renders locally with its network access blocked, saves source text/runtime snapshot and output receipt, and runs mono PCM16 waveform QA. Natural emphasis, full-script coverage, names and units still need actual listening. Keep recordings/consent/outputs outside Git; do not upload a real person's voice or clone it without permission covering that use.
