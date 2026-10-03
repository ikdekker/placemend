<?php
// Placemend MCP server (Model Context Protocol, Streamable HTTP, JSON responses only).
// Lets Claude search the inventory and add, edit or move items. It cannot delete anything.
//
// Auth: the user's own workspace key (pm_usr_...), as "Authorization: Bearer <key>" or ?key=<key>.

require_once __DIR__ . '/common.php';

const MCP_PROTOCOL = '2025-06-18';
const MCP_TABLES = ['locations', 'rooms', 'furniture', 'containers', 'items'];

function mcpOut($payload, int $status = 200): void {
    http_response_code($status);
    if ($payload !== null) echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function mcpError($id, int $code, string $message): void {
    mcpOut(['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    // No server-initiated streams: GET (SSE) is not offered
    header('Allow: POST');
    mcpOut(['error' => 'Placemend MCP endpoint. Use POST with JSON-RPC.'], 405);
}

// Only real account workspaces; never the shared demo workspace
$apiKey = readWorkspaceApiKey();
if (strpos($apiKey, 'pm_usr_') !== 0 || !isAssignedUserWorkspaceKey($apiKey)) {
    header('WWW-Authenticate: Bearer realm="placemend"');
    mcpOut(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32001, 'message' => 'Missing or invalid Placemend workspace key.']], 401);
}

$raw = file_get_contents('php://input');
$msg = json_decode((string)$raw, true);
if (!is_array($msg)) mcpError(null, -32700, 'Parse error');
if (isset($msg[0])) mcpError(null, -32600, 'Batch requests are not supported');

$id = $msg['id'] ?? null;
$method = (string)($msg['method'] ?? '');
$params = is_array($msg['params'] ?? null) ? $msg['params'] : [];

// Notifications (no id) only need an acknowledgement
if (!array_key_exists('id', $msg)) mcpOut(null, 202);

switch ($method) {
    case 'initialize':
        mcpOut(['jsonrpc' => '2.0', 'id' => $id, 'result' => [
            'protocolVersion' => is_string($params['protocolVersion'] ?? null) ? $params['protocolVersion'] : MCP_PROTOCOL,
            'capabilities' => ['tools' => ['listChanged' => false]],
            'serverInfo' => ['name' => 'placemend', 'title' => 'Placemend', 'version' => '1.0.0'],
            'instructions' => "Placemend is the user's home inventory: rooms contain furniture, furniture contains containers "
                . "(shelves, drawers, doors, boxes; containers can be nested), containers contain items. "
                . "Use search_items to answer 'where is X'. Before adding items, find the right container with find_places "
                . "or get_room. Name items in the singular and put the count in quantity (\"Pan\" ×2, not \"Pans\"); "
                . "identify products (brand, size) rather than describing looks. Changes appear in the app next time it is opened.",
        ]]);

    case 'ping':
        mcpOut(['jsonrpc' => '2.0', 'id' => $id, 'result' => new stdClass()]);

    case 'tools/list':
        mcpOut(['jsonrpc' => '2.0', 'id' => $id, 'result' => ['tools' => mcpTools()]]);

    case 'tools/call':
        $name = (string)($params['name'] ?? '');
        $args = is_array($params['arguments'] ?? null) ? $params['arguments'] : [];
        try {
            $text = mcpCall($apiKey, $name, $args);
            mcpOut(['jsonrpc' => '2.0', 'id' => $id, 'result' => ['content' => [['type' => 'text', 'text' => $text]]]]);
        } catch (InvalidArgumentException $e) {
            // Tool errors go back to the model so it can correct itself
            mcpOut(['jsonrpc' => '2.0', 'id' => $id, 'result' => ['isError' => true, 'content' => [['type' => 'text', 'text' => $e->getMessage()]]]]);
        }

    default:
        mcpError($id, -32601, "Method not found: $method");
}

// ---------------------------------------------------------------- tools

function mcpTools(): array {
    $ro = ['readOnlyHint' => true, 'destructiveHint' => false];
    $rw = ['readOnlyHint' => false, 'destructiveHint' => false];
    return [
        [
            'name' => 'search_items',
            'title' => 'Find items',
            'description' => 'Search stored items by name, tag, category or description. Returns where each item is (room › furniture › container) with quantity and item_id.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'query' => ['type' => 'string', 'description' => 'What to look for, e.g. "batteries" or "AA"'],
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 25],
            ], 'required' => ['query']],
            'annotations' => $ro,
        ],
        [
            'name' => 'list_rooms',
            'title' => 'List rooms',
            'description' => 'List all rooms with their furniture and item counts.',
            'inputSchema' => ['type' => 'object', 'properties' => new stdClass()],
            'annotations' => $ro,
        ],
        [
            'name' => 'get_room',
            'title' => 'Show a room',
            'description' => 'Show one room (by id or name): its furniture and the full container tree with container_ids and item counts.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'room' => ['type' => 'string', 'description' => 'Room id or (part of the) room name'],
            ], 'required' => ['room']],
            'annotations' => $ro,
        ],
        [
            'name' => 'find_places',
            'title' => 'Find storage places',
            'description' => 'Find containers (shelves, drawers, doors, boxes) or furniture by name, e.g. "kitchen drawer" or "PAX". Returns container_ids to use with add_item and move_item.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'query' => ['type' => 'string'],
            ], 'required' => ['query']],
            'annotations' => $ro,
        ],
        [
            'name' => 'get_container',
            'title' => 'Show a container',
            'description' => 'List everything in one container, including containers nested inside it.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'container_id' => ['type' => 'string'],
            ], 'required' => ['container_id']],
            'annotations' => $ro,
        ],
        [
            'name' => 'add_item',
            'title' => 'Add an item',
            'description' => 'Add an item to a container. Use a singular product name and put the count in quantity. If an item with the same name already exists in that container, its quantity is increased instead.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'container_id' => ['type' => 'string'],
                'name' => ['type' => 'string', 'description' => 'Singular product name, e.g. "Duracell AA battery"'],
                'quantity' => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
                'category' => ['type' => 'string'],
                'tags' => ['type' => 'array', 'items' => ['type' => 'string']],
                'description' => ['type' => 'string'],
            ], 'required' => ['container_id', 'name']],
            'annotations' => $rw,
        ],
        [
            'name' => 'update_item',
            'title' => 'Edit an item',
            'description' => 'Change an item\'s name, quantity, category, tags or description. Only the given fields change. Quantity must be at least 1 (items cannot be deleted through this connector).',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'item_id' => ['type' => 'string'],
                'name' => ['type' => 'string'],
                'quantity' => ['type' => 'integer', 'minimum' => 1],
                'category' => ['type' => 'string'],
                'tags' => ['type' => 'array', 'items' => ['type' => 'string']],
                'description' => ['type' => 'string'],
            ], 'required' => ['item_id']],
            'annotations' => $rw,
        ],
        [
            'name' => 'move_item',
            'title' => 'Move an item',
            'description' => 'Move an item to another container.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'item_id' => ['type' => 'string'],
                'container_id' => ['type' => 'string', 'description' => 'Destination container'],
            ], 'required' => ['item_id', 'container_id']],
            'annotations' => $rw,
        ],
    ];
}

