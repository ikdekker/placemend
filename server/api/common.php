<?php
// Placemend API - Common Utilities, CORS, Auth & Storage Engine

// Global CORS Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, Accept, Origin, X-Requested-With");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=UTF-8");

if (!defined('PLACEMEND_API_ROOT')) {
    define('PLACEMEND_API_ROOT', __DIR__);
}

// Respond immediately to CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/**
 * Extract workspace API key from headers or query string
 */
function getWorkspaceApiKey(): string {
    if (!empty($_SERVER['HTTP_X_API_KEY'])) {
        return trim($_SERVER['HTTP_X_API_KEY']);
    }
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = trim($_SERVER['HTTP_AUTHORIZATION']);
        if (stripos($auth, 'Bearer ') === 0) {
            return trim(substr($auth, 7));
        }
    }
    if (!empty($_GET['key'])) {
        return trim($_GET['key']);
    }
    // Fallback default workspace key for quick zero-setup testing
    return 'pm_demo_workspace';
}

/**
 * Return absolute path to data storage directory and ensure it is secured
 */
function getDataDirectory(): string {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
        @chmod($dir, 0777);
    }
    // Protect raw JSON data files from direct HTTP access
    $htaccess = $dir . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Order deny,allow\nDeny from all\n");
    }
    return $dir;
}

/**
 * Generate safe filename for workspace
 */
function getWorkspaceFilePath(string $apiKey): string {
    $dir = getDataDirectory();
    $sanitized = preg_replace('/[^a-zA-Z0-9_.-]/', '_', $apiKey);
    if (strlen($sanitized) === 0) {
        $sanitized = 'default';
    }
    // Hash long keys for filesystem safety while preserving prefix
    $prefix = substr($sanitized, 0, 16);
    $hash = md5($apiKey);
    return $dir . '/' . $prefix . '_' . $hash . '.json';
}

/**
 * Load workspace JSON data with shared read lock
 */
function loadWorkspace(string $apiKey): array {
    $filePath = getWorkspaceFilePath($apiKey);
    $default = [
        'version' => 1,
        'workspaceKey' => $apiKey,
        'updatedAt' => round(microtime(true) * 1000),
        'locations' => [],
        'rooms' => [],
        'furniture' => [],
        'containers' => [],
        'items' => []
    ];

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
    if (!is_array($decoded)) {
        return $default;
    }

    // Ensure array keys exist
    return array_merge($default, $decoded);
}

/**
 * Save workspace JSON data with exclusive write lock
 */
function saveWorkspace(string $apiKey, array $data): bool {
    $filePath = getWorkspaceFilePath($apiKey);
    $data['updatedAt'] = round(microtime(true) * 1000);
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

/**
 * Send JSON response and terminate
 */
function sendJsonResponse(array $payload, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send Error response
 */
function sendJsonError(string $message, int $statusCode = 400, array $details = []): void {
    sendJsonResponse([
        'success' => false,
        'error' => $message,
        'details' => $details,
        'timestamp' => round(microtime(true) * 1000)
    ], $statusCode);
}

/**
 * Read and decode incoming JSON request body
 */
function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) {
        return [];
    }
    $data = json_decode($raw, true);
    if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
        sendJsonError('Invalid JSON body: ' . json_last_error_msg(), 400);
    }
    return is_array($data) ? $data : [];
}

/**
 * Generate a random UUID v4 or clean ID
 */
function generateId(string $prefix = 'id'): string {
    $data = random_bytes(8);
    return $prefix . '-' . bin2hex($data);
}
