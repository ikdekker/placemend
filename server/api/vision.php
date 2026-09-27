<?php
// Placemend API - AI photo scan: identify household products in a photo of a cupboard/shelf.
// Uses Google's Gemini API. Config lives in the private data dir: data/accounts/gemini.json
//   { "apiKey": "...", "model": "gemini-3.8-flash", "dailyLimit": 50 }
require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonError('Method not allowed. Use POST.', 405);
}

// Only signed-in accounts (user workspace keys) may spend the AI budget
$apiKey = getWorkspaceApiKey();
if (strpos($apiKey, 'pm_usr_') !== 0) {
    sendJsonError('Sign in to use photo scanning.', 401);
}

$accountsDir = getDataDirectory() . '/accounts';
$config = json_decode((string)@file_get_contents($accountsDir . '/gemini.json'), true);
$geminiKey = trim((string)($config['apiKey'] ?? ''));
if ($geminiKey === '') {
    sendJsonError('Photo scanning is not configured on the server yet.', 503);
}
$model = preg_replace('/[^a-zA-Z0-9._-]/', '', (string)($config['model'] ?? 'gemini-3.8-flash'));
$dailyLimit = max(1, (int)($config['dailyLimit'] ?? 50));

// Per-account daily cap
$usageFile = $accountsDir . '/vision-usage.json';
$today = date('Y-m-d');
$usage = json_decode((string)@file_get_contents($usageFile), true);
if (!is_array($usage) || ($usage['date'] ?? '') !== $today) {
    $usage = ['date' => $today, 'counts' => []];
}
$used = (int)($usage['counts'][$apiKey] ?? 0);
if ($used >= $dailyLimit) {
    sendJsonError("Daily scan limit reached ($dailyLimit). Try again tomorrow.", 429);
}

$body = getJsonBody();
$image = (string)($body['image'] ?? '');
$mime = in_array($body['mimeType'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true) ? $body['mimeType'] : 'image/jpeg';
if ($image === '' || strlen($image) > 8 * 1024 * 1024 || !preg_match('/^[A-Za-z0-9+\/=]+$/', $image)) {
    sendJsonError('Missing or invalid image.', 400);
}

$furnitureName = substr((string)($body['furnitureName'] ?? ''), 0, 120);
$roomName = substr((string)($body['roomName'] ?? ''), 0, 120);
$slots = [];
foreach (array_slice(is_array($body['slots'] ?? null) ? $body['slots'] : [], 0, 60) as $s) {
    $id = substr((string)($s['id'] ?? ''), 0, 120);
    $label = substr((string)($s['label'] ?? ''), 0, 200);
    if ($id !== '' && $label !== '') $slots[] = ['id' => $id, 'label' => $label];
}
$slotIds = array_column($slots, 'id');
$slotList = implode("\n", array_map(fn($s) => "- {$s['id']}: {$s['label']}", $slots));
// Scoped scan: the photo shows only one part of the furniture (e.g. a single open door)
$scopeLabel = substr(trim((string)($body['scopeLabel'] ?? '')), 0, 200);
$scopeLine = $scopeLabel !== ''
    ? "This photo shows ONLY this part of the furniture: \"{$scopeLabel}\". Ignore anything visible outside it (neighbouring shelves, other doors)."
    : '';

$prompt = <<<PROMPT
You are cataloguing a home inventory from a photo of storage furniture.
Furniture: "{$furnitureName}" in room "{$roomName}".
{$scopeLine}
Storage slots you may use (id: label):
{$slotList}

For every distinct product you can see, identify the product rather than describing it:
- name: short product name in the SINGULAR ("Frying pan", never "Frying pans"), in English.
- brand and model when readable or recognisable (e.g. "Optimum Nutrition Gold Standard Whey"); empty string if unknown.
- size: capacity/weight/dimensions if readable or estimable (e.g. "2.27 kg", "1 L", "28 cm"); append "?" when estimated; empty string if unknown.
- quantity: how many identical units are visible (count them). Different sizes or variants are separate entries.
- slotId: the id of the slot the item is in, chosen from the list above; use the closest match.
- category: one of Kitchen, Food, Supplements, Electronics, Cables, Documents, Tools, Cleaning, Linens, Clothing, Sports, Toiletries, Medicine, Memorabilia, Office, Toys, Other.
- confidence: 0 to 1, how sure you are about the identification.
Do not describe colours, shapes or packaging unless the product cannot be identified. Do not list the furniture itself, shelves, doors or hinges. Do not invent items that are not visible.
PROMPT;

$schema = [
    'type' => 'OBJECT',
    'properties' => [
        'items' => [
            'type' => 'ARRAY',
            'items' => [
                'type' => 'OBJECT',
                'properties' => [
                    'name' => ['type' => 'STRING'],
                    'brand' => ['type' => 'STRING'],
                    'size' => ['type' => 'STRING'],
                    'quantity' => ['type' => 'INTEGER'],
                    'slotId' => ['type' => 'STRING'],
                    'category' => ['type' => 'STRING'],
                    'confidence' => ['type' => 'NUMBER'],
                ],
                'required' => ['name', 'brand', 'size', 'quantity', 'slotId', 'category', 'confidence'],
            ],
        ],
    ],
    'required' => ['items'],
];

$request = [
    'contents' => [[
        'role' => 'user',
        'parts' => [
            ['inline_data' => ['mime_type' => $mime, 'data' => $image]],
            ['text' => $prompt],
        ],
    ]],
    'generationConfig' => [
        'responseMimeType' => 'application/json',
        'responseSchema' => $schema,
        'temperature' => 0.2,
    ],
];

// Google returns 503 ("high demand") / 429 in spikes, sometimes for a while on one model:
// retry once, then fall back to the next model in the chain
$fallbacks = is_array($config['fallbackModels'] ?? null) ? $config['fallbackModels'] : ['gemini-3.7-flash', 'gemini-3.5-flash'];
$modelChain = array_values(array_unique(array_merge([$model], array_map(
    fn($m) => preg_replace('/[^a-zA-Z0-9._-]/', '', (string)$m), $fallbacks
))));
$payload = json_encode($request);
$attempts = [];
foreach ($modelChain as $model) {
    $attempts[] = [$model, 0];
    $attempts[] = [$model, 2];
}
foreach ($attempts as [$model, $waitSeconds]) {
    if ($waitSeconds > 0) sleep($waitSeconds);
    $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . $geminiKey],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    if ($response !== false && !in_array($httpCode, [429, 503, 404], true)) break; // 404: model retired for this key
}

