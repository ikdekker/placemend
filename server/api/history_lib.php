<?php
// Change history: every change to rooms, furniture, containers and items is recorded with who made it
// (phone/computer app, ChatGPT, Claude) and a before/after snapshot, so it can be shown and undone.

require_once __DIR__ . '/common.php';

const HISTORY_TABLES = ['rooms', 'furniture', 'containers', 'items'];
const HISTORY_MAX = 1500; // entries kept per workspace
const HISTORY_MERGE_MS = 120000; // edits to the same record by the same source within 2 min become one entry

// ---------------------------------------------------------------- lookup helpers

function wsIndex(array $ws): array {
    $idx = [];
    foreach (['locations', 'rooms', 'furniture', 'containers', 'items'] as $t) {
        $idx[$t] = [];
        foreach ($ws[$t] ?? [] as $r) if (!empty($r['id'])) $idx[$t][$r['id']] = $r;
    }
    return $idx;
}

/** "Kitchen › PAX closet › Left door › Top shelf" */
function wsContainerPath(array $idx, string $containerId): string {
    $parts = [];
    $c = $idx['containers'][$containerId] ?? null;
    $root = $c;
    $guard = 0;
    while ($c && $guard++ < 10) {
        array_unshift($parts, $c['name'] ?? '?');
        $root = $c;
        $c = !empty($c['parentContainerId']) ? ($idx['containers'][$c['parentContainerId']] ?? null) : null;
    }
    $f = $root ? ($idx['furniture'][$root['furnitureId'] ?? ''] ?? null) : null;
    $room = $f ? ($idx['rooms'][$f['roomId'] ?? ''] ?? null) : null;
    if ($f) array_unshift($parts, $f['name'] ?? '?');
    if ($room) array_unshift($parts, $room['name'] ?? '?');
    return $parts ? implode(' › ', $parts) : '(unknown place)';
}

function wsFurniturePlace(array $idx, ?array $furniture): string {
    $room = $idx['rooms'][$furniture['roomId'] ?? ''] ?? null;
    return $room['name'] ?? '(unknown room)';
}

// ---------------------------------------------------------------- recording

/** Who is making this request */
function historySource(string $channel): string {
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($channel === 'mcp') {
        if (stripos($ua, 'openai') !== false || stripos($ua, 'chatgpt') !== false) return 'ChatGPT';
        if (stripos($ua, 'claude') !== false || stripos($ua, 'anthropic') !== false) return 'Claude';
        if (stripos($ua, 'gemini') !== false || stripos($ua, 'google') !== false) return 'Gemini';
        return 'AI assistant';
    }
    if ($channel === 'undo') return 'Undo';
    if (preg_match('/Android|iPhone|iPad|Mobile/i', $ua)) return 'App (phone)';
    return 'App (computer)';
}

/** The parts of a record that matter for history (no timestamps, no photo data) */
function historySnapshot(?array $r): ?array {
    if ($r === null) return null;
    $s = $r;
    unset($s['updatedAt'], $s['createdAt']);
    if (!empty($s['photoDataUrl'])) $s['photoDataUrl'] = '(photo)';
    foreach ($s as $k => $v) if ($v === null) unset($s[$k]);
    return $s;
}

function historyQuote(?array $r): string {
    return '"' . ($r['name'] ?? '?') . '"';
}

