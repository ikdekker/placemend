<?php
// Placemend API - sharing rooms with contacts (by email)
//
// Owner (the caller owns the room):
//   GET  share.php?action=list&roomId=...                 shares of one room
//   POST {action:"add", roomId, email, role:"view"|"edit"}
//   POST {action:"update", shareId, role}
//   POST {action:"remove", shareId}
// Contact (the caller's verified Google email was invited):
//   GET  share.php?action=incoming                         shared rooms with their furniture, containers, items
//   POST {action:"push", shareId, furniture[], containers[], items[], rooms[], deleted{}}   (edit role only)
//   POST {action:"leave", shareId}
//
// Auth: the caller's own workspace key (X-API-Key). Only real Google accounts take part; demo
// sign-ins carry unverified emails and can neither share nor receive shares.

require_once __DIR__ . '/auth/database.php';
require_once __DIR__ . '/history_lib.php';

function shareFile(): string {
    return getAccountsDirectory() . '/shares.json';
}

function shareCaller(): array {
    $key = getWorkspaceApiKey();
    if (strpos($key, 'pm_usr_') !== 0) sendJsonError('Sign in with Google to share rooms.', 403);
    foreach (getAllUsers() as $u) {
        if (isset($u['workspaceKey']) && hash_equals((string)$u['workspaceKey'], $key)) {
            if (strpos((string)($u['googleId'] ?? ''), 'demo_') === 0 || empty($u['email'])) {
                sendJsonError('Sharing needs a Google account (not a demo sign-in).', 403);
            }
            return $u;
        }
    }
    sendJsonError('Unknown workspace key.', 403);
    exit;
}

function verifiedUserByEmail(string $email): ?array {
    $u = getUserByEmail($email);
    if (!$u || strpos((string)($u['googleId'] ?? ''), 'demo_') === 0) return null;
    return $u;
}

/** The room plus everything inside it, from the owner's workspace */
function shareSubtree(array $ws, string $roomId): ?array {
    $room = null;
    foreach ($ws['rooms'] ?? [] as $r) if (($r['id'] ?? '') === $roomId) $room = $r;
    if (!$room) return null;
    $furniture = array_values(array_filter($ws['furniture'] ?? [], fn($f) => ($f['roomId'] ?? '') === $roomId));
    $fids = array_flip(array_column($furniture, 'id'));
    $containers = array_values(array_filter($ws['containers'] ?? [], fn($c) => isset($fids[$c['furnitureId'] ?? ''])));
    $cids = array_flip(array_column($containers, 'id'));
    $items = array_values(array_filter($ws['items'] ?? [], fn($i) => isset($cids[$i['containerId'] ?? ''])));
    return ['rooms' => [$room], 'furniture' => $furniture, 'containers' => $containers, 'items' => $items];
}

function sharePublic(array $s, bool $withLink = false): array {
    $u = verifiedUserByEmail($s['email']);
    $out = [
        'id' => $s['id'], 'roomId' => $s['roomId'], 'email' => $s['email'], 'role' => $s['role'],
        'status' => $u ? 'active' : 'invited', 'contactName' => $u['name'] ?? null, 'createdAt' => $s['createdAt'],
    ];
    if ($withLink) $out['inviteLink'] = 'https://freshcoders.nl/placemend/?invite=' . rawurlencode($s['id']);
    return $out;
}

function cleanRecord(array $r): array {
    foreach (array_keys($r) as $k) if (strpos($k, 'share') === 0) unset($r[$k]); // client-only fields
    return $r;
}

$me = shareCaller();
$myEmail = strtolower(trim($me['email']));
$shares = loadJsonStore(shareFile(), []);
$method = $_SERVER['REQUEST_METHOD'];
$body = $method === 'POST' ? getJsonBody() : [];
$action = (string)($method === 'GET' ? ($_GET['action'] ?? '') : ($body['action'] ?? ''));

