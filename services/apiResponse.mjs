export async function readApiResponse(response) {
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); } catch {
    let message;
    if (response.status === 413) message = 'The website rejected this upload because it is too large. Try a smaller audio file or a shorter excerpt.';
    else if ([408, 504, 524].includes(response.status)) message = 'The website timed out while analyzing the audio. Try a shorter excerpt.';
    else if (response.status === 429) message = 'Too many requests. Wait one minute and retry.';
    else message = `The website returned an unexpected response (HTTP ${response.status}). Please retry; if it continues, try a shorter audio excerpt.`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw Object.assign(new Error('The website returned an invalid API response. Please retry.'), { status: 502 });
  }
  if (!response.ok) throw Object.assign(new Error(typeof result.error === 'string' ? result.error : `OpenAI request failed (HTTP ${response.status}).`), { status: response.status });
  return result;
}