// ---------------------------------------------------------------- implementation

function mcpStr(array $args, string $key, bool $required = false): ?string {
    $v = $args[$key] ?? null;
    if ($v === null || (is_string($v) && trim($v) === '')) {
        if ($required) throw new InvalidArgumentException("Missing required argument: $key");
        return null;
    }
    if (!is_string($v) && !is_numeric($v)) throw new InvalidArgumentException("$key must be a string");
    $v = trim((string)$v);
    if (mb_strlen($v) > 300) throw new InvalidArgumentException("$key is too long (max 300 characters)");
    return $v;
}

function mcpTags(array $args): ?array {
    if (!array_key_exists('tags', $args)) return null;
    if (!is_array($args['tags'])) throw new InvalidArgumentException('tags must be a list of strings');
    $tags = [];
    foreach ($args['tags'] as $t) {
        if (is_string($t) && trim($t) !== '') $tags[] = mb_substr(trim($t), 0, 60);
    }
    return array_values(array_unique(array_slice($tags, 0, 30)));
}

function mcpQty(array $args, bool $required = false): ?int {
    if (!array_key_exists('quantity', $args)) return $required ? 1 : null;
    $q = filter_var($args['quantity'], FILTER_VALIDATE_INT);
    if ($q === false || $q < 1 || $q > 100000) throw new InvalidArgumentException('quantity must be a whole number of at least 1');
    return $q;
}

function mcpIndex(array $ws): array {
    $idx = [];
    foreach (MCP_TABLES as $t) {
        $idx[$t] = [];
        foreach ($ws[$t] ?? [] as $r) if (!empty($r['id'])) $idx[$t][$r['id']] = $r;
    }
    return $idx;
}