/** One human sentence for a change, or null when nothing meaningful changed */
function historyDescribe(array $idx, string $table, ?array $before, ?array $after): ?string {
    if ($before === null && $after === null) return null;
    if ($before !== null && $after !== null && $before == $after) return null;
    $r = $after ?? $before;
    $q = historyQuote($r);

    switch ($table) {
        case 'items':
            $qty = (int)($r['quantity'] ?? 1);
            if ($before === null) return "Added $q ×$qty to " . wsContainerPath($idx, (string)($after['containerId'] ?? ''));
            if ($after === null) return "Removed $q ×$qty from " . wsContainerPath($idx, (string)($before['containerId'] ?? ''));
            $parts = [];
            if (($before['containerId'] ?? '') !== ($after['containerId'] ?? '')) {
                $parts[] = 'moved from ' . wsContainerPath($idx, (string)($before['containerId'] ?? '')) . ' to ' . wsContainerPath($idx, (string)($after['containerId'] ?? ''));
            }
            if (($before['name'] ?? '') !== ($after['name'] ?? '')) $parts[] = 'renamed from ' . historyQuote($before);
            if ((int)($before['quantity'] ?? 1) !== (int)($after['quantity'] ?? 1)) {
                $parts[] = 'quantity ' . (int)($before['quantity'] ?? 1) . ' → ' . (int)($after['quantity'] ?? 1);
            }
            $other = [];
            foreach (['category', 'tags', 'description', 'favorite', 'photoDataUrl', 'barcode'] as $f) {
                if (($before[$f] ?? null) != ($after[$f] ?? null)) $other[] = $f === 'photoDataUrl' ? 'photo' : $f;
            }
            if ($other) $parts[] = 'edited ' . implode(', ', $other);
            return $parts ? "$q: " . implode('; ', $parts) : null;

        case 'containers': {
            $where = function (?array $c) use ($idx) {
                $f = $idx['furniture'][$c['furnitureId'] ?? ''] ?? null;
                $p = !empty($c['parentContainerId']) ? wsContainerPath($idx, $c['parentContainerId']) : ($f ? wsFurniturePlace($idx, $f) . ' › ' . ($f['name'] ?? '?') : '(unknown)');
                return $p;
            };
            if ($before === null) return "Added $q to " . $where($after);
            if ($after === null) return "Removed $q from " . $where($before);
            if (($before['name'] ?? '') !== ($after['name'] ?? '')) return 'Renamed ' . historyQuote($before) . " to $q in " . $where($after);
            return "Changed layout of $q in " . $where($after);
        }

        case 'furniture': {
            $room = wsFurniturePlace($idx, $r);
            if ($before === null) return "Placed $q in $room";
            if ($after === null) return "Removed $q from $room";
            if (($before['name'] ?? '') !== ($after['name'] ?? '')) return 'Renamed ' . historyQuote($before) . " to $q in $room";
            if (($before['roomId'] ?? '') !== ($after['roomId'] ?? '')) return "Moved $q to $room";
            $what = [];
            if (($before['position'] ?? null) != ($after['position'] ?? null)) $what[] = 'moved';
            if (($before['dimension'] ?? null) != ($after['dimension'] ?? null)) $what[] = 'resized';
            if (!$what) $what[] = 'edited';
            return ucfirst(implode(' and ', $what)) . " $q in $room";
        }

        case 'rooms':
            if ($before === null) return "Created room $q";
            if ($after === null) return "Removed room $q";
            if (($before['name'] ?? '') !== ($after['name'] ?? '')) return 'Renamed room ' . historyQuote($before) . " to $q";
            $what = [];
            if (($before['polygonPoints'] ?? null) != ($after['polygonPoints'] ?? null) || ($before['gridWidth'] ?? null) != ($after['gridWidth'] ?? null) || ($before['gridHeight'] ?? null) != ($after['gridHeight'] ?? null)) $what[] = 'walls';
            if (($before['doors'] ?? null) != ($after['doors'] ?? null) || ($before['door'] ?? null) != ($after['door'] ?? null)) $what[] = 'doors';
            return 'Changed ' . ($what ? implode(' and ', $what) : 'settings') . " of room $q";
    }
    return null;
}

/**
 * Compare the workspace before and after a change and append history entries to $new['history'].
 * Returns the number of entries written.
 */
function historyRecordDiff(array $old, array &$new, string $source, ?string $batch = null): int {
    $now = (int)round(microtime(true) * 1000);
    $batch = $batch ?? bin2hex(random_bytes(6));
    $idxNew = wsIndex($new);
    $idxOld = wsIndex($old);
    // paths of deleted things still resolve through the old state
    $idx = $idxNew;
    foreach ($idxOld as $t => $rows) $idx[$t] = $idx[$t] + $rows;

    $history = is_array($new['history'] ?? null) ? $new['history'] : [];
    $written = 0;
    foreach (HISTORY_TABLES as $table) {
        $ids = array_unique(array_merge(array_keys($idxOld[$table]), array_keys($idxNew[$table])));
        foreach ($ids as $id) {
            $b = historySnapshot($idxOld[$table][$id] ?? null);
            $a = historySnapshot($idxNew[$table][$id] ?? null);
            if ($b == $a) continue;

            // fold quick successive edits (e.g. dragging furniture) into the previous entry
            $merged = false;
            for ($i = count($history) - 1; $i >= max(0, count($history) - 40); $i--) {
                $e = $history[$i];
                if ($now - (int)$e['at'] > HISTORY_MERGE_MS) break;
                if ($e['table'] !== $table || $e['recordId'] !== (string)$id) continue;
                if ($e['source'] !== $source || !empty($e['undone']) || $e['after'] === null || $a === null) break;
                $summary = historyDescribe($idx, $table, $e['before'], $a);
                if ($summary === null) {
                    array_splice($history, $i, 1); // edited back to how it was: nothing left to show
                } else {
                    $history[$i]['after'] = $a;
                    $history[$i]['at'] = $now;
                    $history[$i]['summary'] = $summary;
                }
                $merged = true;
                break;
            }
            if ($merged) continue;

            $summary = historyDescribe($idx, $table, $b, $a);
            if ($summary === null) continue;
            if ($b === null && stripos($source, 'undo') !== false) {
                $summary = preg_replace('/^(Added|Placed|Created room) /', 'Restored ', $summary);
            }
            $history[] = [
                'id' => 'h-' . bin2hex(random_bytes(6)),
                'at' => $now,
                'batch' => $batch,
                'source' => $source,
                'table' => $table,
                'recordId' => (string)$id,
                'action' => $b === null ? 'create' : ($a === null ? 'delete' : 'update'),
                'summary' => $summary,
                'before' => $b,
                'after' => $a,
            ];
            $written++;
        }
    }
    if (count($history) > HISTORY_MAX) $history = array_slice($history, -HISTORY_MAX);
    $new['history'] = $history;
    return $written;
}

