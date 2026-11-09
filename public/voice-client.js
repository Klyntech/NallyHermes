const $ = (id) => document.getElementById(id);
const loginPanel = $("login-panel");
const voicePanel = $("voice-panel");
const connectionPill = $("connection-pill");
const authError = $("auth-error");
const voiceStatus = $("voice-status");
const voiceHint = $("voice-hint");
const orb = $("voice-orb");
const audioState = $("audio-state");
const assistantText = $("assistant-text");
const startButton = $("start-button");
const stopButton = $("stop-button");
let socket;
let stream;
let audioContext;
let micSource;
let micWorklet;
let sessionId;
let activeTurnId = 0;
let activeGenerationId = 0;
let interruptionSent = false;
let scheduler;
let disposed = false;

const FRAME_HEADER_BYTES = 16;
const FRAME_MAGIC = [0x4e, 0x4c, 0x59, 0x41]; // NLYA
const CODEC_PCM16_16KHZ_MONO = 1;

function setConnection(label, online = false) {
  connectionPill.textContent = label;
  connectionPill.classList.toggle("online", online);
}
function setStatus(label, hint = "") {
  voiceStatus.textContent = label;
  voiceHint.textContent = hint;
}
function post(event) {
  if (socket?.readyState === WebSocket.OPEN && sessionId) {
    socket.send(JSON.stringify({ v: 1, sessionId, ...event }));
  }
}
function encodeAudioFrame(pcmBuffer) {
  const frame = new ArrayBuffer(FRAME_HEADER_BYTES + pcmBuffer.byteLength);
  const bytes = new Uint8Array(frame);
  bytes.set(FRAME_MAGIC, 0);
  bytes[4] = 1;
  bytes[5] = CODEC_PCM16_16KHZ_MONO;
  bytes[6] = 0;
  bytes[7] = 0;
  const view = new DataView(frame);
  view.setUint32(8, 0, false);
  view.setUint32(12, 0, false);
  bytes.set(new Uint8Array(pcmBuffer), FRAME_HEADER_BYTES);
  return frame;
}

class PlaybackScheduler {
  constructor(context) {
    this.context = context;
    this.sources = new Set();
    this.nextPlayAt = 0;
    this.turnId = 0;
    this.generationId = 0;
  }
  begin(turnId, generationId) {
    this.flush();
    this.turnId = turnId;
    this.generationId = generationId;
  }
  enqueue(frame) {
    if (frame.byteLength <= FRAME_HEADER_BYTES) return;
    const bytes = new Uint8Array(frame);
    if (!FRAME_MAGIC.every((value, index) => bytes[index] === value)) return;
    if (bytes[4] !== 1 || bytes[5] !== CODEC_PCM16_16KHZ_MONO) return;
    const view = new DataView(frame);
    const turnId = view.getUint32(8, false);
    const generationId = view.getUint32(12, false);
    if (turnId !== this.turnId || generationId !== this.generationId) return;
    const sampleCount = (frame.byteLength - FRAME_HEADER_BYTES) / 2;
    if (!Number.isInteger(sampleCount) || sampleCount < 1) return;
    const pcm = new Int16Array(frame, FRAME_HEADER_BYTES, sampleCount);
    const audio = this.context.createBuffer(1, sampleCount, 16000);
    const channel = audio.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) channel[i] = pcm[i] / 32768;
    const source = this.context.createBufferSource();
    source.buffer = audio;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime + 0.025, this.nextPlayAt);
    this.nextPlayAt = startAt + audio.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
    source.start(startAt);
    orb.classList.add("speaking");
  }
  flush() {
    for (const source of this.sources) {
      try { source.stop(); } catch {}
      source.disconnect();
    }
    this.sources.clear();
    this.nextPlayAt = this.context.currentTime;
    orb.classList.remove("speaking");
  }
  close() { this.flush(); }
}

async function loadSession() {
  const response = await fetch("/auth/session", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return false;
  const result = await response.json();
  return result.authenticated === true;
}

function telegramLoginWidget() {
  fetch("/auth/telegram/config", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Could not load Telegram sign-in.");
      return response.json();
    })
    .then(({ botUsername }) => {
      if (!botUsername) throw new Error("Telegram bot identity is not configured.");
      window.onTelegramAuth = async (user) => {
        authError.textContent = "";
        try {
          const response = await fetch("/auth/telegram", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(user)
          });
          if (!response.ok) throw new Error("Telegram sign-in could not be verified. Please try again.");
          showAuthenticated();
        } catch (error) {
          authError.textContent = error.message || "Sign-in failed.";
        }
      };
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "10");
      script.setAttribute("data-request-access", "write");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      $("telegram-login").replaceChildren(script);
    })
    .catch((error) => { authError.textContent = error.message; });
}

function showAuthenticated() {
  loginPanel.hidden = true;
  voicePanel.hidden = false;
  setConnection("Signed in", true);
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${scheme}//${location.host}/voice`);
    socket.binaryType = "arraybuffer";
    const timeout = setTimeout(() => reject(new Error("Voice connection timed out.")), 10000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      socket.send(JSON.stringify({ v: 1, type: "session.start", sessionId: crypto.randomUUID() }));
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not connect to the voice gateway."));
    }, { once: true });
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "session.ready") {
          sessionId = message.sessionId;
          resolve();
        } else handleServerEvent(message);
      } else if (event.data instanceof ArrayBuffer) {
        scheduler?.enqueue(event.data);
      }
    });
    socket.addEventListener("close", () => {
      sessionId = undefined;
      if (!disposed) {
        setConnection("Disconnected");
        setStatus("Connection closed", "Reconnect to continue your conversation.");
        stopAudioCapture();
        startButton.disabled = false;
        stopButton.disabled = true;
      }
    });
  });
}

