<?php
// Placemend API - Auth Configuration (Google Client ID)
require_once __DIR__ . '/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $config = getAuthConfig();
    sendJsonResponse([
        'success' => true,
        'googleClientId' => $config['googleClientId'] ?? ''
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Unauthenticated, so only allowed for first-time setup. Once set, changing the client ID
    // means editing data/accounts/config.json on the server.
    if (trim(getAuthConfig()['googleClientId'] ?? '') !== '') {
        sendJsonError('Google Client ID is already configured on the server.', 403);
    }
    $body = getJsonBody();
    $clientId = trim($body['googleClientId'] ?? '');
    saveAuthConfig([
        'googleClientId' => $clientId
    ]);
    sendJsonResponse([
        'success' => true,
        'message' => 'Configuration saved successfully',
        'googleClientId' => $clientId
    ]);
}

sendJsonError('Method not allowed', 405);
