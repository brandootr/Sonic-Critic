import Ajv from 'ajv';
const ajv = new Ajv({ strict: false });
const MAX_BODY = 64 * 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
export async function complete({ messages, systemInstruction, schema }, env, fetcher = fetch) {
  if (!env.OPENAI_API_KEY) throw fail(503, 'Set OPENAI_API_KEY in .env.local and restart the server.');
  if (!Array.isArray(messages) || !messages.length || typeof systemInstruction !== 'string') throw fail(400, 'Invalid request.');
  for (const message of messages) {
    if (!['user', 'assistant'].includes(message.role) || !Array.isArray(message.content)) throw fail(400, 'Invalid message.');
    for (const part of message.content) {
      if (part.type === 'text' && typeof part.text === 'string') continue;
      if (part.type === 'image_url' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(part.image_url?.url || '')) continue;
      if (part.type === 'input_audio' && ['wav', 'mp3'].includes(part.input_audio?.format) && /^[A-Za-z0-9+/=]+$/.test(part.input_audio?.data || '')) continue;
      throw fail(400, 'Invalid or unsupported media.');
    }
  }
  let validate;
  if (schema) { try { validate = ajv.compile(schema); } catch { throw fail(400, 'Invalid report schema.'); } }
  const call = async body => {
    const response = await fetcher('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180000)
    });
    const data = await response.json();
    if (!response.ok) {
      const details = data.error?.message || 'Request failed.';
      throw fail(response.status, `OpenAI (${response.status}): ${details.replaceAll(env.OPENAI_API_KEY, '[redacted]').replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')}`);
    }
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') throw fail(502, 'OpenAI response was truncated. Try a shorter excerpt.');
    if (choice?.message?.refusal) throw fail(422, 'OpenAI declined this request.');
    const text = choice?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw fail(502, 'OpenAI returned an empty response.');
    return text;
  };
  const hasAudio = messages.some(m => m.content.some(p => p.type === 'input_audio'));
  let text;
  if (hasAudio) {
    const findings = await call({ model: env.OPENAI_AUDIO_MODEL || 'gpt-audio-1.5', modalities: ['text'],
      messages: [{ role: 'system', content: systemInstruction + '\nListen to the supplied audio and provide detailed sonic findings, timestamps and requested recommendations. Distinguish observations from uncertain inferences. Do not claim to measure values not supplied in the context.' }, ...messages] });
    if (!schema) return { text: findings };
    text = await call({ model: env.OPENAI_CHAT_MODEL || 'gpt-4.1',
      messages: [{ role: 'system', content: systemInstruction + '\nFormat the following listening analysis as the requested JSON report. Preserve observations and uncertainty; do not invent new audible findings.' }, { role: 'user', content: findings }],
      response_format: { type: 'json_schema', json_schema: { name: 'sonic_report', strict: false, schema } } });
  } else {
    text = await call({ model: env.OPENAI_CHAT_MODEL || 'gpt-4.1', messages: [{ role: 'system', content: systemInstruction }, ...messages],
      ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'sonic_report', strict: false, schema } } } : {}) });
  }
  if (validate) {
    let result;
    try { result = JSON.parse(text); } catch { throw fail(502, 'OpenAI returned invalid JSON. Please retry.'); }
    if (!validate(result)) throw fail(502, 'OpenAI returned an incomplete report. Please retry.');
  }
  return { text };
}
export function openaiMiddleware(env) {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/openai/')) return next();
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Cross-origin requests are disabled.' });
    if (req.url === '/api/openai/status' && req.method === 'GET') return send(200, { configured: Boolean(env.OPENAI_API_KEY) });
    if (req.url !== '/api/openai/complete' || req.method !== 'POST') return send(404, { error: 'Unknown endpoint.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required.' });
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) throw fail(413, 'Audio is too large. Upload a shorter excerpt (request limit: 64 MB).');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'Invalid JSON.'); }
      send(200, await complete(body, env));
    } catch (error) { send(error.status || 502, { error: error.status ? error.message : 'Cannot reach OpenAI. Check your connection and retry.' }); }
  };
}
