/**
 * Sarvam AI Text-to-Speech Engine
 * High-fidelity Indian English & Hindi Neural Voices
 * Model: bulbul:v3
 * Best Female Hindi Voice: 'kavya' (warm, conversational, highly natural)
 * Alternative Voices: 'simran' (expressive recovery care), 'neha' (banking tone)
 */

const SARVAM_API_URL = 'https://api.sarvam.ai/text-to-speech';

export type SarvamFemaleVoice = 'kavya' | 'simran' | 'neha' | 'priya';

let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;

/**
 * Convert base64 WAV string to Blob
 */
function base64ToBlob(base64: string, mimeType = 'audio/wav'): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export function stopSarvamAudio(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

export function isSarvamAudioPlaying(): boolean {
  return activeAudio !== null && !activeAudio.paused;
}

/**
 * Calls Sarvam AI TTS endpoint to synthesize voice audio
 */
export async function generateSarvamVoice(
  text: string,
  apiKey: string,
  speaker: SarvamFemaleVoice = 'kavya',
  pace = 1.0,
): Promise<{ audioUrl: string; duration: number }> {
  stopSarvamAudio();

  const res = await fetch(SARVAM_API_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: 'hi-IN',
      speaker,
      pitch: 0,
      pace,
      loudness: 1.0,
      speech_sample_rate: 22050,
      enable_preprocessing: true,
      model: 'bulbul:v3',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sarvam AI API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const audioB64 = data.audios?.[0];

  if (!audioB64) {
    throw new Error('No audio returned by Sarvam AI');
  }

  const blob = base64ToBlob(audioB64, 'audio/wav');
  const audioUrl = URL.createObjectURL(blob);
  activeAudioUrl = audioUrl;

  // Pre-load audio to get duration
  const audio = new Audio(audioUrl);
  activeAudio = audio;

  const duration = await new Promise<number>((resolve) => {
    audio.onloadedmetadata = () => {
      resolve(audio.duration || 4.5);
    };
    audio.onerror = () => {
      resolve(4.5);
    };
    // Fallback if metadata is slow
    setTimeout(() => resolve(audio.duration || 4.5), 1500);
  });

  return { audioUrl, duration };
}

/**
 * Plays synthesized Sarvam AI audio with progress callbacks
 */
export async function playSarvamAudio(
  audioUrl: string,
  onProgress?: (pct: number) => void,
  onEnd?: () => void,
): Promise<void> {
  if (activeAudio) {
    activeAudio.pause();
  }

  const audio = new Audio(audioUrl);
  activeAudio = audio;

  if (onProgress) {
    audio.ontimeupdate = () => {
      if (audio.duration) {
        onProgress((audio.currentTime / audio.duration) * 100);
      }
    };
  }

  return new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      activeAudio = null;
      if (onEnd) onEnd();
      resolve();
    };

    audio.onerror = (e) => {
      activeAudio = null;
      if (onEnd) onEnd();
      reject(e);
    };

    audio.play().catch(reject);
  });
}
