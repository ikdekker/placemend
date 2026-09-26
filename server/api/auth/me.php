<?php
// Placemend API - Get Current Authenticated User Profile
require_once __DIR__ . '/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJsonError('Method not allowed. Use GET.', 405);
}

$user = getAuthenticatedUser();

if (!$user) {
    sendJsonResponse([
        'authenticated' => false,
        'user' => null,
        'message' => 'No active user session'
    ], 200);
}

// Check workspace stats if available
$workspace = loadWorkspace($user['workspaceKey']);
$roomCount = count($workspace['rooms'] ?? []);
$furnitureCount = count($workspace['furniture'] ?? []);
$itemCount = count($workspace['items'] ?? []);

sendJsonResponse([
    'authenticated' => true,
    'user' => [
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'picture' => $user['picture'],
        'workspaceKey' => $user['workspaceKey'],
        'createdAt' => $user['createdAt'],
        'lastLoginAt' => $user['lastLoginAt']
    ],
    'workspace' => [
        'key' => $user['workspaceKey'],
        'roomCount' => $roomCount,
        'furnitureCount' => $furnitureCount,
        'itemCount' => $itemCount,
        'updatedAt' => $workspace['updatedAt'] ?? null
    ]
]);