switch ($action) {
    // ------------------------------------------------------------------ owner
    case 'list': {
        $roomId = (string)($_GET['roomId'] ?? '');
        $list = array_values(array_filter($shares, fn($s) => $s['ownerUserId'] === $me['id'] && ($roomId === '' || $s['roomId'] === $roomId)));
        sendJsonResponse(['success' => true, 'shares' => array_map(fn($s) => sharePublic($s, true), $list)]);
    }

    case 'add': {
        $roomId = (string)($body['roomId'] ?? '');
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $role = ($body['role'] ?? 'view') === 'edit' ? 'edit' : 'view';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendJsonError('Enter a valid email address.');
        if ($email === $myEmail) sendJsonError("That's your own email address.");
        if (!shareSubtree(loadWorkspace($me['workspaceKey']), $roomId)) sendJsonError('Room not found in your workspace. Sync first, then try again.', 404);
        foreach ($shares as $id => $s) {
            if ($s['ownerUserId'] === $me['id'] && $s['roomId'] === $roomId && $s['email'] === $email) {
                $shares[$id]['role'] = $role;
                saveJsonStore(shareFile(), $shares);
                sendJsonResponse(['success' => true, 'share' => sharePublic($shares[$id], true), 'message' => 'Already shared; permission updated.']);
            }
        }
        $id = 'shr_' . bin2hex(random_bytes(10));
        $shares[$id] = [
            'id' => $id, 'ownerUserId' => $me['id'], 'roomId' => $roomId, 'email' => $email, 'role' => $role,
            'createdAt' => (int)round(microtime(true) * 1000),
        ];
        saveJsonStore(shareFile(), $shares);
        sendJsonResponse(['success' => true, 'share' => sharePublic($shares[$id], true)]);
    }

    case 'update':
    case 'remove': {
        $id = (string)($body['shareId'] ?? '');
        $s = $shares[$id] ?? null;
        if (!$s || $s['ownerUserId'] !== $me['id']) sendJsonError('Share not found.', 404);
        if ($action === 'remove') unset($shares[$id]);
        else $shares[$id]['role'] = ($body['role'] ?? 'view') === 'edit' ? 'edit' : 'view';
        saveJsonStore(shareFile(), $shares);
        sendJsonResponse(['success' => true]);
    }

    // ------------------------------------------------------------------ contact
    case 'incoming': {
        $users = getAllUsers();
        $out = [];
        foreach ($shares as $s) {
            if ($s['email'] !== $myEmail) continue;
            $owner = $users[$s['ownerUserId']] ?? null;
            if (!$owner) continue;
            $data = shareSubtree(loadWorkspace($owner['workspaceKey']), $s['roomId']);
            if (!$data) continue; // owner removed the room
            $out[] = [
                'share' => ['id' => $s['id'], 'roomId' => $s['roomId'], 'role' => $s['role'], 'ownerName' => $owner['name'] ?? 'Someone', 'ownerEmail' => $owner['email'] ?? ''],
                'data' => $data,
            ];
        }
        sendJsonResponse(['success' => true, 'shared' => $out]);
    }

    case 'leave': {
        $id = (string)($body['shareId'] ?? '');
        if (!isset($shares[$id]) || $shares[$id]['email'] !== $myEmail) sendJsonError('Share not found.', 404);
        unset($shares[$id]);
        saveJsonStore(shareFile(), $shares);
        sendJsonResponse(['success' => true]);
    }

    case 'push': {
        $id = (string)($body['shareId'] ?? '');
        $s = $shares[$id] ?? null;
        if (!$s || $s['email'] !== $myEmail) sendJsonError('Share not found.', 404);
        if ($s['role'] !== 'edit') sendJsonError('This room is shared with you as view-only.', 403);
        $owner = getAllUsers()[$s['ownerUserId']] ?? null;
        if (!$owner) sendJsonError('The owner of this room no longer exists.', 404);

        $key = $owner['workspaceKey'];
        $ws = loadWorkspace($key);
        $original = $ws;
        $roomId = $s['roomId'];
        $sub = shareSubtree($ws, $roomId);
        if (!$sub) sendJsonError('The owner removed this room.', 404);
        $inRoom = [];
        foreach (['rooms', 'furniture', 'containers', 'items'] as $t) $inRoom[$t] = array_flip(array_column($sub[$t], 'id'));
        $now = (int)round(microtime(true) * 1000);
        $stats = ['updated' => 0, 'inserted' => 0, 'deleted' => 0, 'rejected' => 0];

        // deletes: only things inside the shared room, never the room itself
        $deleted = is_array($body['deleted'] ?? null) ? $body['deleted'] : [];
        foreach (['furniture', 'containers', 'items'] as $t) {
            foreach ((array)($deleted[$t] ?? []) as $rid => $at) {
                $rid = (string)$rid;
                if (!isset($inRoom[$t][$rid])) { $stats['rejected']++; continue; }
                $before = count($ws[$t]);
                $ws[$t] = array_values(array_filter($ws[$t], fn($r) => ($r['id'] ?? '') !== $rid || (int)($r['updatedAt'] ?? 0) > (int)$at));
                if (count($ws[$t]) < $before) {
                    $ws['deleted'][$t][$rid] = max((int)$at, (int)($ws['deleted'][$t][$rid] ?? 0));
                    unset($inRoom[$t][$rid]);
                    $stats['deleted']++;
                }
            }
        }

        // upserts, parents first; every record must stay inside the shared room
        $parentOk = [
            'rooms' => fn($r) => ($r['id'] ?? '') === $roomId,
            'furniture' => fn($r) => ($r['roomId'] ?? '') === $roomId,
            'containers' => function ($r) use (&$inRoom) {
                return isset($inRoom['furniture'][$r['furnitureId'] ?? ''])
                    && (empty($r['parentContainerId']) || isset($inRoom['containers'][$r['parentContainerId']]));
            },
            'items' => function ($r) use (&$inRoom) {
                return isset($inRoom['containers'][$r['containerId'] ?? '']);
            },
        ];
        foreach (['rooms', 'furniture', 'containers', 'items'] as $t) {
            $pos = [];
            foreach ($ws[$t] as $i => $r) if (!empty($r['id'])) $pos[$r['id']] = $i;
            foreach ((array)($body[$t] ?? []) as $rec) {
                if (!is_array($rec) || empty($rec['id'])) continue;
                $rec = cleanRecord($rec);
                $rid = (string)$rec['id'];
                $exists = isset($pos[$rid]);
                // an existing record must already be in the room; a new one must not collide with the owner's other records
                if (($exists && !isset($inRoom[$t][$rid])) || !$parentOk[$t]($rec)) { $stats['rejected']++; continue; }
                if ($t === 'rooms' && !$exists) { $stats['rejected']++; continue; }
                $tomb = $ws['deleted'][$t][$rid] ?? null;
                if ($tomb !== null && (int)($rec['updatedAt'] ?? 0) <= (int)$tomb) continue;
                if ($exists) {
                    $cur = $ws[$t][$pos[$rid]];
                    if ((int)($rec['updatedAt'] ?? 0) >= (int)($cur['updatedAt'] ?? 0)) {
                        $ws[$t][$pos[$rid]] = array_merge($cur, $rec);
                        $stats['updated']++;
                    }
                } else {
                    $rec['updatedAt'] = (int)($rec['updatedAt'] ?? $now);
                    $ws[$t][] = $rec;
                    $pos[$rid] = count($ws[$t]) - 1;
                    $inRoom[$t][$rid] = true;
                    $stats['inserted']++;
                }
            }
        }

        historyRecordDiff($original, $ws, ($me['name'] ?: $me['email']) . ' (shared)');
        saveWorkspace($key, $ws);
        sendJsonResponse(['success' => true, 'stats' => $stats]);
    }
}

sendJsonError('Unknown action.', 400);
