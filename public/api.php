<?php
// Visitor keys are persisted only in a Secure, HttpOnly, SameSite cookie.
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond($status, $data) { http_response_code($status); echo json_encode($data); exit; }
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin !== 'https://testamentofsteel.com') respond(403, ['error' => 'Cross-origin requests are disabled.']);
const KEY_COOKIE = '__Secure-sonic_openai';
function valid_key($key) { return is_string($key) && strlen($key) <= 512 && preg_match('/^sk-[A-Za-z0-9_-]{10,}$/D', $key); }
function save_key_cookie($key) {
    return setcookie(KEY_COOKIE, $key, ['expires' => $key === '' ? time() - 3600 : time() + 30 * 86400,
        'path' => '/sonic-critic/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
}
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'status') {
    respond(200, ['configured' => (bool)valid_key($_COOKIE[KEY_COOKIE] ?? '')]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['error' => 'POST required.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) respond(415, ['error' => 'JSON required.']);
// Six requests/minute/IP. Store only a hashed address and counters outside webroot.
$bucket = sys_get_temp_dir() . '/sonic-openai-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.json';
$lock = @fopen($bucket, 'c+');
if (!$lock || !flock($lock, LOCK_EX)) respond(503, ['error' => 'Request limiter unavailable.']);
@chmod($bucket, 0600);
$counter = json_decode(stream_get_contents($lock), true) ?: ['start' => time(), 'count' => 0];
if (time() - $counter['start'] >= 60) $counter = ['start' => time(), 'count' => 0];
if ($counter['count'] >= 6) { flock($lock, LOCK_UN); fclose($lock); header('Retry-After: 60'); respond(429, ['error' => 'Too many requests. Wait one minute and retry.']); }
$counter['count']++;
ftruncate($lock, 0); rewind($lock); fwrite($lock, json_encode($counter)); fflush($lock); flock($lock, LOCK_UN); fclose($lock);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 64 * 1024 * 1024) respond(413, ['error' => 'Audio is too large. Upload a shorter excerpt.']);
$raw = file_get_contents('php://input', false, null, 0, 64 * 1024 * 1024 + 1);
if (strlen($raw) > 64 * 1024 * 1024) respond(413, ['error' => 'Audio is too large.']);
$body = json_decode($raw, true); unset($raw);
if (!is_array($body)) respond(400, ['error' => 'Invalid JSON.']);
$action = $body['action'] ?? '';
if ($action === 'clear') {
    if (!save_key_cookie('')) respond(500, ['error' => 'Cannot clear key cookie.']);
    respond(200, ['configured' => false]);
}
$key = $body['apiKey'] ?? ($_COOKIE[KEY_COOKIE] ?? '');
if (!valid_key($key)) respond(401, ['error' => 'Enter your OpenAI API key using OpenAI Setup.']);
if ($action === 'remember') {
    if (!save_key_cookie($key)) respond(500, ['error' => 'Cannot save key cookie.']);
    respond(200, ['configured' => true]);
}
$messages = $body['messages'] ?? null; $system = $body['systemInstruction'] ?? null; $schema = $body['schema'] ?? null;
if (!is_array($messages) || count($messages) === 0 || !is_string($system)) respond(400, ['error' => 'Invalid request.']);
$hasAudio = false;
foreach ($messages as $message) {
    if (!is_array($message) || !in_array($message['role'] ?? '', ['user','assistant'], true) || !is_array($message['content'] ?? null)) respond(400, ['error' => 'Invalid message.']);
    foreach ($message['content'] as $part) {
        if (($part['type'] ?? '') === 'text' && is_string($part['text'] ?? null)) continue;
        if (($part['type'] ?? '') === 'image_url' && preg_match('/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/D', $part['image_url']['url'] ?? '')) continue;
        if (($part['type'] ?? '') === 'input_audio' && in_array($part['input_audio']['format'] ?? '', ['wav','mp3'], true) && preg_match('/^[A-Za-z0-9+\/=]+$/D', $part['input_audio']['data'] ?? '')) { $hasAudio = true; continue; }
        respond(400, ['error' => 'Invalid or unsupported media.']);
    }
}
if (!function_exists('curl_init')) respond(503, ['error' => 'Audio service is unavailable on this host.']);
set_time_limit(360);
function call_openai($payload, $key) {
    $curl = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 170]);
    $raw = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
    if ($raw === false || $status === 0) respond(502, ['error' => 'Cannot reach OpenAI. Please retry.']);
    $data = json_decode($raw, true);
    if ($status < 200 || $status >= 300) {
        $detail = str_replace($key, '[redacted]', $data['error']['message'] ?? 'Request failed.');
        $detail = preg_replace('/sk-[A-Za-z0-9_*-]+/', '[redacted]', $detail);
        respond($status, ['error' => 'OpenAI (' . $status . '): ' . $detail]);
    }
    $choice = $data['choices'][0] ?? [];
    if (($choice['finish_reason'] ?? '') === 'length') respond(502, ['error' => 'OpenAI response was truncated. Try a shorter excerpt.']);
    if (!empty($choice['message']['refusal'])) respond(422, ['error' => 'OpenAI declined this request.']);
    $text = $choice['message']['content'] ?? null;
    if (!is_string($text) || trim($text) === '') respond(502, ['error' => 'OpenAI returned an empty response.']);
    return $text;
}
function matches_schema($value, $schema) {
    $type = $schema['type'] ?? '';
    if ($type === 'object') {
        if (!is_object($value)) return false;
        foreach ($schema['required'] ?? [] as $name) if (!property_exists($value, $name)) return false;
        foreach ($schema['properties'] ?? [] as $name => $child) if (property_exists($value, $name) && !matches_schema($value->$name, $child)) return false;
    } elseif ($type === 'array') {
        if (!is_array($value)) return false;
        foreach ($value as $item) if (!matches_schema($item, $schema['items'] ?? [])) return false;
    } elseif ($type === 'string' && !is_string($value)) return false;
    elseif ($type === 'number' && !is_int($value) && !is_float($value)) return false;
    if (isset($schema['enum']) && !in_array($value, $schema['enum'], true)) return false;
    return true;
}
if ($schema !== null && (!is_array($schema) || ($schema['type'] ?? '') !== 'object')) respond(400, ['error' => 'Invalid report schema.']);
if ($hasAudio) {
    $findings = call_openai(['model' => 'gpt-audio-1.5', 'modalities' => ['text'], 'messages' => array_merge([
        ['role' => 'system', 'content' => $system . "\nListen to the supplied audio and provide detailed sonic findings, timestamps and recommendations. Distinguish observations from uncertain inferences. Do not claim to measure values not supplied in context."]
    ], $messages)], $key);
    if ($schema === null) respond(200, ['text' => $findings]);
    $messages = [['role' => 'user', 'content' => $findings]];
    $system .= "\nFormat these listening findings as the requested JSON report. Preserve observations and uncertainty; do not invent audible findings.";
}
$payload = ['model' => 'gpt-4.1', 'messages' => array_merge([['role' => 'system', 'content' => $system]], $messages)];
if ($schema !== null) $payload['response_format'] = ['type' => 'json_schema', 'json_schema' => ['name' => 'sonic_report', 'strict' => false, 'schema' => $schema]];
$text = call_openai($payload, $key);
if ($schema !== null) {
    $report = json_decode($text);
    if (json_last_error() !== JSON_ERROR_NONE || !matches_schema($report, $schema)) respond(502, ['error' => 'OpenAI returned an incomplete report. Please retry.']);
}
respond(200, ['text' => $text]);
