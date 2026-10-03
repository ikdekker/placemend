<?php
// Placemend API - State Synchronization Handler (GET / POST)

require_once __DIR__ . '/../common.php';
require_once __DIR__ . '/../history_lib.php';

function handleSync(): void {
    $apiKey = getWorkspaceApiKey();
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $workspace = loadWorkspace($apiKey);
        unset($workspace['history']); // fetched separately via history.php
        sendJsonResponse([
            'success' => true,
            'workspaceKey' => $apiKey,
            'updatedAt' => $workspace['updatedAt'] ?? round(microtime(true) * 1000),
            'counts' => [
                'locations' => count($workspace['locations'] ?? []),
                'rooms' => count($workspace['rooms'] ?? []),
                'furniture' => count($workspace['furniture'] ?? []),
                'containers' => count($workspace['containers'] ?? []),
                'items' => count($workspace['items'] ?? [])
            ],
            'data' => $workspace
        ]);
    }

    if ($method === 'POST') {
        $body = getJsonBody();
        $workspace = loadWorkspace($apiKey);
        $original = $workspace;

        $tables = ['locations', 'rooms', 'furniture', 'containers', 'items'];
        $stats = ['updated' => 0, 'inserted' => 0, 'deleted' => 0];

        // Tombstones: { table: { id: deletedAtMs } }. Without them a deleted record is re-uploaded
        // by any device that still has it, and comes straight back.
        $tombstones = is_array($workspace['deleted'] ?? null) ? $workspace['deleted'] : [];
        $incomingDeleted = is_array($body['deleted'] ?? null) ? $body['deleted'] : [];
        foreach ($tables as $table) {
            if (!is_array($incomingDeleted[$table] ?? null)) continue;
            foreach ($incomingDeleted[$table] as $id => $deletedAt) {
                $id = (string)$id;
                $deletedAt = (int)$deletedAt;
                if ($id === '' || $deletedAt <= 0) continue;
                $tombstones[$table][$id] = max($deletedAt, (int)($tombstones[$table][$id] ?? 0));
            }
        }
        // Drop records that were deleted after their last update
        foreach ($tables as $table) {
            if (empty($tombstones[$table])) continue;
            $before = count($workspace[$table]);
            $workspace[$table] = array_values(array_filter($workspace[$table], function ($record) use ($tombstones, $table) {
                $deletedAt = $tombstones[$table][$record['id'] ?? ''] ?? null;
                return $deletedAt === null || (int)($record['updatedAt'] ?? 0) > $deletedAt;
            }));
            $stats['deleted'] += $before - count($workspace[$table]);
        }

        foreach ($tables as $table) {
            $incomingList = $body[$table] ?? [];
            if (!is_array($incomingList)) continue;

            $existingMap = [];
            foreach ($workspace[$table] as $idx => $record) {
                if (!empty($record['id'])) {
                    $existingMap[$record['id']] = $idx;
                }
            }

            foreach ($incomingList as $incoming) {
                if (empty($incoming['id']) || !is_array($incoming)) continue;
                $id = $incoming['id'];

                // A stale copy of a deleted record (not edited since the delete) must not resurrect it
                $deletedAt = $tombstones[$table][$id] ?? null;
                if ($deletedAt !== null) {
                    if ((int)($incoming['updatedAt'] ?? 0) <= (int)$deletedAt) continue;
                    unset($tombstones[$table][$id]); // edited after the delete: keep the newer version
                }

                if (isset($existingMap[$id])) {
                    $idx = $existingMap[$id];
                    $current = $workspace[$table][$idx];
                    $currentUpdated = (int)($current['updatedAt'] ?? 0);
                    $incomingUpdated = (int)($incoming['updatedAt'] ?? round(microtime(true) * 1000));

                    if ($incomingUpdated >= $currentUpdated) {
                        $workspace[$table][$idx] = array_merge($current, $incoming);
                        $stats['updated']++;
                    }
                } else {
                    $workspace[$table][] = $incoming;
                    $stats['inserted']++;
                }
            }
        }

        $workspace['deleted'] = $tombstones;
        historyRecordDiff($original, $workspace, historySource('app'));
        saveWorkspace($apiKey, $workspace);
        unset($workspace['history']);

        sendJsonResponse([
            'success' => true,
            'workspaceKey' => $apiKey,
            'message' => sprintf('Synced successfully (%d inserted, %d updated, %d deleted)', $stats['inserted'], $stats['updated'], $stats['deleted']),
            'stats' => $stats,
            'updatedAt' => $workspace['updatedAt'],
            'data' => $workspace
        ]);
    }

    sendJsonError('Method not allowed. Use GET or POST.', 405);
}