/** "Kitchen › PAX closet › Left door › Top shelf" */
function mcpContainerPath(array $idx, string $containerId): string {
    $parts = [];
    $c = $idx['containers'][$containerId] ?? null;
    $guard = 0;
    while ($c && $guard++ < 10) {
        array_unshift($parts, $c['name'] ?? '?');
        $c = !empty($c['parentContainerId']) ? ($idx['containers'][$c['parentContainerId']] ?? null) : null;
    }
    $root = $idx['containers'][$containerId] ?? null;
    while ($root && !empty($root['parentContainerId']) && isset($idx['containers'][$root['parentContainerId']])) {
        $root = $idx['containers'][$root['parentContainerId']];
    }
    $f = $root ? ($idx['furniture'][$root['furnitureId'] ?? ''] ?? null) : null;
    $room = $f ? ($idx['rooms'][$f['roomId'] ?? ''] ?? null) : null;
    if ($f) array_unshift($parts, $f['name'] ?? '?');
    if ($room) array_unshift($parts, $room['name'] ?? '?');
    return implode(' › ', $parts);
}

function mcpNorm(string $s): string {
    return mb_strtolower(trim($s));
}

/** Score a text against all query words: every word must match somewhere */
function mcpScore(string $query, array $fields): int {
    $words = preg_split('/\s+/', mcpNorm($query), -1, PREG_SPLIT_NO_EMPTY);
    if (!$words) return 0;
    $score = 0;
    foreach ($words as $w) {
        $best = 0;
        foreach ($fields as $weight => $text) {
            $t = mcpNorm((string)$text);
            if ($t === '') continue;
            if ($t === $w) $best = max($best, $weight * 3);
            elseif (preg_match('/\b' . preg_quote($w, '/') . '/u', $t)) $best = max($best, $weight * 2);
            elseif (mb_strpos($t, $w) !== false) $best = max($best, $weight);
        }
        // allow a simple plural/singular miss ("batteries" vs "battery")
        if ($best === 0 && mb_strlen($w) > 3) {
            $stem = preg_replace('/(ies|es|s)$/u', '', $w);
            foreach ($fields as $weight => $text) {
                if ($stem !== '' && mb_strpos(mcpNorm((string)$text), $stem) !== false) $best = max($best, $weight);
            }
        }
        if ($best === 0) return 0;
        $score += $best;
    }
    return $score;
}

function mcpRoomFor(array $idx, string $q): array {
    if (isset($idx['rooms'][$q])) return $idx['rooms'][$q];
    $matches = array_values(array_filter($idx['rooms'], fn($r) => mb_strpos(mcpNorm($r['name'] ?? ''), mcpNorm($q)) !== false));
    if (count($matches) === 1) return $matches[0];
    $names = implode(', ', array_map(fn($r) => $r['name'] ?? '?', $matches ?: array_values($idx['rooms'])));
    throw new InvalidArgumentException((count($matches) ? 'Several rooms match' : 'No room matches') . " \"$q\". Rooms: $names");
}