if ($response === false) {
    sendJsonError('Could not reach the AI service: ' . $curlError, 502);
}
$data = json_decode($response, true);
if ($httpCode !== 200) {
    $msg = $data['error']['message'] ?? "HTTP $httpCode";
    sendJsonError('AI service error: ' . substr($msg, 0, 300), 502);
}

// Count the scan only once the AI actually answered
$usage['counts'][$apiKey] = $used + 1;
@file_put_contents($usageFile, json_encode($usage), LOCK_EX);
@chmod($usageFile, 0666);

$text = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
$parsed = json_decode($text, true);
if (!is_array($parsed) || !is_array($parsed['items'] ?? null)) {
    $reason = $data['candidates'][0]['finishReason'] ?? 'unknown';
    sendJsonError("The AI returned no usable result (finish reason: $reason). Try another photo.", 502);
}

$items = [];
foreach ($parsed['items'] as $it) {
    $name = trim((string)($it['name'] ?? ''));
    if ($name === '') continue;
    $slotId = (string)($it['slotId'] ?? '');
    $items[] = [
        'name' => substr($name, 0, 120),
        'brand' => substr(trim((string)($it['brand'] ?? '')), 0, 120),
        'size' => substr(trim((string)($it['size'] ?? '')), 0, 60),
        'quantity' => max(1, min(999, (int)($it['quantity'] ?? 1))),
        'slotId' => in_array($slotId, $slotIds, true) ? $slotId : ($slotIds[0] ?? ''),
        'category' => substr(trim((string)($it['category'] ?? 'Other')), 0, 40),
        'confidence' => max(0, min(1, (float)($it['confidence'] ?? 0.5))),
    ];
}

sendJsonResponse([
    'success' => true,
    'model' => $model,
    'items' => $items,
    'scansLeftToday' => max(0, $dailyLimit - $used - 1),
]);
