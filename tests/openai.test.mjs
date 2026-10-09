import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, openaiMiddleware } from '../server/openai.mjs';
const env = { OPENAI_API_KEY: 'test-secret' };
const schema = { type: 'object', properties: { overallScore: { type: 'number' } }, required: ['overallScore'] };
const audio = { systemInstruction: 'Mix critique', schema, messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'UklGRg==', format: 'wav' } }] }] };
const reply = text => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: text } }] }));
test('audio goes to listening model, findings go to report model', async () => {
  const calls = [];
  const result = await complete(audio, env, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    calls.push(JSON.parse(options.body));
    return reply(calls.length === 1 ? 'Bass masks the vocal at 0:30.' : '{"overallScore":82}');
  });
  assert.equal(calls[0].model, 'gpt-audio-1.5');
  assert.equal(calls[0].messages[1].content[0].type, 'input_audio');
  assert.equal(calls[1].model, 'gpt-4.1');
  assert.equal(calls[1].messages[1].content, 'Bass masks the vocal at 0:30.');
  assert.equal(calls[1].response_format.type, 'json_schema');
  assert.deepEqual(JSON.parse(result.text), { overallScore: 82 });
});
test('both A/B audio parts and labels remain in order', async () => {
  const input = structuredClone(audio);
  input.messages[0].content = [{ type: 'text', text: 'Stem A' }, audio.messages[0].content[0], { type: 'text', text: 'Stem B' }, audio.messages[0].content[0]];
  let n = 0;
  await complete(input, env, async (_, options) => {
    const body = JSON.parse(options.body);
    if (++n === 1) assert.deepEqual(body.messages[1].content, input.messages[0].content);
    return reply(n === 1 ? 'Tie.' : '{"overallScore":80}');
  });
});
test('chat retains history and screenshot and uses configured model', async () => {
  const messages = [{ role: 'assistant', content: [{ type: 'text', text: 'Earlier advice' }] }, { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YQ==' } }] }];
  const result = await complete({ messages, systemInstruction: 'Full blueprint' }, { ...env, OPENAI_CHAT_MODEL: 'custom-model' }, async (_, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'custom-model');
    assert.deepEqual(body.messages.slice(1), messages);
    return reply('Lower the threshold.');
  });
  assert.equal(result.text, 'Lower the threshold.');
});
test('missing key fails before requesting OpenAI', async () => {
  await assert.rejects(complete(audio, {}, () => assert.fail('must not call OpenAI')), { status: 503 });
});
test('unsupported audio fails before requesting OpenAI', async () => {
  const input = structuredClone(audio); input.messages[0].content[0].input_audio.format = 'flac';
  await assert.rejects(complete(input, env, () => assert.fail('must not call OpenAI')), { status: 400 });
});
test('incomplete reports are rejected', async () => {
  let n = 0;
  await assert.rejects(complete(audio, env, async () => reply(++n === 1 ? 'Findings' : '{}')), { status: 502 });
});
test('upstream rate limit preserved and credentials redacted', async () => {
  await assert.rejects(complete(audio, env, async () => new Response(JSON.stringify({ error: { message: 'test-secret sk-secretvalue quota exceeded' } }), { status: 429 })), err => err.status === 429 && !err.message.includes('test-secret') && !err.message.includes('sk-secretvalue'));
});
test('status exposes configuration only, cross-origin requests blocked', async () => {
  const middleware = openaiMiddleware(env);
  const response = () => ({ status: 0, body: '', writeHead(status) { this.status = status; }, end(body) { this.body = body; } });
  const res = response();
  await middleware({ url: '/api/openai/status', method: 'GET', headers: { host: 'localhost:3000' } }, res, () => assert.fail());
  assert.equal(res.body, '{"configured":true}');
  const forbidden = response();
  await middleware({ url: '/api/openai/complete', method: 'POST', headers: { host: 'localhost:3000', origin: 'https://other-site.test' } }, forbidden, () => assert.fail());
  assert.equal(forbidden.status, 403);
});
