<?php
// Placemend API - change history
//   GET  history.php?limit=100[&recordId=...]  -> recent changes, newest first
//   POST history.php {"undo": "<entry id>"}     -> undo one change

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/history_lib.php';

$apiKey = getWorkspaceApiKey();
if (strpos($apiKey, 'pm_usr_') !== 0) sendJsonError('History is available for signed-in workspaces.', 403);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $limit = max(1, min(500, (int)($_GET['limit'] ?? 100)));
    $recordId = isset($_GET['recordId']) && $_GET['recordId'] !== '' ? (string)$_GET['recordId'] : null;
    sendJsonResponse(['success' => true, 'entries' => historyList(loadWorkspace($apiKey), $recordId, $limit)]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = getJsonBody();
    $id = (string)($body['undo'] ?? '');
    if ($id === '') sendJsonError('Missing "undo" entry id.');
    try {
        sendJsonResponse(['success' => true, 'message' => historyUndo($apiKey, $id, historySource('undo'))]);
    } catch (InvalidArgumentException $e) {
        sendJsonError($e->getMessage(), 409);
    }
}

sendJsonError('Method not allowed. Use GET or POST.', 405);
