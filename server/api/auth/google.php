<?php
// Placemend API - Google Sign-In & Account Creation Endpoint
require_once __DIR__ . '/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonError('Method not allowed. Use POST.', 405);
}

$body = getJsonBody();
$credential = trim($body['credential'] ?? '');
$isDemo = !empty($body['isDemo']);

$profile = null;

if (!empty($credential)) {
    // 1. Verify with Google's OAuth2 Tokeninfo Endpoint
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Only trust tokens Google verified, issued for this app's client ID, with a verified email.
    // Never fall back to decoding the unsigned payload: that lets anyone forge a login.
    $expectedClientId = trim(getAuthConfig()['googleClientId'] ?? '');
    if ($httpCode === 200 && !empty($response) && $expectedClientId !== '') {
        $data = json_decode($response, true);
        $emailVerified = ($data['email_verified'] ?? '') === true || ($data['email_verified'] ?? '') === 'true';
        if (!empty($data['sub']) && !empty($data['email'])
            && ($data['aud'] ?? '') === $expectedClientId
            && $emailVerified) {
            $profile = [
                'googleId' => $data['sub'],
                'email' => $data['email'],
                'name' => $data['name'] ?? $data['email'],
                'picture' => $data['picture'] ?? ''
            ];
        }
    }

    if (!$profile) {
        sendJsonError('Invalid Google credential token or token expired.', 401);
    }
} else if ($isDemo) {
    // Instant Demo / Guest Account Sign-in
    $email = trim($body['email'] ?? 'demo@placemend.app');
    $name = trim($body['name'] ?? 'Demo User');
    $profile = [
        'googleId' => 'demo_' . md5($email),
        'email' => $email,
        'name' => $name,
        'picture' => 'https://api.dicebear.com/7.x/bottts/svg?seed=' . urlencode($email)
    ];
} else {
    sendJsonError('Missing Google credential or sign-in payload.', 400);
}

// Create or update account in server database
$user = createOrUpdateGoogleUser($profile);

// Generate session token
$token = createSession($user['id']);

sendJsonResponse([
    'success' => true,
    'message' => 'Signed in successfully with Google account',
    'token' => $token,
    'user' => [
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'picture' => $user['picture'],
        'workspaceKey' => $user['workspaceKey'],
        'createdAt' => $user['createdAt'],
        'lastLoginAt' => $user['lastLoginAt']
    ],
    'workspaceKey' => $user['workspaceKey']
]);