function mcpCall(string $apiKey, string $name, array $args): string {
    $ws = loadWorkspace($apiKey);
    $idx = mcpIndex($ws);
    $now = (int)round(microtime(true) * 1000);

    switch ($name) {
        case 'search_items': {
            $q = mcpStr($args, 'query', true);
            $limit = max(1, min(100, (int)($args['limit'] ?? 25)));
            $hits = [];
            foreach ($idx['items'] as $it) {
                $s = mcpScore($q, [
                    5 => $it['name'] ?? '',
                    3 => implode(' ', (array)($it['tags'] ?? [])),
                    2 => $it['category'] ?? '',
                    1 => $it['description'] ?? '',
                ]);
                if ($s > 0) $hits[] = [$s, $it];
            }
            usort($hits, fn($a, $b) => $b[0] <=> $a[0]);
            if (!$hits) return "No items match \"$q\".";
            $lines = [];
            foreach (array_slice($hits, 0, $limit) as [, $it]) {
                $lines[] = sprintf('- %s ×%d — %s (item_id: %s)', $it['name'] ?? '?', (int)($it['quantity'] ?? 1),
                    mcpContainerPath($idx, (string)($it['containerId'] ?? '')), $it['id']);
            }
            $more = count($hits) > $limit ? sprintf("\n…and %d more.", count($hits) - $limit) : '';
            return sprintf("%d item(s) match \"%s\":\n%s%s", count($hits), $q, implode("\n", $lines), $more);
        }

        case 'list_rooms': {
            if (!$idx['rooms']) return 'No rooms yet.';
            $lines = [];
            foreach ($idx['rooms'] as $r) {
                $furn = array_filter($idx['furniture'], fn($f) => ($f['roomId'] ?? '') === $r['id']);
                $fids = array_flip(array_keys($furn));
                $cids = [];
                foreach ($idx['containers'] as $c) if (isset($fids[$c['furnitureId'] ?? ''])) $cids[$c['id']] = true;
                $items = 0;
                foreach ($idx['items'] as $it) if (isset($cids[$it['containerId'] ?? ''])) $items += (int)($it['quantity'] ?? 1);
                $lines[] = sprintf('- %s (room_id: %s): %d furniture, %d items', $r['name'] ?? '?', $r['id'], count($furn), $items);
            }
            return implode("\n", $lines);
        }

        case 'get_room': {
            $room = mcpRoomFor($idx, mcpStr($args, 'room', true));
            $out = ["Room: {$room['name']} (room_id: {$room['id']})"];
            $counts = [];
            foreach ($idx['items'] as $it) $counts[$it['containerId'] ?? ''] = ($counts[$it['containerId'] ?? ''] ?? 0) + 1;
            $children = [];
            foreach ($idx['containers'] as $c) $children[$c['parentContainerId'] ?? ''][] = $c;
            $sortC = fn(&$list) => usort($list, fn($a, $b) => [($a['columnIndex'] ?? 0), ($a['orderIndex'] ?? 0)] <=> [($b['columnIndex'] ?? 0), ($b['orderIndex'] ?? 0)]);
            $walk = function (array $c, int $depth) use (&$walk, &$out, $children, $counts, $sortC) {
                $out[] = str_repeat('  ', $depth) . sprintf('- %s [%s] (container_id: %s) — %d item(s)',
                    $c['name'] ?? '?', $c['type'] ?? 'general', $c['id'], $counts[$c['id']] ?? 0);
                $kids = $children[$c['id']] ?? [];
                $sortC($kids);
                foreach ($kids as $k) $walk($k, $depth + 1);
            };
            $furn = array_filter($idx['furniture'], fn($f) => ($f['roomId'] ?? '') === $room['id']);
            if (!$furn) $out[] = '(no furniture)';
            foreach ($furn as $f) {
                $out[] = sprintf('%s [%s] (furniture_id: %s)', $f['name'] ?? '?', $f['type'] ?? 'other', $f['id']);
                $roots = array_values(array_filter($idx['containers'], fn($c) => ($c['furnitureId'] ?? '') === $f['id'] && empty($c['parentContainerId'])));
                $sortC($roots);
                if (!$roots) $out[] = '  (no containers)';
                foreach ($roots as $c) $walk($c, 1);
            }
            return implode("\n", $out);
        }

        case 'find_places': {
            $q = mcpStr($args, 'query', true);
            $hits = [];
            foreach ($idx['containers'] as $c) {
                $path = mcpContainerPath($idx, $c['id']);
                $s = mcpScore($q, [3 => $c['name'] ?? '', 2 => $path, 1 => $c['type'] ?? '']);
                if ($s > 0) $hits[] = [$s, sprintf('- %s [%s] (container_id: %s)', $path, $c['type'] ?? 'general', $c['id'])];
            }
            foreach ($idx['furniture'] as $f) {
                $room = $idx['rooms'][$f['roomId'] ?? '']['name'] ?? '?';
                $s = mcpScore($q, [3 => $f['name'] ?? '', 1 => $room . ' ' . ($f['type'] ?? '')]);
                if ($s > 0) $hits[] = [$s - 1, sprintf('- %s › %s [furniture] (furniture_id: %s; use get_room "%s" for its containers)', $room, $f['name'] ?? '?', $f['id'], $room)];
            }
            usort($hits, fn($a, $b) => $b[0] <=> $a[0]);
            if (!$hits) return "No storage places match \"$q\". Try list_rooms / get_room.";
            return implode("\n", array_column(array_slice($hits, 0, 30), 1));
        }

        case 'get_container': {
            $cid = mcpStr($args, 'container_id', true);
            if (!isset($idx['containers'][$cid])) throw new InvalidArgumentException("Unknown container_id: $cid");
            $out = ['Container: ' . mcpContainerPath($idx, $cid) . " (container_id: $cid)"];
            foreach ($idx['containers'] as $c) {
                if (($c['parentContainerId'] ?? '') === $cid) $out[] = sprintf('- [inside] %s [%s] (container_id: %s)', $c['name'] ?? '?', $c['type'] ?? 'general', $c['id']);
            }
            $n = 0;
            foreach ($idx['items'] as $it) {
                if (($it['containerId'] ?? '') !== $cid) continue;
                $n++;
                $extra = array_filter([$it['category'] ?? '', implode(', ', (array)($it['tags'] ?? []))]);
                $out[] = sprintf('- %s ×%d%s (item_id: %s)', $it['name'] ?? '?', (int)($it['quantity'] ?? 1), $extra ? ' — ' . implode(' · ', $extra) : '', $it['id']);
            }
            if ($n === 0) $out[] = '(no items)';
            return implode("\n", $out);
        }

        case 'add_item': {
            $cid = mcpStr($args, 'container_id', true);
            $nm = mcpStr($args, 'name', true);
            if (!isset($idx['containers'][$cid])) throw new InvalidArgumentException("Unknown container_id: $cid. Use find_places to look it up.");
            $qty = mcpQty($args, true);
            foreach ($ws['items'] as &$it) {
                if (($it['containerId'] ?? '') === $cid && mcpNorm($it['name'] ?? '') === mcpNorm($nm)) {
                    $it['quantity'] = (int)($it['quantity'] ?? 1) + $qty;
                    $it['updatedAt'] = $now;
                    $total = $it['quantity'];
                    $iid = $it['id'];
                    unset($it);
                    mcpSave($apiKey, $ws);
                    return sprintf('"%s" was already there; quantity is now %d. (item_id: %s) in %s', $nm, $total, $iid, mcpContainerPath($idx, $cid));
                }
            }
            unset($it);
            $item = [
                'id' => generateId('item'),
                'containerId' => $cid,
                'name' => $nm,
                'quantity' => $qty,
                'tags' => mcpTags($args) ?? [],
                'createdAt' => $now,
                'updatedAt' => $now,
            ];
            if (($v = mcpStr($args, 'category')) !== null) $item['category'] = $v;
            if (($v = mcpStr($args, 'description')) !== null) $item['description'] = $v;
            $ws['items'][] = $item;
            mcpSave($apiKey, $ws);
            return sprintf('Added %s ×%d to %s (item_id: %s).', $nm, $qty, mcpContainerPath($idx, $cid), $item['id']);
        }

        case 'update_item':
        case 'move_item': {
            $iid = mcpStr($args, 'item_id', true);
            foreach ($ws['items'] as &$it) {
                if (($it['id'] ?? '') !== $iid) continue;
                $changes = [];
                if ($name === 'move_item') {
                    $cid = mcpStr($args, 'container_id', true);
                    if (!isset($idx['containers'][$cid])) throw new InvalidArgumentException("Unknown container_id: $cid");
                    $from = mcpContainerPath($idx, (string)($it['containerId'] ?? ''));
                    $it['containerId'] = $cid;
                    $changes[] = "moved from $from to " . mcpContainerPath($idx, $cid);
                } else {
                    if (($v = mcpStr($args, 'name')) !== null) { $it['name'] = $v; $changes[] = "name → $v"; }
                    if (($v = mcpQty($args)) !== null) { $it['quantity'] = $v; $changes[] = "quantity → $v"; }
                    if (($v = mcpStr($args, 'category')) !== null) { $it['category'] = $v; $changes[] = "category → $v"; }
                    if (($v = mcpStr($args, 'description')) !== null) { $it['description'] = $v; $changes[] = 'description updated'; }
                    if (($v = mcpTags($args)) !== null) { $it['tags'] = $v; $changes[] = 'tags → ' . implode(', ', $v); }
                    if (!$changes) throw new InvalidArgumentException('Nothing to change: give name, quantity, category, tags or description.');
                }
                $it['updatedAt'] = $now;
                $label = $it['name'] ?? '?';
                unset($it);
                mcpSave($apiKey, $ws);
                return "$label: " . implode('; ', $changes) . '.';
            }
            unset($it);
            throw new InvalidArgumentException("Unknown item_id: $iid. Use search_items to look it up.");
        }
    }
    throw new InvalidArgumentException("Unknown tool: $name");
}

/** Keep a short rolling backup before every write, then save */
function mcpSave(string $apiKey, array $ws): void {
    $path = getWorkspaceFilePath($apiKey);
    if (file_exists($path)) {
        $bdir = getDataDirectory() . '/mcp-backups';
        if (!is_dir($bdir)) @mkdir($bdir, 0770, true);
        @copy($path, $bdir . '/' . basename($path, '.json') . '_' . date('Ymd_His') . '.json');
        $old = glob($bdir . '/' . basename($path, '.json') . '_*.json') ?: [];
        sort($old);
        foreach (array_slice($old, 0, max(0, count($old) - 20)) as $f) @unlink($f);
    }
    if (!saveWorkspace($apiKey, $ws)) throw new InvalidArgumentException('Could not save the change on the server. Please try again.');
}