// ---------------------------------------------------------------- undo

/** Put a record back to a snapshot (null = remove it). Keeps the current photo when the snapshot has a placeholder. */
function historyApplySnapshot(array &$ws, string $table, string $id, ?array $snap, int $now): void {
    $rows = $ws[$table] ?? [];
    $pos = null;
    foreach ($rows as $i => $r) if (($r['id'] ?? '') === $id) { $pos = $i; break; }

    if ($snap === null) {
        if ($pos !== null) array_splice($rows, $pos, 1);
        $ws['deleted'][$table][$id] = $now;
    } else {
        $current = $pos !== null ? $rows[$pos] : [];
        $record = $snap;
        if (($record['photoDataUrl'] ?? null) === '(photo)') {
            if (!empty($current['photoDataUrl'])) $record['photoDataUrl'] = $current['photoDataUrl'];
            else unset($record['photoDataUrl']);
        }
        $record['id'] = $id;
        $record['createdAt'] = $current['createdAt'] ?? $now;
        $record['updatedAt'] = $now;
        if ($pos !== null) $rows[$pos] = $record;
        else $rows[] = $record;
        if (isset($ws['deleted'][$table][$id])) unset($ws['deleted'][$table][$id]);
    }
    $ws[$table] = array_values($rows);
}

/**
 * Undo one history entry. Deletions made together (e.g. a cupboard with its shelves and items)
 * are restored together. Returns a message; throws InvalidArgumentException when not possible.
 */
function historyUndo(string $apiKey, string $entryId, string $source = 'Undo'): string {
    $ws = loadWorkspace($apiKey);
    $old = $ws;
    $history = $ws['history'] ?? [];
    $entry = null;
    foreach ($history as $e) if (($e['id'] ?? '') === $entryId) { $entry = $e; break; }
    if (!$entry) throw new InvalidArgumentException('That change is no longer in the history.');
    if (!empty($entry['undone'])) throw new InvalidArgumentException('That change was already undone.');

    $now = (int)round(microtime(true) * 1000);
    $targets = [$entry];
    if ($entry['action'] === 'delete') {
        foreach ($history as $e) {
            if ($e['id'] !== $entry['id'] && ($e['batch'] ?? '') === ($entry['batch'] ?? '-') && $e['action'] === 'delete' && empty($e['undone'])) $targets[] = $e;
        }
    }
    if ($entry['action'] === 'create' && $entry['table'] !== 'items') {
        // removing a room/furniture/container again only when nothing is inside it any more
        $id = $entry['recordId'];
        $inUse = [];
        if ($entry['table'] === 'rooms') {
            $inUse = array_filter($ws['furniture'] ?? [], fn($f) => ($f['roomId'] ?? '') === $id);
        } elseif ($entry['table'] === 'furniture') {
            $inUse = array_filter($ws['containers'] ?? [], fn($c) => ($c['furnitureId'] ?? '') === $id);
        } elseif ($entry['table'] === 'containers') {
            $inUse = array_merge(
                array_filter($ws['containers'] ?? [], fn($c) => ($c['parentContainerId'] ?? '') === $id),
                array_filter($ws['items'] ?? [], fn($i) => ($i['containerId'] ?? '') === $id)
            );
        }
        if ($inUse) throw new InvalidArgumentException('It still contains other things. Move or remove those first.');
    }

    // restore parents before children
    $order = array_flip(HISTORY_TABLES);
    usort($targets, fn($a, $b) => $order[$a['table']] <=> $order[$b['table']]);
    foreach ($targets as $t) historyApplySnapshot($ws, $t['table'], $t['recordId'], $t['before'], $now);

    $ids = array_column($targets, 'id');
    foreach ($ws['history'] as &$e) if (in_array($e['id'], $ids, true)) $e['undone'] = $now;
    unset($e);

    historyRecordDiff($old, $ws, $source);
    if (!saveWorkspace($apiKey, $ws)) throw new InvalidArgumentException('Could not save. Please try again.');
    return count($targets) > 1 ? sprintf('Undone (%d related changes restored).', count($targets)) : 'Undone.';
}

/** Entries for display: newest first, without the snapshots */
function historyList(array $ws, ?string $recordId, int $limit): array {
    $out = [];
    $history = $ws['history'] ?? [];
    for ($i = count($history) - 1; $i >= 0 && count($out) < $limit; $i--) {
        $e = $history[$i];
        if ($recordId !== null && $e['recordId'] !== $recordId) continue;
        $out[] = [
            'id' => $e['id'], 'at' => $e['at'], 'source' => $e['source'], 'table' => $e['table'],
            'recordId' => $e['recordId'], 'action' => $e['action'], 'summary' => $e['summary'],
            'undone' => $e['undone'] ?? null,
        ];
    }
    return $out;
}
