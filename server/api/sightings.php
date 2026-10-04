<?php
// Placemend API - sightings: things a camera or robot (e.g. a robot vacuum's obstacle camera) saw lying
// around, waiting in an inbox until the user accepts them as an item, links them to an existing item or
// dismisses them. Kept out of the workspace JSON (photos would make every sync heavy):
//   data/sightings/<workspace>.json      { sightings: [...], sources: { key: settings } }
//   data/sightings/<workspace>/<id>.jpg  photos
//
//   POST sightings.php (multipart/form-data, or JSON with photo_base64)   -> report a sighting
//        source_type, source_name, label, confidence (0-100 or 0-1), room, seen_at (ISO or ms),
//        details (JSON), source_ref (de-duplication), photo (file)
//   GET  sightings.php[?status=pending|all]   -> sightings (newest first) and per-source settings
//   GET  sightings.php?photo=<id>             -> the sighting's photo
//   POST sightings.php {"action": "accept" | "link" | "dismiss" | "reopen" | "ai_result" | "settings", ...}

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/history_lib.php';

const SIGHTINGS_MAX = 500;                  // kept per workspace; resolved ones are pruned first
const SIGHTING_PHOTO_MAX = 5 * 1024 * 1024; // bytes
const SIGHTING_PHOTO_INLINE_MAX = 400000;   // photos up to this size are copied onto accepted items
const SECOND_PASS_MODES = ['off', 'on_demand', 'auto'];

$apiKey = getWorkspaceApiKey();
if (strpos($apiKey, 'pm_usr_') !== 0) sendJsonError('Sightings are available for signed-in workspaces.', 403);

// ---------------------------------------------------------------- storage

function sightingsBase(string $apiKey): string {
    $dir = getDataDirectory() . '/sightings';
    if (!is_dir($dir)) @mkdir($dir, 0770, true);
    return $dir . '/' . basename(getWorkspaceFilePath($apiKey), '.json');
}

function loadSightings(string $apiKey): array {
    $data = json_decode((string)@file_get_contents(sightingsBase($apiKey) . '.json'), true);
    $data = is_array($data) ? $data : [];
    return [
        'sightings' => is_array($data['sightings'] ?? null) ? $data['sightings'] : [],
        'sources' => is_array($data['sources'] ?? null) ? $data['sources'] : [],
    ];
}

function saveSightings(string $apiKey, array $data): void {
    // Over the cap: drop the oldest resolved sightings (and their photos), then the oldest pending ones
    if (count($data['sightings']) > SIGHTINGS_MAX) {
        usort($data['sightings'], fn($a, $b) => ($a['status'] === 'pending') <=> ($b['status'] === 'pending') ?: ($a['seenAt'] <=> $b['seenAt']));
        foreach (array_splice($data['sightings'], 0, count($data['sightings']) - SIGHTINGS_MAX) as $old) {
            if (!empty($old['photo'])) @unlink(sightingsBase($apiKey) . '/' . $old['photo']);
        }
    }
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (@file_put_contents(sightingsBase($apiKey) . '.json', $json, LOCK_EX) === false) {
        sendJsonError('Could not save the sighting on the server.', 500);
    }
}

function sourceKey(string $type, string $name): string {
    return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower("$type $name")), '-') ?: 'unknown';
}

function sourceSettings(array $data, string $key): array {
    $s = $data['sources'][$key] ?? [];
    return [
        'secondPass' => in_array($s['secondPass'] ?? '', SECOND_PASS_MODES, true) ? $s['secondPass'] : 'on_demand',
        'ignoredLabels' => array_values(array_filter(array_map('strval', is_array($s['ignoredLabels'] ?? null) ? $s['ignoredLabels'] : []))),
    ] + $s;
}

function &findSighting(array &$data, string $id): array {
    foreach ($data['sightings'] as &$s) {
        if (($s['id'] ?? '') === $id) return $s;
    }
    unset($s);
    sendJsonError("Unknown sighting: $id", 404);
}

// ---------------------------------------------------------------- workspace helpers

/** Room by id or name (exact, then partial); own rooms only */
function sightingRoom(array $ws, ?string $q): ?array {
    $q = trim((string)$q);
    if ($q === '') return null;
    $rooms = array_values(array_filter($ws['rooms'] ?? [], fn($r) => empty($r['shareId'])));
    foreach ($rooms as $r) if (($r['id'] ?? '') === $q) return $r;
    $norm = fn($s) => trim(preg_replace('/\s+/', ' ', strtolower((string)$s)));
    foreach ($rooms as $r) if ($norm($r['name'] ?? '') === $norm($q)) return $r;
    $partial = array_values(array_filter($rooms, fn($r) => strpos($norm($r['name'] ?? ''), $norm($q)) !== false || strpos($norm($q), $norm($r['name'] ?? '-')) !== false));
    return count($partial) === 1 ? $partial[0] : null;
}

