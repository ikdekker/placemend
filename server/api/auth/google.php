<?php
// Placemend API - Google Sign-In & Account Creation Endpoint
//
// Three ways in:
//  1. Redirect sign-in (default): Google posts a form here (credential + g_csrf_token). We verify it,
//     create a session and send the browser back to the app with a one-time code (?signin=...).
//     No pop-up and no third-party cookies, so it works in Firefox, Safari and in-app browsers.
//  2. JSON {code}: the app exchanges that one-time code for the session.
//  3. JSON {credential} (pop-up sign-in) and {isDemo} keep working as before.
require_once __DIR__ . '/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonError('Method not allowed. Use POST.', 405);
}

const APP_URL = 'https://freshcoders.nl/placemend/';

/** Verified Google profile for an ID token, or null */
function verifyGoogleCredential(string $credential): ?array {
    $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Only trust tokens Google verified, issued for this app's client ID, with a verified email.
    // Never fall back to decoding the unsigned payload: that lets anyone forge a login.
    $expectedClientId = trim(getAuthConfig()['googleClientId'] ?? '');
    if ($httpCode !== 200 || empty($response) || $expectedClientId === '') return null;
    $data = json_decode($response, true);
    $emailVerified = ($data['email_verified'] ?? '') === true || ($data['email_verified'] ?? '') === 'true';
    if (empty($data['sub']) || empty($data['email']) || ($data['aud'] ?? '') !== $expectedClientId || !$emailVerified) return null;
    return [
        'googleId' => $data['sub'],
        'email' => $data['email'],
        'name' => $data['name'] ?? $data['email'],
        'picture' => $data['picture'] ?? '',
    ];
}

function signInPayload(array $user, string $token): array {
    return [
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
            'lastLoginAt' => $user['lastLoginAt'],
        ],
        'workspaceKey' => $user['workspaceKey'],
    ];
}

function loginCodesFile(): string {
    return getAccountsDirectory() . '/login-codes.json';
}

/** Back to the app; $param is "signin=<code>" or "signin_error=<reason>" */
function redirectToApp(string $param): void {
    header_remove('Content-Type');
    header('Cache-Control: no-store');
    header('Location: ' . APP_URL . '?' . $param, true, 303);
    exit;
}

// ------------------------------------------------------------------ 1. redirect from Google
if (isset($_POST['credential']) && isset($_POST['g_csrf_token'])) {
    // Double-submit check: Google sets the same token as a cookie on our site
    $cookie = (string)($_COOKIE['g_csrf_token'] ?? '');
    if ($cookie === '' || !hash_equals($cookie, (string)$_POST['g_csrf_token'])) redirectToApp('signin_error=csrf');
    $profile = verifyGoogleCredential(trim((string)$_POST['credential']));
    if (!$profile) redirectToApp('signin_error=invalid');

    $user = createOrUpdateGoogleUser($profile);
    $token = createSession($user['id']);

    $codes = loadJsonStore(loginCodesFile(), []);
    $now = time();
    foreach ($codes as $c => $v) if (($v['exp'] ?? 0) < $now) unset($codes[$c]);
    $code = bin2hex(random_bytes(24));
    $codes[$code] = ['token' => $token, 'userId' => $user['id'], 'exp' => $now + 120];
    saveJsonStore(loginCodesFile(), $codes);
    redirectToApp('signin=' . $code);
}

$body = getJsonBody();

// ------------------------------------------------------------------ 2. exchange the one-time code
if (!empty($body['code'])) {
    $codes = loadJsonStore(loginCodesFile(), []);
    $code = (string)$body['code'];
    $entry = $codes[$code] ?? null;
    unset($codes[$code]); // single use
    saveJsonStore(loginCodesFile(), $codes);
    if (!$entry || ($entry['exp'] ?? 0) < time()) sendJsonError('This sign-in link expired. Please sign in again.', 401);
    $user = getUserById($entry['userId']);
    if (!$user) sendJsonError('Account not found.', 404);
    sendJsonResponse(signInPayload($user, $entry['token']));
}

// ------------------------------------------------------------------ 3. pop-up credential or demo
$credential = trim($body['credential'] ?? '');
$isDemo = !empty($body['isDemo']);

if (!empty($credential)) {
    $profile = verifyGoogleCredential($credential);
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
$token = createSession($user['id']);
sendJsonResponse(signInPayload($user, $token));
