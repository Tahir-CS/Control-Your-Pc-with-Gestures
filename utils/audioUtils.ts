import React from 'react';

export const convertFloat32ToInt16 = (buffer: Float32Array): Int16Array => {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) {
    buf[l] = Math.min(1, Math.max(-1, buffer[l])) * 0x7FFF;
  }
  return buf;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const playAudioQueue = (
  ctx: AudioContext,
  queue: ArrayBuffer[],
  startTimeRef: React.MutableRefObject<number>
) => {
  if (queue.length === 0) return;

  const audioData = queue.shift();
  if (!audioData) return;

  // The Gemini Live API returns raw PCM 16-bit, 24kHz data.
  // Standard decodeAudioData requires a WAV header, which is missing.
  // We must manually convert the raw Int16 PCM bytes to an AudioBuffer.

  const pcm16 = new Int16Array(audioData);
  const float32 = new Float32Array(pcm16.length);

  for (let i = 0; i < pcm16.length; i++) {
    // Normalize 16-bit integer (-32768 to 32767) to float (-1.0 to 1.0)
    float32[i] = pcm16[i] / 32768.0;
  }

  // Create an AudioBuffer (1 channel, sample rate 24000)
  const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
  audioBuffer.copyToChannel(float32, 0);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  const now = ctx.currentTime;
  // Schedule next chunk at the end of the previous one or now if we lagged behind
  // This ensures gapless playback
  const startAt = Math.max(now, startTimeRef.current);
  
  source.start(startAt);
  startTimeRef.current = startAt + audioBuffer.duration;
};







