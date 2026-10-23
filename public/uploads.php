<?php
// Included only by api.php. Parts are private, bound to the visitor key and IP,
// ordered, bounded to 64 MiB, and removed on completion/cancel or after 30 min.
if (!defined('KEY_COOKIE')) { http_response_code(404); exit; }
function upload_paths($id, $key) {
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) respond(400, ['error' => 'Invalid upload identifier.']);
    $prefix = sys_get_temp_dir() . '/sonic-upload-' . hash('sha256', $key . '|' . ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $id);
    return [$prefix . '.meta', $prefix . '.data'];
}
function remove_upload($paths) { foreach ($paths as $path) if (is_file($path)) @unlink($path); }
function accept_upload($body, $key) {
    $paths = upload_paths($body['uploadId'] ?? '', $key);
    $index = $body['index'] ?? null; $total = $body['total'] ?? null; $bytes = $body['bytes'] ?? null;
    if (!is_int($index) || !is_int($total) || !is_int($bytes) || $total < 2 || $total > 256 || $index < 0 || $index >= $total || $bytes <= 262144 || $bytes > 67108864 || $total !== (int)ceil($bytes / 262144)) respond(400, ['error' => 'Invalid upload size or part number.']);
    $chunk = base64_decode($body['data'] ?? '', true);
    $expected = $index === $total - 1 ? $bytes - $index * 262144 : 262144;
    if ($chunk === false || strlen($chunk) !== $expected) respond(400, ['error' => 'Invalid upload part.']);
    if ($index === 0) {
        foreach (glob(sys_get_temp_dir() . '/sonic-upload-*.meta') ?: [] as $old) {
            if (filemtime($old) < time() - 1800) remove_upload([$old, substr($old, 0, -5) . '.data']);
        }
    }
    $lock = @fopen($paths[0], $index === 0 ? 'x+' : 'r+');
    if (!$lock || !flock($lock, LOCK_EX)) respond(409, ['error' => 'Upload expired or already started. Please retry.']);
    @chmod($paths[0], 0600);
    $state = $index === 0 ? ['next' => 0, 'total' => $total, 'bytes' => $bytes] : json_decode(stream_get_contents($lock), true);
    if (!$state || $state['next'] !== $index || $state['total'] !== $total || $state['bytes'] !== $bytes) { flock($lock, LOCK_UN); fclose($lock); respond(409, ['error' => 'Upload parts arrived out of order. Please retry.']); }
    if ($index === 0 && !touch($paths[1])) { fclose($lock); remove_upload($paths); respond(503, ['error' => 'Cannot create private upload.']); }
    @chmod($paths[1], 0600);
    if (file_put_contents($paths[1], $chunk, FILE_APPEND | LOCK_EX) !== strlen($chunk)) { fclose($lock); remove_upload($paths); respond(503, ['error' => 'Cannot save audio upload.']); }
    $state['next']++;
    ftruncate($lock, 0); rewind($lock); fwrite($lock, json_encode($state)); fflush($lock); flock($lock, LOCK_UN); fclose($lock);
    respond(200, ['uploaded' => $index + 1, 'total' => $total]);
}
function finish_upload($id, $key) {
    $paths = upload_paths($id, $key);
    $lock = @fopen($paths[0], 'r+');
    if (!$lock || !flock($lock, LOCK_EX)) respond(409, ['error' => 'Upload not found. Please retry.']);
    $state = json_decode(stream_get_contents($lock), true);
    if (!$state || $state['next'] !== $state['total'] || !is_file($paths[1]) || filesize($paths[1]) !== $state['bytes']) { fclose($lock); remove_upload($paths); respond(409, ['error' => 'Upload is incomplete. Please retry.']); }
    $raw = file_get_contents($paths[1]);
    remove_upload($paths); flock($lock, LOCK_UN); fclose($lock);
    $body = json_decode($raw, true);
    if (!is_array($body) || isset($body['action'])) respond(400, ['error' => 'Invalid uploaded analysis request.']);
    return $body;
}
