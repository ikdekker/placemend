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

// Layout mode: recognise how the furniture is built (sections, doors, what's behind them)
$mode = in_array($body['mode'] ?? 'items', ['layout', 'identify'], true) ? $body['mode'] : 'items';
if ($mode === 'layout') {
    $prompt = <<<PROMPT
You are mapping how a piece of storage furniture is built, from a photo taken with its doors open.
Furniture: "{$furnitureName}" in room "{$roomName}".
{$scopeLine}

Describe its structure, not its contents:
- sections: the vertical sections from LEFT to RIGHT as you face the furniture. A section is one frame/carcass column.
  - width: 1 for a normal/narrow section, 2 for a section about twice as wide as the narrow ones.
  - door: "none" if the section is open (no door), "single" for one door, "pair" for two doors that close the same section.
  - parts: what is in the section from TOP to BOTTOM, each with:
    - type: shelf, rail (hanging rail), drawer, basket (wire/mesh basket or box), or open (open space without a shelf).
    - name: short, e.g. "Top shelf", "Hanging rail", "Drawer 2", "Shoe shelf". Number repeated parts.
- onTop: true if things are stored on top of the furniture.
Count shelves and drawers carefully. Ignore the items themselves (clothes, boxes) except to tell a shelf from a rail.
PROMPT;
    $partSchema = [
        'type' => 'OBJECT',
        'properties' => [
            'type' => ['type' => 'STRING', 'enum' => ['shelf', 'rail', 'drawer', 'basket', 'open']],
            'name' => ['type' => 'STRING'],
        ],
        'required' => ['type', 'name'],
    ];
    $schema = [
        'type' => 'OBJECT',
        'properties' => [
            'onTop' => ['type' => 'BOOLEAN'],
            'sections' => [
                'type' => 'ARRAY',
                'items' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'width' => ['type' => 'INTEGER'],
                        'door' => ['type' => 'STRING', 'enum' => ['none', 'single', 'pair']],
                        'parts' => ['type' => 'ARRAY', 'items' => $partSchema],
                    ],
                    'required' => ['width', 'door', 'parts'],
                ],
            ],
        ],
        'required' => ['onTop', 'sections'],
    ];
}

// Identify mode: what is this piece of furniture (photographed as it stands, doors closed or open)
$furnitureTypes = ['desk', 'closet', 'wardrobe', 'bookshelf', 'storage_rack', 'dresser', 'cabinet', 'table', 'bed', 'sofa',
    'workbench', 'box_stack', 'kitchen_counter', 'kitchen_island', 'appliance', 'other'];
