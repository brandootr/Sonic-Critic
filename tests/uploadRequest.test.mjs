import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadRequest } from '../services/uploadRequest.mjs';
test('large UTF-8 requests are uploaded in small ordered parts and reconstructed exactly', async () => {
  const original = JSON.stringify({ audio: 'a'.repeat(700000), focus: 'Guitars 🎸' });
  const chunks = [];
  let analyzed = 0;
  const result = await uploadRequest('/api.php', original, async (url, options) => {
    assert.ok(Buffer.byteLength(options.body) < 512 * 1024);
    const body = JSON.parse(options.body);
    if (url.endsWith('?action=upload')) {
      assert.equal(body.index, chunks.length);
      chunks.push(Buffer.from(body.data, 'base64'));
      return new Response('{"uploaded":true}');
    }
    assert.equal(body.action, 'analyzeUpload'); analyzed++;
    assert.equal(Buffer.concat(chunks).toString('utf8'), original);
    return new Response('{"text":"Report"}');
  }, 'a'.repeat(32));
  assert.equal(analyzed, 1);
  assert.deepEqual(result, { text: 'Report' });
});
test('small requests use one ordinary API call', async () => {
  let calls = 0;
  await uploadRequest('/api.php', '{"messages":[]}', async (url, options) => {
    calls++; assert.equal(url, '/api.php'); assert.equal(options.body, '{"messages":[]}');
    return new Response('{"text":"Done"}');
  });
  assert.equal(calls, 1);
});
test('failed parts cancel private upload and preserve the original error', async () => {
  const calls = [];
  await assert.rejects(uploadRequest('/api.php', 'x'.repeat(300000), async url => {
    calls.push(url);
    return new Response('<!DOCTYPE html>Rejected', { status: 413 });
  }), err => err.status === 413);
  assert.deepEqual(calls, ['/api.php?action=upload', '/api.php?action=cancelUpload']);
});
