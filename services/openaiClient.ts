export interface MediaPart { text?: string; inlineData?: { data: string; mimeType: string }; }
export const publicHosting = (import.meta as any).env.VITE_PUBLIC_BYOK === 'true';
let visitorKey = '';
export const hasVisitorKey = () => Boolean(visitorKey);
export const setVisitorKey = (key: string) => { visitorKey = key.trim(); window.dispatchEvent(new Event('openai-key-change')); };
export interface EngineerChat {
  sendMessageStream(input: { message: MediaPart[] }): Promise<AsyncIterable<{ text: string }>>;
}
async function audioPart(data: string, mimeType: string) {
  if (/^audio\/(wav|wave|x-wav)$/.test(mimeType)) return { type: 'input_audio', input_audio: { data, format: 'wav' } };
  if (/^audio\/(mpeg|mp3)$/.test(mimeType)) return { type: 'input_audio', input_audio: { data, format: 'mp3' } };
  const context = new AudioContext();
  try {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const audio = await context.decodeAudioData(bytes.buffer);
    const channels = audio.numberOfChannels;
    const buffer = new ArrayBuffer(44 + audio.length * channels * 2);
    const view = new DataView(buffer);
    const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE');
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, channels, true); view.setUint32(24, audio.sampleRate, true);
    view.setUint32(28, audio.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, buffer.byteLength - 44, true);
    const samples = Array.from({ length: channels }, (_, i) => audio.getChannelData(i));
    for (let i = 0; i < audio.length; i++) for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, samples[c][i]));
      view.setInt16(44 + (i * channels + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    const wav = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < wav.length; i += 8192) binary += String.fromCharCode(...wav.subarray(i, i + 8192));
    return { type: 'input_audio', input_audio: { data: btoa(binary), format: 'wav' } };
  } finally { await context.close(); }
}
export async function requestCompletion(input: {
  contents?: { parts: MediaPart[] }; messages?: unknown[];
  config: { systemInstruction: string; responseMimeType?: string; responseSchema?: unknown };
}): Promise<{ text: string }> {
  const messages = input.messages || [{ role: 'user', content: await Promise.all((input.contents?.parts || []).map(async part => {
    if (part.text !== undefined) return { type: 'text', text: part.text };
    if (!part.inlineData) throw new Error('Missing audio data.');
    return audioPart(part.inlineData.data, part.inlineData.mimeType);
  })) }];
  if (publicHosting && !visitorKey) throw new Error('Select OpenAI Setup and enter your OpenAI API key.');
  const response = await fetch(publicHosting ? `${(import.meta as any).env.BASE_URL}api.php` : '/api/openai/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction: input.config.systemInstruction, schema: input.config.responseSchema, ...(publicHosting ? { apiKey: visitorKey } : {}) })
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'OpenAI request failed.') as Error & { status: number };
    error.status = response.status; throw error;
  }
  return result;
}
