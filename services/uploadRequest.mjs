import { readApiResponse } from './apiResponse.mjs';
export async function uploadRequest(endpoint, body, fetcher = fetch, uploadId = crypto.randomUUID().replaceAll('-', '')) {
  const bytes = new TextEncoder().encode(body);
  const chunkSize = 256 * 1024;
  if (bytes.length <= chunkSize) {
    return readApiResponse(await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
  }
  if (bytes.length > 64 * 1024 * 1024) throw new Error('This upload exceeds 64 MB. Try a smaller file or a shorter excerpt.');
  const total = Math.ceil(bytes.length / chunkSize);
  try {
    for (let index = 0; index < total; index++) {
      const chunk = bytes.subarray(index * chunkSize, (index + 1) * chunkSize);
      let binary = '';
      for (let i = 0; i < chunk.length; i += 8192) binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
      await readApiResponse(await fetcher(`${endpoint}?action=upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, index, total, bytes: bytes.length, data: btoa(binary) })
      }));
    }
    return await readApiResponse(await fetcher(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'analyzeUpload', uploadId })
    }));
  } catch (error) {
    // Best effort cleanup; never replace the original error with cleanup failure.
    try { await fetcher(`${endpoint}?action=cancelUpload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId }) }); } catch {}
    throw error;
  }
}
