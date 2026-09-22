<?php
// Placemend API - Rooms Query Handler

require_once __DIR__ . '/../common.php';

function handleRooms(): void {
    $apiKey = getWorkspaceApiKey();
    $workspace = loadWorkspace($apiKey);

    $rooms = $workspace['rooms'] ?? [];
    $furniture = $workspace['furniture'] ?? [];

    $furnitureCounts = [];
    foreach ($furniture as $f) {
        $rId = $f['roomId'] ?? '';
        $furnitureCounts[$rId] = ($furnitureCounts[$rId] ?? 0) + 1;
    }

    $result = [];
    foreach ($rooms as $r) {
        $result[] = [
            'id' => $r['id'] ?? '',
            'name' => $r['name'] ?? 'Unnamed Room',
            'color' => $r['color'] ?? '#3b82f6',
            'gridWidth' => $r['gridWidth'] ?? 30,
            'gridHeight' => $r['gridHeight'] ?? 22,
            'unitSize' => $r['unitSize'] ?? 24,
            'shapeType' => $r['shapeType'] ?? 'rectangle',
            'furnitureCount' => $furnitureCounts[$r['id'] ?? ''] ?? 0,
            'createdAt' => $r['createdAt'] ?? 0,
            'updatedAt' => $r['updatedAt'] ?? 0
        ];
    }

    sendJsonResponse([
        'success' => true,
        'workspaceKey' => $apiKey,
        'count' => count($result),
        'rooms' => $result
    ]);
}
