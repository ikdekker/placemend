<?php
// Placemend Alexa skill endpoint: "Alexa, ask Placemend where my steam iron is".
// Read-only: it only ever calls the MCP tool search_items, never a write tool.
//
// Every request is checked the way Amazon requires for self-hosted skills:
// signature certificate URL, certificate (validity, SAN echo-api.amazon.com, trusted chain),
// SHA-256 signature over the raw body, timestamp within 150 s, and our own skill ID.
//
// Config lives outside the web root (never in git): ALEXA_CONFIG_PATH, a JSON file with
//   {"skill_id": "amzn1.ask.skill....", "workspace_key": "pm_usr_..."}

const ALEXA_CONFIG_PATH = '/var/www/freshcoders.nl/private/placemend_alexa.json';
const ALEXA_MCP_URL = 'https://freshcoders.nl/placemend/api/mcp.php';
const ALEXA_CERT_CACHE = '/tmp/placemend-alexa-cert-';

header('Content-Type: application/json; charset=UTF-8');

function alexaSay(string $text, bool $end = true, ?string $reprompt = null): void {
    $out = ['version' => '1.0', 'response' => [
        'outputSpeech' => ['type' => 'PlainText', 'text' => $text],
        'shouldEndSession' => $end,
    ]];
    if ($reprompt !== null) $out['response']['reprompt'] = ['outputSpeech' => ['type' => 'PlainText', 'text' => $reprompt]];
    echo json_encode($out);
    exit;
}

function alexaReject(int $status, string $why): void {
    http_response_code($status);
    error_log("placemend alexa: rejected ($why)");
    echo json_encode(['error' => 'Request rejected']);
    exit;
}

function alexaVerify(string $raw): void {
    $url = $_SERVER['HTTP_SIGNATURECERTCHAINURL'] ?? '';
    $sig = $_SERVER['HTTP_SIGNATURE_256'] ?? '';
    if ($url === '' || $sig === '') alexaReject(400, 'missing signature headers');

    // The certificate URL must be https://s3.amazonaws.com[:443]/echo.api/...
    $u = parse_url($url);
    $path = isset($u['path']) ? preg_replace('#/+#', '/', $u['path']) : '';
    $segments = [];
    foreach (explode('/', $path) as $seg) {
        if ($seg === '..') array_pop($segments); elseif ($seg !== '' && $seg !== '.') $segments[] = $seg;
    }
    if (strtolower($u['scheme'] ?? '') !== 'https' || strtolower($u['host'] ?? '') !== 's3.amazonaws.com'
        || (isset($u['port']) && (int)$u['port'] !== 443) || ($segments[0] ?? '') !== 'echo.api') {
        alexaReject(400, 'bad certificate url');
    }

    $cacheFile = ALEXA_CERT_CACHE . sha1($url) . '.pem';
    $pem = is_file($cacheFile) && filemtime($cacheFile) > time() - 86400 ? file_get_contents($cacheFile) : false;
    if (!$pem) {
        $pem = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 5]]));
        if (!$pem) alexaReject(400, 'certificate download failed');
        @file_put_contents($cacheFile, $pem);
    }

    // First certificate is the signing cert; the rest form the chain to a trusted root
    preg_match_all('/-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----/s', $pem, $m);
    $certs = $m[0] ?? [];
    if (!$certs) alexaReject(400, 'no certificate');
    $leaf = openssl_x509_read($certs[0]);
    $info = $leaf ? openssl_x509_parse($leaf) : false;
    if (!$info || time() < $info['validFrom_time_t'] || time() > $info['validTo_time_t']) alexaReject(400, 'certificate not valid now');
    if (strpos($info['extensions']['subjectAltName'] ?? '', 'DNS:echo-api.amazon.com') === false) alexaReject(400, 'wrong certificate subject');

    $chainFile = tempnam(sys_get_temp_dir(), 'alexa-chain');
    file_put_contents($chainFile, implode("\n", array_slice($certs, 1)));
    $trusted = openssl_x509_checkpurpose($leaf, X509_PURPOSE_ANY, [], $chainFile);
    @unlink($chainFile);
    if ($trusted !== true) alexaReject(400, 'certificate chain not trusted');

    if (openssl_verify($raw, base64_decode($sig), openssl_pkey_get_public($leaf), OPENSSL_ALGO_SHA256) !== 1) {
        alexaReject(400, 'bad signature');
    }
}

