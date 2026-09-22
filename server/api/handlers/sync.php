<?php
// Placemend API - State Synchronization Handler (GET / POST)

require_once __DIR__ . '/../common.php';

function handleSync(): void {
    $apiKey = getWorkspaceApiKey();
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $workspace = loadWorkspace($apiKey);
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

        $tables = ['locations', 'rooms', 'furniture', 'containers', 'items'];
        $stats = ['updated' => 0, 'inserted' => 0];

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

        saveWorkspace($apiKey, $workspace);

        sendJsonResponse([
            'success' => true,
            'workspaceKey' => $apiKey,
            'message' => sprintf('Synced successfully (%d inserted, %d updated)', $stats['inserted'], $stats['updated']),
            'stats' => $stats,
            'updatedAt' => $workspace['updatedAt'],
            'data' => $workspace
        ]);
    }

    sendJsonError('Method not allowed. Use GET or POST.', 405);
}