function handleServerEvent(event) {
  switch (event.type) {
    case "session.error":
      setStatus("Voice session error", event.message || "The voice session could not continue.");
      break;
    case "assistant.response_start":
      activeTurnId = event.turnId;
      activeGenerationId = event.generationId;
      interruptionSent = false;
      scheduler?.begin(activeTurnId, activeGenerationId);
      setStatus("Nally is speaking", "You can interrupt at any time.");
      break;
    case "assistant.text.delta":
      if (event.turnId === activeTurnId && event.generationId === activeGenerationId) {
        if (assistantText.textContent === "Your conversation will appear here.") assistantText.textContent = "";
        assistantText.textContent += event.delta;
      }
      break;
    case "assistant.interrupted":
      if (event.turnId === activeTurnId && event.generationId === activeGenerationId) {
        scheduler?.flush();
        activeGenerationId = 0;
        setStatus("Listening", "Go ahead. Nally is listening.");
      }
      break;
    case "assistant.response_end":
      if (event.turnId === activeTurnId && event.generationId === activeGenerationId) {
        setStatus("Listening", "Your microphone is still active.");
        orb.classList.remove("speaking");
      }
      break;
    case "input.speech_start":
      setStatus("Listening", "Nally is processing your voice.");
      break;
    case "input.transcript.partial":
    case "input.transcript.final":
      if (event.type === "input.transcript.final") {
        assistantText.textContent = event.text;
      }
      break;
  }
}

async function startAudioCapture() {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    throw new Error("Microphone access requires a supported browser on HTTPS.");
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule("/audio-worklet.js");
  scheduler = new PlaybackScheduler(audioContext);
  micSource = audioContext.createMediaStreamSource(stream);
  micWorklet = new AudioWorkletNode(audioContext, "nally-microphone-processor", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1]
  });
  micWorklet.port.onmessage = (event) => {
    if (event.data?.type !== "audio" || socket?.readyState !== WebSocket.OPEN) return;
    const frame = encodeAudioFrame(event.data.pcm);
    if (socket.bufferedAmount < 256 * 1024) socket.send(frame);
    const isSpeech = event.data.rms > 0.025;
    if (isSpeech && activeGenerationId > 0 && !interruptionSent) {
      interruptionSent = true;
      scheduler?.flush();
      post({ type: "turn.cancel", turnId: activeTurnId });
      setStatus("Listening", "Interruption sent. Keep speaking.");
    } else if (!isSpeech && activeGenerationId === 0) {
      interruptionSent = false;
    }
  };
  micSource.connect(micWorklet);
  // Keep the worklet alive without routing microphone audio to the speakers.
  const mute = audioContext.createGain();
  mute.gain.value = 0;
  micWorklet.connect(mute).connect(audioContext.destination);
  await audioContext.resume();
  post({ type: "audio.start" });
  audioState.textContent = "Microphone active · full duplex";
  orb.classList.add("active");
}

function stopAudioCapture() {
  try { post({ type: "audio.end" }); } catch {}
  micWorklet?.port.postMessage({ type: "stop" });
  micWorklet?.disconnect();
  micSource?.disconnect();
  stream?.getTracks().forEach((track) => track.stop());
  scheduler?.close();
  if (audioContext && audioContext.state !== "closed") void audioContext.close();
  micWorklet = undefined;
  micSource = undefined;
  stream = undefined;
  audioContext = undefined;
  scheduler = undefined;
  audioState.textContent = "Microphone off";
  orb.classList.remove("active", "speaking");
}

async function startVoice() {
  startButton.disabled = true;
  setStatus("Connecting", "Opening a secure voice session…");
  try {
    await connectSocket();
    await startAudioCapture();
    setConnection("Voice connected", true);
    setStatus("Listening", "Speak naturally. You can talk while Nally is speaking.");
    stopButton.disabled = false;
  } catch (error) {
    stopAudioCapture();
    socket?.close();
    startButton.disabled = false;
    setStatus("Could not start voice", error.message || "Check your microphone and connection.");
  }
}

function stopVoice() {
  disposed = true;
  stopAudioCapture();
  if (socket?.readyState === WebSocket.OPEN) {
    post({ type: "session.stop" });
    socket.close(1000, "User ended session");
  }
  sessionId = undefined;
  activeTurnId = 0;
  activeGenerationId = 0;
  interruptionSent = false;
  disposed = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  setConnection("Signed in", true);
  setStatus("Ready when you are", "Start a session to enable your microphone.");
}

startButton.addEventListener("click", startVoice);
stopButton.addEventListener("click", stopVoice);
$("logout-button").addEventListener("click", async () => {
  stopVoice();
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  voicePanel.hidden = true;
  loginPanel.hidden = false;
  setConnection("Not connected");
});

if (await loadSession()) showAuthenticated();
else telegramLoginWidget();