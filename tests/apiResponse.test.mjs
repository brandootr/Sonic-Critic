import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../services/apiResponse.mjs';
test('HTML upload rejection produces an actionable size error', async () => {
  await assert.rejects(readApiResponse(new Response('<!DOCTYPE HTML><h1>Request Entity Too Large</h1>', { status: 413 })), err => err.status === 413 && /too large/.test(err.message) && !/Unexpected token/.test(err.message));
});
test('HTML timeout produces an actionable timeout error', async () => {
  await assert.rejects(readApiResponse(new Response('<!DOCTYPE html>Gateway timeout', { status: 504 })), err => err.status === 504 && /timed out/.test(err.message));
});
test('an HTML success page is not mistaken for an API result', async () => {
  await assert.rejects(readApiResponse(new Response('<!DOCTYPE html>Home page')), /unexpected response/);
});
test('JSON API errors preserve the upstream error and status', async () => {
  await assert.rejects(readApiResponse(new Response('{"error":"Key is invalid"}', { status: 401 })), err => err.status === 401 && err.message === 'Key is invalid');
});
test('valid analysis JSON is returned', async () => {
  assert.deepEqual(await readApiResponse(new Response('{"text":"Report"}')), { text: 'Report' });
});
test('invalid JSON shape fails clearly', async () => {
  await assert.rejects(readApiResponse(new Response('null')), /invalid API response/);
});
