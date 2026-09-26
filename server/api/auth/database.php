<?php
// Placemend Auth Database Engine - File-based atomic document store for Users and Sessions
require_once __DIR__ . '/../common.php';

/**
 * Get and ensure the accounts storage directory exists and is secured
 */
function getAccountsDirectory(): string {
    $dir = getDataDirectory() . '/accounts';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
        @chmod($dir, 0777);
    }
    $htaccess = $dir . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Order deny,allow\nDeny from all\n");
    }
    return $dir;
}

/**
 * Load JSON data with shared read lock
 */
function loadJsonStore(string $filePath, array $default = []): array {
    if (!file_exists($filePath)) {
        return $default;
    }
    $fp = @fopen($filePath, 'rb');
    if (!$fp) {
        return $default;
    }
    @flock($fp, LOCK_SH);
    $contents = stream_get_contents($fp);
    @flock($fp, LOCK_UN);
    @fclose($fp);

    if (empty($contents)) {
        return $default;
    }
    $decoded = json_decode($contents, true);
    return is_array($decoded) ? $decoded : $default;
}

/**
 * Save JSON data with exclusive write lock
 */
function saveJsonStore(string $filePath, array $data): bool {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $fp = @fopen($filePath, 'c+');
    if (!$fp) {
        return false;
    }
    if (!@flock($fp, LOCK_EX)) {
        @fclose($fp);
        return false;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, $json);
    fflush($fp);
    @flock($fp, LOCK_UN);
    @fclose($fp);
    @chmod($filePath, 0666);
    return true;
}

function getUsersFilePath(): string {
    return getAccountsDirectory() . '/users.json';
}

function getSessionsFilePath(): string {
    return getAccountsDirectory() . '/sessions.json';
}

function getConfigFilePath(): string {
    return getAccountsDirectory() . '/config.json';
}

/**
 * Get server auth configuration (e.g. Google OAuth Client ID)
 */
function getAuthConfig(): array {
    $defaultClientId = '1027558050897-f66h8ehmk2096e5uqi3fgm6ccn0l70f6.apps.googleusercontent.com';
    $envId = getenv('GOOGLE_CLIENT_ID') ?: ($_ENV['GOOGLE_CLIENT_ID'] ?? ($_SERVER['GOOGLE_CLIENT_ID'] ?? ''));
    if (!empty($envId)) {
        return ['googleClientId' => trim($envId)];
    }
    $cfg = loadJsonStore(getConfigFilePath(), [
        'googleClientId' => $defaultClientId
    ]);
    if (empty($cfg['googleClientId'])) {
        $cfg['googleClientId'] = $defaultClientId;
    }
    return $cfg;
}

/**
 * Save server auth configuration
 */
function saveAuthConfig(array $config): bool {
    $existing = getAuthConfig();
    $merged = array_merge($existing, $config);
    return saveJsonStore(getConfigFilePath(), $merged);
}

/**
 * Get all registered users
 */
function getAllUsers(): array {
    return loadJsonStore(getUsersFilePath(), []);
}

/**
 * Find user by Placemend user ID
 */
function getUserById(string $userId): ?array {
    $users = getAllUsers();
    return $users[$userId] ?? null;
}

/**
 * Find user by Google ID (sub)
 */
function getUserByGoogleId(string $googleId): ?array {
    $users = getAllUsers();
    foreach ($users as $u) {
        if (!empty($u['googleId']) && $u['googleId'] === $googleId) {
            return $u;
        }
    }
    return null;
}

/**
 * Find user by Email
 */
function getUserByEmail(string $email): ?array {
    $normalized = strtolower(trim($email));
    $users = getAllUsers();
    foreach ($users as $u) {
        if (!empty($u['email']) && strtolower($u['email']) === $normalized) {
            return $u;
        }
    }
    return null;
}

/**
 * Create or update a user from Google OAuth profile data
 */
