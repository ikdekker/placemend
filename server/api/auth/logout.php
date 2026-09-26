<?php
// Placemend API - Logout & Invalidate Session
require_once __DIR__ . '/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonError('Method not allowed. Use POST.', 405);
}

$token = getBearerToken();
if ($token) {
    deleteSession($token);
}

sendJsonResponse([
    'success' => true,
    'message' => 'Logged out successfully'
]);
