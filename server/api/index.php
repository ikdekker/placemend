<?php
// Placemend API - Master Router

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/handlers/ai_index.php';
require_once __DIR__ . '/handlers/sync.php';
require_once __DIR__ . '/handlers/rooms.php';
require_once __DIR__ . '/handlers/schema.php';

// Determine route path from query string or request URI
$route = '';
if (!empty($_GET['path'])) {
    $route = trim($_GET['path'], '/');
} elseif (!empty($_GET['endpoint'])) {
    $route = trim($_GET['endpoint'], '/');
} elseif (!empty($_GET['action'])) {
    $route = trim($_GET['action'], '/');
} else {
    // Parse from REQUEST_URI
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    $apiPrefix = '/placemend/api';
    $pos = strpos($uriPath, $apiPrefix);
    if ($pos !== false) {
        $sub = substr($uriPath, $pos + strlen($apiPrefix));
        $sub = preg_replace('/^(\/index\.php)?\/?/', '', $sub);
        $route = trim($sub, '/');
    }
}

// Route matching
switch ($route) {
    case 'v1/ai/index':
    case 'ai/index':
    case 'ai':
        handleAiIndex();
        break;

    case 'v1/sync':
    case 'sync':
    case 'state':
        handleSync();
        break;

    case 'v1/rooms':
    case 'rooms':
        handleRooms();
        break;

    case 'v1/schema':
    case 'schema':
    case 'openapi':
        handleSchema();
        break;

    case 'health':
    case 'v1/health':
    case 'status':
        sendJsonResponse([
            'status' => 'ok',
            'app' => 'Placemend API',
            'version' => '1.0.0',
            'timestamp' => round(microtime(true) * 1000),
            'php' => PHP_VERSION
        ]);
        break;

    case '':
        // Default API information landing
        sendJsonResponse([
            'status' => 'ok',
            'app' => 'Placemend AI & Inventory API',
            'version' => '1.0.0',
            'timestamp' => round(microtime(true) * 1000),
            'endpoints' => [
                'ai_index' => '/placemend/api/v1/ai/index',
                'sync' => '/placemend/api/v1/sync',
                'rooms' => '/placemend/api/v1/rooms',
                'schema' => '/placemend/api/v1/schema',
                'health' => '/placemend/api/health'
            ],
            'documentation' => 'Call POST /v1/ai/index with X-API-Key header to index room objects with AI vision models.'
        ]);
        break;

    default:
        sendJsonError('Endpoint not found: ' . htmlspecialchars($route), 404, [
            'available_routes' => [
                '/v1/ai/index',
                '/v1/sync',
                '/v1/rooms',
                '/v1/schema',
                '/health'
            ]
        ]);
        break;
}