if ($mode === 'identify') {
    $prompt = <<<PROMPT
You are adding a piece of furniture to a home inventory app from a photo of it, taken in room "{$roomName}".
Identify it and describe its front:
- name: short, recognisable name, with brand/model if obvious (e.g. "IKEA PAX wardrobe", "TV console", "KALLAX shelf").
- furnitureType: the closest category.
- width, depth, height: estimated outer size in METERS (use typical sizes of the recognised model when unsure).
- color: the main colour as a hex code, e.g. "#1f2937".
- sections: the vertical sections from LEFT to RIGHT as you face it (one frame/carcass column each).
  - width: 1 for a normal/narrow section, 2 for one about twice as wide.
  - fronts: what closes or divides that section from TOP to BOTTOM: door (one door), pair (two doors closing the same space),
    drawer, shelf (open shelf), basket (open box/basket/bin) or open (open space). A tall door covering the whole section is one front.
- hasDoors: true if any section has a door or pair.
If it's not storage furniture (e.g. a plain table or a sofa), give a single section with an appropriate front such as one shelf.
PROMPT;
    $schema = [
        'type' => 'OBJECT',
        'properties' => [
            'name' => ['type' => 'STRING'],
            'furnitureType' => ['type' => 'STRING', 'enum' => $furnitureTypes],
            'width' => ['type' => 'NUMBER'],
            'depth' => ['type' => 'NUMBER'],
            'height' => ['type' => 'NUMBER'],
            'color' => ['type' => 'STRING'],
            'hasDoors' => ['type' => 'BOOLEAN'],
            'sections' => [
                'type' => 'ARRAY',
                'items' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'width' => ['type' => 'INTEGER'],
                        'fronts' => [
                            'type' => 'ARRAY',
                            'items' => ['type' => 'STRING', 'enum' => ['door', 'pair', 'drawer', 'shelf', 'basket', 'open']],
                        ],
                    ],
                    'required' => ['width', 'fronts'],
                ],
            ],
        ],
        'required' => ['name', 'furnitureType', 'width', 'depth', 'height', 'color', 'hasDoors', 'sections'],
    ];
}

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
$fallbacks = is_array($config['fallbackModels'] ?? null) ? $config['fallbackModels'] : ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3-flash-preview'];
$modelChain = array_values(array_unique(array_merge([$model], array_map(
    fn($m) => preg_replace('/[^a-zA-Z0-9._-]/', '', (string)$m), $fallbacks
))));
$payload = json_encode($request);
$response = false;
$httpCode = 0;
$curlError = 'no model answered in time';
// nginx gives up after 60 s, so stop trying well before that and return a clear error instead
$deadline = microtime(true) + 50;
foreach ($modelChain as $model) {
    $remaining = (int)floor($deadline - microtime(true));
    if ($remaining < 5) break;
    $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => min(30, $remaining), // a hanging model must not use up the whole budget
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

if ($mode === 'identify') {
    if (!is_array($parsed) || trim((string)($parsed['name'] ?? '')) === '') {
        $reason = $data['candidates'][0]['finishReason'] ?? 'unknown';
        sendJsonError("The AI could not recognise the furniture (finish reason: $reason). Try a photo of the whole piece.", 502);
    }
    $meters = fn($v, $min, $max, $default) => is_numeric($v) && $v > 0 ? round(max($min, min($max, (float)$v)), 2) : $default;
    $sections = [];
    foreach (array_slice(is_array($parsed['sections'] ?? null) ? $parsed['sections'] : [], 0, 6) as $sec) {
        $fronts = [];
        foreach (array_slice(is_array($sec['fronts'] ?? null) ? $sec['fronts'] : [], 0, 10) as $fr) {
            if (in_array($fr, ['door', 'pair', 'drawer', 'shelf', 'basket', 'open'], true)) $fronts[] = $fr;
        }
        $sections[] = ['width' => ((int)($sec['width'] ?? 1)) >= 2 ? 2 : 1, 'fronts' => $fronts ?: ['shelf']];
    }
    $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($parsed['color'] ?? '')) ? $parsed['color'] : '#64748b';
    sendJsonResponse([
        'success' => true,
        'model' => $model,
        'furniture' => [
            'name' => substr(trim((string)$parsed['name']), 0, 80),
            'type' => in_array($parsed['furnitureType'] ?? '', $furnitureTypes, true) ? $parsed['furnitureType'] : 'other',
            'width' => $meters($parsed['width'] ?? null, 0.2, 6, 1),
            'depth' => $meters($parsed['depth'] ?? null, 0.2, 3, 0.5),
            'height' => $meters($parsed['height'] ?? null, 0.2, 3, 1),
            'color' => $color,
            'hasDoors' => (bool)($parsed['hasDoors'] ?? false),
            'sections' => $sections ?: [['width' => 1, 'fronts' => ['shelf']]],
        ],
        'scansLeftToday' => max(0, $dailyLimit - $used - 1),
    ]);
}

if ($mode === 'layout') {
    if (!is_array($parsed) || !is_array($parsed['sections'] ?? null) || count($parsed['sections']) === 0) {
        $reason = $data['candidates'][0]['finishReason'] ?? 'unknown';
        sendJsonError("The AI could not recognise the layout (finish reason: $reason). Try a photo with all doors open.", 502);
    }
    $sections = [];
    foreach (array_slice($parsed['sections'], 0, 6) as $sec) {
        $parts = [];
        foreach (array_slice(is_array($sec['parts'] ?? null) ? $sec['parts'] : [], 0, 16) as $p) {
            $type = in_array($p['type'] ?? '', ['shelf', 'rail', 'drawer', 'basket', 'open'], true) ? $p['type'] : 'shelf';
            $parts[] = ['type' => $type, 'name' => substr(trim((string)($p['name'] ?? ucfirst($type))), 0, 60) ?: ucfirst($type)];
        }
        $sections[] = [
            'width' => ((int)($sec['width'] ?? 1)) >= 2 ? 2 : 1,
            'door' => in_array($sec['door'] ?? '', ['none', 'single', 'pair'], true) ? $sec['door'] : 'none',
            'parts' => $parts,
        ];
    }
    sendJsonResponse([
        'success' => true,
        'model' => $model,
        'layout' => ['onTop' => (bool)($parsed['onTop'] ?? false), 'sections' => $sections],
        'scansLeftToday' => max(0, $dailyLimit - $used - 1),
    ]);
}

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
