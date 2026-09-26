<?php
// Placemend API - Client error reporting (write-only; the log lives in the private data/ directory)
require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonError('Method not allowed. Use POST.', 405);
}

$logFile = getDataDirectory() . '/client-errors.log';
// Cap the log so an abusive client cannot fill the disk
if (file_exists($logFile) && filesize($logFile) > 512 * 1024) {
    sendJsonResponse(['success' => true, 'stored' => false]);
}

$body = getJsonBody();
$entry = [
    'at' => date('c'),
    'ua' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200),
    'context' => substr((string)($body['context'] ?? ''), 0, 200),
    'message' => substr((string)($body['message'] ?? ''), 0, 1000),
    'stack' => substr((string)($body['stack'] ?? ''), 0, 3000),
    'state' => substr(json_encode($body['state'] ?? null), 0, 1000),
];
@file_put_contents($logFile, json_encode($entry, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
@chmod($logFile, 0666);

sendJsonResponse(['success' => true, 'stored' => true]);