function createOrUpdateGoogleUser(array $googleProfile): array {
    $users = getAllUsers();
    $googleId = trim($googleProfile['googleId'] ?? $googleProfile['sub'] ?? '');
    $email = strtolower(trim($googleProfile['email'] ?? ''));
    $name = trim($googleProfile['name'] ?? 'Placemend User');
    $picture = trim($googleProfile['picture'] ?? '');

    $now = round(microtime(true) * 1000);
    $existing = null;
    // Demo sign-ins supply an unverified email, so they may only ever reach demo accounts,
    // and a verified Google login must never be linked into a demo account.
    $isDemo = strpos($googleId, 'demo_') === 0;

    if (!empty($googleId)) {
        $existing = getUserByGoogleId($googleId);
    }
    if (!$existing && !$isDemo && !empty($email)) {
        $existing = getUserByEmail($email);
        if ($existing && strpos($existing['googleId'] ?? '', 'demo_') === 0) {
            $existing = null;
        }
    }

    if ($existing) {
        $userId = $existing['id'];
        $existing['name'] = !empty($name) ? $name : $existing['name'];
        $existing['picture'] = !empty($picture) ? $picture : $existing['picture'];
        $existing['lastLoginAt'] = $now;
        if (!empty($googleId)) {
            $existing['googleId'] = $googleId;
        }
        $users[$userId] = $existing;
        saveJsonStore(getUsersFilePath(), $users);
        return $existing;
    }

    // New User Account Creation
    $userId = 'usr_' . bin2hex(random_bytes(8));
    $workspaceKey = 'pm_usr_' . bin2hex(random_bytes(16));

    $newUser = [
        'id' => $userId,
        'googleId' => $googleId,
        'email' => $email,
        'name' => $name,
        'picture' => $picture,
        'workspaceKey' => $workspaceKey,
        'createdAt' => $now,
        'lastLoginAt' => $now,
    ];

    $users[$userId] = $newUser;
    saveJsonStore(getUsersFilePath(), $users);

    return $newUser;
}

/**
 * Create a new session for user (30 days validity)
 */
function createSession(string $userId, int $durationSeconds = 2592000): string {
    $sessions = loadJsonStore(getSessionsFilePath(), []);
    $token = 'sess_' . bin2hex(random_bytes(24));
    $now = round(microtime(true) * 1000);
    $expiresAt = $now + ($durationSeconds * 1000);

    $sessions[$token] = [
        'userId' => $userId,
        'createdAt' => $now,
        'expiresAt' => $expiresAt
    ];

    // Clean up expired sessions periodically (1 in 10 chance)
    if (rand(1, 10) === 1) {
        foreach ($sessions as $t => $s) {
            if (!empty($s['expiresAt']) && $s['expiresAt'] < $now) {
                unset($sessions[$t]);
            }
        }
    }

    saveJsonStore(getSessionsFilePath(), $sessions);
    return $token;
}

/**
 * Validate and get session
 */
function getSession(string $token): ?array {
    if (empty($token)) return null;
    $sessions = loadJsonStore(getSessionsFilePath(), []);
    if (!isset($sessions[$token])) {
        return null;
    }
    $session = $sessions[$token];
    $now = round(microtime(true) * 1000);
    if (!empty($session['expiresAt']) && $session['expiresAt'] < $now) {
        unset($sessions[$token]);
        saveJsonStore(getSessionsFilePath(), $sessions);
        return null;
    }
    return $session;
}

/**
 * Invalidate session token
 */
function deleteSession(string $token): bool {
    if (empty($token)) return true;
    $sessions = loadJsonStore(getSessionsFilePath(), []);
    if (isset($sessions[$token])) {
        unset($sessions[$token]);
        saveJsonStore(getSessionsFilePath(), $sessions);
    }
    return true;
}

/**
 * Extract bearer token from Authorization header or cookie
 */
function getBearerToken(): ?string {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = trim($_SERVER['HTTP_AUTHORIZATION']);
        if (stripos($auth, 'Bearer ') === 0) {
            return trim(substr($auth, 7));
        }
    }
    if (!empty($_COOKIE['pm_session'])) {
        return trim($_COOKIE['pm_session']);
    }
    if (!empty($_GET['token'])) {
        return trim($_GET['token']);
    }
    return null;
}

/**
 * Get current authenticated user or null
 */
function getAuthenticatedUser(): ?array {
    $token = getBearerToken();
    if (!$token) return null;
    $session = getSession($token);
    if (!$session || empty($session['userId'])) return null;
    return getUserById($session['userId']);
}