/** The room's "Floor" spot (furniture + container), created when missing */
function floorContainerId(array &$ws, array $room, int $now): string {
    $floor = null;
    foreach ($ws['furniture'] as $f) {
        if (($f['roomId'] ?? '') === $room['id'] && strtolower(trim($f['name'] ?? '')) === 'floor') { $floor = $f; break; }
    }
    if (!$floor) {
        $floor = [
            'id' => generateId('furn'),
            'roomId' => $room['id'],
            'name' => 'Floor',
            'type' => 'other',
            'shape' => 'zone',
            'position' => ['x' => 0, 'y' => 0, 'rotation' => 0],
            'dimension' => ['width' => 2, 'length' => 2],
            'color' => '#94a3b8',
            'notes' => 'Things found lying on the floor (e.g. by a robot vacuum).',
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
        $ws['furniture'][] = $floor;
    }
    foreach ($ws['containers'] as $c) {
        if (($c['furnitureId'] ?? '') === $floor['id'] && empty($c['parentContainerId'])) return $c['id'];
    }
    $container = [
        'id' => generateId('cont'),
        'furnitureId' => $floor['id'],
        'name' => 'Floor',
        'type' => 'general',
        'orderIndex' => 0,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $ws['containers'][] = $container;
    return $container['id'];
}

function seenLine(array $s): string {
    $where = $s['roomName'] ? " in {$s['roomName']}" : '';
    return sprintf('Seen by %s on %s%s.', $s['source']['name'], date('Y-m-d H:i', (int)($s['seenAt'] / 1000)), $where);
}

function saveWorkspaceChange(string $apiKey, array $old, array $ws, array $sighting): void {
    historyRecordDiff($old, $ws, $sighting['source']['name'] . ' (sighting)');
    if (!saveWorkspace($apiKey, $ws)) sendJsonError('Could not save the change on the server. Please try again.', 500);
}

// ---------------------------------------------------------------- GET

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = loadSightings($apiKey);

    if (isset($_GET['photo'])) {
        $s = findSighting($data, (string)$_GET['photo']);
        $path = sightingsBase($apiKey) . '/' . ($s['photo'] ?? '');
        if (empty($s['photo']) || !is_file($path)) sendJsonError('This sighting has no photo.', 404);
        header('Content-Type: ' . ($s['photoType'] ?? 'image/jpeg'));
        header('Cache-Control: private, max-age=86400');
        readfile($path);
        exit;
    }

    $status = (string)($_GET['status'] ?? 'pending');
    $list = array_values(array_filter($data['sightings'], fn($s) => $status === 'all' || $s['status'] === $status));
    usort($list, fn($a, $b) => $b['seenAt'] <=> $a['seenAt']);
    $sources = [];
    foreach ($data['sources'] as $key => $_) $sources[$key] = sourceSettings($data, $key);
    sendJsonResponse([
        'success' => true,
        'sightings' => $list,
        'sources' => (object)$sources,
        'pendingCount' => count(array_filter($data['sightings'], fn($s) => $s['status'] === 'pending')),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendJsonError('Method not allowed. Use GET or POST.', 405);

$isJson = stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== false;
$body = $isJson ? getJsonBody() : $_POST;
$now = (int)round(microtime(true) * 1000);

// ---------------------------------------------------------------- POST: report a sighting

if (!isset($body['action'])) {
    $type = substr(trim((string)($body['source_type'] ?? 'camera')), 0, 40) ?: 'camera';
    $name = substr(trim((string)($body['source_name'] ?? '')), 0, 80) ?: ucfirst(str_replace('_', ' ', $type));
    $label = substr(trim((string)($body['label'] ?? '')), 0, 80);
    $key = sourceKey($type, $name);

    $data = loadSightings($apiKey);
    $settings = sourceSettings($data, $key);
    $data['sources'][$key] = ['type' => $type, 'name' => $name, 'lastSeenAt' => $now] + $settings;

    foreach ($settings['ignoredLabels'] as $ignored) {
        if ($label !== '' && strcasecmp($ignored, $label) === 0) {
            saveSightings($apiKey, $data);
            sendJsonResponse(['success' => true, 'ignored' => true, 'message' => "\"$label\" is ignored for $name."]);
        }
    }

    $ref = substr(trim((string)($body['source_ref'] ?? '')), 0, 200);
    if ($ref !== '') {
        foreach ($data['sightings'] as $s) {
            if ($s['sourceKey'] === $key && ($s['sourceRef'] ?? '') === $ref) {
                sendJsonResponse(['success' => true, 'duplicate' => true, 'id' => $s['id']]);
            }
        }
    }

    // Photo: uploaded file, or base64 in a JSON body
    $photo = null;
    if (!empty($_FILES['photo']['tmp_name']) && is_uploaded_file($_FILES['photo']['tmp_name'])) {
        if ($_FILES['photo']['size'] > SIGHTING_PHOTO_MAX) sendJsonError('Photo too large (max 5 MB).', 413);
        $photo = (string)file_get_contents($_FILES['photo']['tmp_name']);
    } elseif (!empty($body['photo_base64'])) {
        $photo = base64_decode(preg_replace('/^data:[^,]*,/', '', (string)$body['photo_base64']), true);
        if ($photo === false || strlen($photo) > SIGHTING_PHOTO_MAX) sendJsonError('Invalid or too large photo_base64.', 400);
    }
    $photoType = null;
    if ($photo !== null) {
        $info = @getimagesizefromstring($photo);
        $photoType = $info['mime'] ?? '';
        if (!in_array($photoType, ['image/jpeg', 'image/png', 'image/webp'], true)) sendJsonError('Photo must be a JPEG, PNG or WebP image.', 400);
    }
    if ($photo === null && $label === '') sendJsonError('Send at least a photo or a label.', 400);

    $confidence = is_numeric($body['confidence'] ?? null) ? (float)$body['confidence'] : null;
    if ($confidence !== null && $confidence <= 1) $confidence *= 100;
    $seenAt = $body['seen_at'] ?? null;
    $seenAt = is_numeric($seenAt) ? (int)$seenAt : (($t = strtotime((string)$seenAt)) ? $t * 1000 : $now);
    if ($seenAt < 100000000000) $seenAt *= 1000; // given in seconds
    $details = $body['details'] ?? null;
    if (is_string($details)) $details = json_decode($details, true);

    $ws = loadWorkspace($apiKey);
    $roomQuery = substr(trim((string)($body['room'] ?? '')), 0, 120);
    $room = sightingRoom($ws, $roomQuery);

    $id = generateId('sight');
    $sighting = [
        'id' => $id,
        'sourceKey' => $key,
        'source' => ['type' => $type, 'name' => $name],
        'sourceRef' => $ref !== '' ? $ref : null,
        'label' => $label,
        'confidence' => $confidence !== null ? (int)round(max(0, min(100, $confidence))) : null,
        'roomName' => $room['name'] ?? ($roomQuery !== '' ? $roomQuery : null),
        'roomId' => $room['id'] ?? null,
        'seenAt' => $seenAt,
        'receivedAt' => $now,
        'details' => is_array($details) ? $details : null,
        'photo' => null,
        'photoType' => $photoType,
        'status' => 'pending',
        'ai' => null,
    ];
    if ($photo !== null) {
        $dir = sightingsBase($apiKey);
        if (!is_dir($dir)) @mkdir($dir, 0770, true);
        $file = $id . ['image/jpeg' => '.jpg', 'image/png' => '.png', 'image/webp' => '.webp'][$photoType];
        if (@file_put_contents("$dir/$file", $photo) === false) sendJsonError('Could not store the photo.', 500);
        $sighting['photo'] = $file;
    }
    $data['sightings'][] = $sighting;
    saveSightings($apiKey, $data);
    sendJsonResponse(['success' => true, 'id' => $id, 'room' => $sighting['roomName'], 'roomMatched' => $room !== null, 'secondPass' => $settings['secondPass']], 201);
}

// ---------------------------------------------------------------- POST: inbox actions

$action = (string)$body['action'];
$data = loadSightings($apiKey);

if ($action === 'settings') {
    $key = (string)($body['source'] ?? '');
    if (!isset($data['sources'][$key])) sendJsonError("Unknown source: $key", 404);
    if (isset($body['secondPass'])) {
        if (!in_array($body['secondPass'], SECOND_PASS_MODES, true)) sendJsonError('secondPass must be off, on_demand or auto.');
        $data['sources'][$key]['secondPass'] = $body['secondPass'];
    }
    if (isset($body['ignoredLabels']) && is_array($body['ignoredLabels'])) {
        $labels = array_map(fn($l) => substr(trim((string)$l), 0, 80), $body['ignoredLabels']);
        $data['sources'][$key]['ignoredLabels'] = array_values(array_unique(array_filter($labels)));
    }
    saveSightings($apiKey, $data);
    sendJsonResponse(['success' => true, 'source' => sourceSettings($data, $key)]);
}

$s = &findSighting($data, (string)($body['id'] ?? ''));

switch ($action) {
    case 'dismiss':
    case 'reopen':
        $s['status'] = $action === 'dismiss' ? 'dismissed' : 'pending';
        $s['resolvedAt'] = $action === 'dismiss' ? $now : null;
        saveSightings($apiKey, $data);
        sendJsonResponse(['success' => true, 'message' => $action === 'dismiss' ? 'Dismissed.' : 'Back in the inbox.']);

    case 'ai_result': {
        // The app ran the second pass (vision.php) on this photo and stores what it found
        $found = [];
        foreach (array_slice(is_array($body['items'] ?? null) ? $body['items'] : [], 0, 20) as $it) {
            $n = substr(trim((string)($it['name'] ?? '')), 0, 120);
            if ($n === '') continue;
            $found[] = [
                'name' => $n,
                'brand' => substr(trim((string)($it['brand'] ?? '')), 0, 120),
                'category' => substr(trim((string)($it['category'] ?? '')), 0, 40),
                'confidence' => max(0, min(1, (float)($it['confidence'] ?? 0))),
            ];
        }
        $s['ai'] = ['at' => $now, 'model' => substr((string)($body['model'] ?? ''), 0, 60), 'items' => $found];
        saveSightings($apiKey, $data);
        sendJsonResponse(['success' => true, 'ai' => $s['ai']]);
    }

    case 'accept': {
        if ($s['status'] !== 'pending') sendJsonError('This sighting was already handled.', 409);
        $ws = loadWorkspace($apiKey);
        $old = $ws;
        $idx = wsIndex($ws);
        $cid = trim((string)($body['containerId'] ?? ''));
        if ($cid === '') {
            $room = sightingRoom($ws, (string)($body['roomId'] ?? '') ?: ($s['roomId'] ?? $s['roomName'] ?? ''));
            if (!$room) sendJsonError('Pick a room or a place for this item.', 422);
            $cid = floorContainerId($ws, $room, $now);
            $idx = wsIndex($ws);
        } elseif (!isset($idx['containers'][$cid]) || !empty($idx['containers'][$cid]['shareId'])) {
            sendJsonError("Unknown place: $cid", 404);
        }
        $name = substr(trim((string)($body['name'] ?? '')), 0, 120) ?: ($s['label'] ?: 'Found item');
        $tags = array_values(array_filter(array_map(fn($t) => substr(trim((string)$t), 0, 40), is_array($body['tags'] ?? null) ? $body['tags'] : [])));
        $item = [
            'id' => generateId('item'),
            'containerId' => $cid,
            'name' => $name,
            'quantity' => max(1, min(999, (int)($body['quantity'] ?? 1))),
            'tags' => array_values(array_unique(array_merge($tags, ['spotted']))),
            'description' => trim((string)($body['description'] ?? '') . "\n" . seenLine($s)),
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
        if (!empty($body['category'])) $item['category'] = substr(trim((string)$body['category']), 0, 40);
        $photoPath = sightingsBase($apiKey) . '/' . ($s['photo'] ?? '');
        if (!empty($s['photo']) && is_file($photoPath) && filesize($photoPath) <= SIGHTING_PHOTO_INLINE_MAX) {
            $item['photoDataUrl'] = 'data:' . ($s['photoType'] ?? 'image/jpeg') . ';base64,' . base64_encode((string)file_get_contents($photoPath));
        }
        $ws['items'][] = $item;
        saveWorkspaceChange($apiKey, $old, $ws, $s);
        $s['status'] = 'accepted';
        $s['itemId'] = $item['id'];
        $s['resolvedAt'] = $now;
        saveSightings($apiKey, $data);
        sendJsonResponse(['success' => true, 'itemId' => $item['id'], 'message' => "Added \"$name\" to " . wsContainerPath(wsIndex($ws), $cid) . '.']);
    }

    case 'link': {
        if ($s['status'] !== 'pending') sendJsonError('This sighting was already handled.', 409);
        $ws = loadWorkspace($apiKey);
        $old = $ws;
        $itemId = (string)($body['itemId'] ?? '');
        $found = false;
        foreach ($ws['items'] as &$it) {
            if (($it['id'] ?? '') !== $itemId || !empty($it['shareId'])) continue;
            // One "Seen by" line per item: the latest sighting replaces the previous one
            $desc = preg_replace('/\n?Seen by [^\n]*$/', '', (string)($it['description'] ?? ''));
            $it['description'] = trim($desc . "\n" . seenLine($s));
            if (!empty($body['moveTo'])) {
                $room = sightingRoom($ws, $s['roomId'] ?? $s['roomName'] ?? '');
                if ($room) {
                    $it['containerId'] = floorContainerId($ws, $room, $now);
                }
            }
            $it['updatedAt'] = $now;
            $found = $it['name'] ?? 'item';
            break;
        }
        unset($it);
        if ($found === false) sendJsonError("Unknown item: $itemId", 404);
        saveWorkspaceChange($apiKey, $old, $ws, $s);
        $s['status'] = 'linked';
        $s['itemId'] = $itemId;
        $s['resolvedAt'] = $now;
        saveSightings($apiKey, $data);
        sendJsonResponse(['success' => true, 'message' => "Linked to \"$found\"."]);
    }
}

sendJsonError("Unknown action: $action", 400);
