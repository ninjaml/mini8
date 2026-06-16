const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:2048' : '';

export async function getSpeechToken() {
  const response = await fetch(`${API_BASE}/api/speech/token`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to get speech token');
  }
  return response.json();
}

export async function recognizeSpeech({ token, audioBase64, format = 'pcm', rate = 16000, len }) {
  const response = await fetch(`${API_BASE}/api/speech/recognize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format,
      rate,
      channel: 1,
      cuid: 'mini8_web',
      token,
      speech: audioBase64,
      len,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to recognize speech');
  }
  return response.json();
}