function alexaSearch(string $key, string $query): array {
    $body = json_encode(['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call',
        'params' => ['name' => 'search_items', 'arguments' => ['query' => $query, 'limit' => 10]]]);
    $res = @file_get_contents(ALEXA_MCP_URL, false, stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 6, 'ignore_errors' => true,
        'header' => "Content-Type: application/json\r\nAccept: application/json\r\nAuthorization: Bearer $key\r\n",
        'content' => $body,
    ]]));
    $json = $res ? json_decode($res, true) : null;
    if (!is_array($json) || isset($json['error'])) throw new RuntimeException('search failed');
    $text = '';
    foreach ($json['result']['content'] ?? [] as $c) $text .= $c['text'] ?? '';

    // "- Steam iron ×1 — Pantry › Metal storage rack › Shelf 2 (item_id: ...)"
    $hits = [];
    foreach (preg_split('/\R/u', $text) as $line) {
        if (!preg_match('/^- (.+?) \x{00D7}(\d+) \x{2014} (.*?) \(item_id: [^)]*\)$/u', $line, $mm)) continue;
        $k = strtolower($mm[1]) . '|' . $mm[3];
        if (isset($hits[$k])) $hits[$k]['qty'] += (int)$mm[2];
        else $hits[$k] = ['name' => $mm[1], 'qty' => (int)$mm[2], 'path' => $mm[3]];
    }
    return array_values($hits);
}

function alexaPath(string $p): string {
    $parts = array_filter(array_map('trim', preg_split('/\x{203A}/u', $p)), fn($s) => $s !== '');
    return $parts ? implode(', ', $parts) : 'an unknown place';
}

function alexaAnswer(string $key, string $raw): string {
    $q = trim(preg_replace('/^(the|my|a|an|our|some)\s+/i', '', trim($raw, " ?.!")));
    if ($q === '') return 'What should I look for?';
    $hits = alexaSearch($key, $q);
    if (!$hits) return "I couldn't find $q in Placemend.";
    if (count($hits) === 1) {
        $h = $hits[0];
        return 'The ' . $h['name'] . ($h['qty'] > 1 ? " ({$h['qty']} of them)" : '') . ' is in ' . alexaPath($h['path']) . '.';
    }
    $parts = array_map(fn($h) => $h['name'] . ' in ' . alexaPath($h['path']), array_slice($hits, 0, 3));
    $more = count($hits) > 3 ? ', and ' . (count($hits) - 3) . ' more' : '';
    return 'I found ' . count($hits) . ' matches: ' . implode('; ', $parts) . $more . '.';
}

// ---- request handling ----
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') alexaReject(405, 'method');
$raw = file_get_contents('php://input');
alexaVerify($raw);

$req = json_decode($raw, true);
if (!is_array($req)) alexaReject(400, 'bad json');
$ts = strtotime($req['request']['timestamp'] ?? '');
if (!$ts || abs(time() - $ts) > 150) alexaReject(400, 'stale timestamp');

$cfg = json_decode((string)@file_get_contents(ALEXA_CONFIG_PATH), true);
if (!is_array($cfg) || empty($cfg['skill_id']) || empty($cfg['workspace_key'])) alexaReject(500, 'not configured');
$appId = $req['context']['System']['application']['applicationId'] ?? ($req['session']['application']['applicationId'] ?? '');
if (!hash_equals($cfg['skill_id'], (string)$appId)) alexaReject(400, 'wrong skill id');

$type = $req['request']['type'] ?? '';
if ($type === 'LaunchRequest') alexaSay('What are you looking for? For example, say: where is the steam iron.', false, 'What are you looking for?');
if ($type === 'SessionEndedRequest') { echo json_encode(['version' => '1.0', 'response' => new stdClass()]); exit; }
if ($type !== 'IntentRequest') alexaSay('Sorry, I did not get that.');

$intent = $req['request']['intent']['name'] ?? '';
switch ($intent) {
    case 'WhereIsIntent':
        $item = (string)($req['request']['intent']['slots']['item']['value'] ?? '');
        try { alexaSay(alexaAnswer($cfg['workspace_key'], $item)); }
        catch (Throwable $e) { error_log('placemend alexa: ' . $e->getMessage()); alexaSay("Sorry, I couldn't reach Placemend right now."); }
    case 'AMAZON.HelpIntent':
        alexaSay('Ask me where something is, for example: where is the frying pan.', false, 'What are you looking for?');
    case 'AMAZON.CancelIntent':
    case 'AMAZON.StopIntent':
        alexaSay('Okay.');
    default:
        alexaSay("Sorry, I can only tell you where things are. Try: where is the steam iron.", false, 'What are you looking for?');
}
