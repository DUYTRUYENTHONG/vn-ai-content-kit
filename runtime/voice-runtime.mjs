import { createRequire as __kitCreateRequire } from 'node:module'; const require = __kitCreateRequire(import.meta.url);

// src/voice.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, open, unlink, rename } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import path2 from "node:path";

// src/store.mjs
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

// src/wav.mjs
function inspectWav(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") throw Error("Invalid WAV header");
  let format, data;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const tag = bytes.toString("ascii", offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > bytes.length) throw Error("Truncated WAV chunk");
    if (tag === "fmt " && size >= 16) format = { encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), sampleRate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    if (tag === "data") data = bytes.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!format || format.encoding !== 1 || format.channels !== 1 || format.bits !== 16 || !format.sampleRate || !data?.length || data.length % 2) throw Error("Expected mono PCM16 WAV");
  let squares = 0, clipped = 0;
  for (let i = 0; i < data.length; i += 2) {
    const v = data.readInt16LE(i);
    squares += v * v;
    if (Math.abs(v) >= 32760) clipped++;
  }
  const count = data.length / 2, durationSeconds = count / format.sampleRate, rms = Math.sqrt(squares / count) / 32768, clippedFraction = clipped / count;
  if (durationSeconds < 3 || durationSeconds > 75 || rms < 5e-3 || clippedFraction > 0.01) throw Error("Technical audio QA failed");
  return { durationSeconds: Number(durationSeconds.toFixed(3)), sampleRate: format.sampleRate, rms: Number(rms.toFixed(6)), clippedFraction: Number(clippedFraction.toFixed(6)) };
}

// src/voice.mjs
var run = promisify(execFile);
var voiceHome = process.env.VN_AI_VOICE_HOME ?? path2.join(homedir2(), ".local", "share", "vn-ai-content-kit", "voice");
async function voiceRuntime(home = voiceHome) {
  const config = JSON.parse((await readFile(path2.join(home, "runtime.json"), "utf8")).replace(/^\uFEFF/, ""));
  if (config.provider === "vieneu") {
    if (config.language !== "vi-VN" || config.version !== "3.8.3" || ![config.python, config.modelManifest, config.hfCache, config.ffmpeg].every((p) => typeof p === "string" && path2.isAbsolute(p))) throw Error("Invalid local VieNeu runtime");
    voiceProfile(config);
    if (await hashFile(config.modelManifest) !== config.modelSha256) throw Error("VieNeu asset manifest checksum mismatch");
    const manifest = JSON.parse(await readFile(config.modelManifest, "utf8"));
    if (!manifest.files?.length) throw Error("VieNeu assets are missing");
    for (const asset of manifest.files) {
      if (!path2.isAbsolute(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256) || await hashFile(asset.path) !== asset.sha256) throw Error("VieNeu asset checksum mismatch");
    }
    return { ...config, configFile: path2.join(home, "runtime.json") };
  }
  if (config.provider === "windows-sapi") {
    if (config.language !== "vi-VN" || typeof config.powershell !== "string" || !path2.isAbsolute(config.powershell)) throw Error("Invalid Windows voice runtime");
    const helper = fileURLToPath2(new URL("../scripts/voice-render.ps1", import.meta.url));
    const { stdout } = await run(config.powershell, ["-NoProfile", "-NonInteractive", "-File", helper, "-ListVoices"], { timeout: 15e3, windowsHide: true });
    if (!JSON.parse(stdout.trim()).includes(config.voice)) throw Error("Configured Vietnamese voice is unavailable");
    return config;
  }
  if (config.provider !== "piper" || config.language !== "vi-VN" || ![config.python, config.model].every((p) => typeof p === "string" && path2.isAbsolute(p))) throw Error("Invalid local voice runtime");
  if (await hashFile(config.model) !== config.modelSha256 || await hashFile(config.model + ".json") !== config.configSha256) throw Error("Voice model/config checksum mismatch");
  return config;
}
function voiceProfile(runtime, { voiceName, speed, referenceStyle } = {}) {
  if (runtime.provider !== "vieneu") {
    if (voiceName !== void 0 || speed !== void 0 || referenceStyle !== void 0) throw Error("Preset selection and speaking speed require the VieNeu provider");
    return { voice: runtime.voice };
  }
  const voice = voiceName ?? runtime.voice, rate = speed ?? runtime.speed;
  if (!runtime.presetVoices?.some((v) => v.name === voice)) throw Error("Unknown Vietnamese preset voice");
  if (!Number.isFinite(rate) || rate < 1 || rate > 2 || !Number.isFinite(runtime.temperature) || runtime.temperature < 0.5 || runtime.temperature > 1) throw Error("Invalid local speaking profile");
  const style = referenceStyle ?? runtime.referenceStyle ?? "preset";
  if (!["preset", "speaker-only"].includes(style)) throw Error("Unknown preset reference style");
  return { voice, speed: rate, temperature: runtime.temperature, referenceStyle: style };
}
export {
  inspectWav,
  voiceProfile,
  voiceRuntime
};
