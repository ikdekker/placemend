<?php
// Placemend API - AI Object Indexing Handler

require_once __DIR__ . '/../common.php';

function handleAiIndex(): void {
    $apiKey = getWorkspaceApiKey();
    $body = getJsonBody();

    if (empty($body)) {
        sendJsonError('Request body cannot be empty. Expecting JSON payload with room and furniture/items.', 400);
    }

    $workspace = loadWorkspace($apiKey);

    // 1. Resolve or create Location
    $locations = &$workspace['locations'];
    if (empty($locations)) {
        $locations[] = [
            'id' => 'loc-main',
            'name' => 'Main Residence',
            'description' => 'Workspace auto-created by AI indexer',
            'createdAt' => round(microtime(true) * 1000),
            'updatedAt' => round(microtime(true) * 1000)
        ];
    }
    $locationId = $locations[0]['id'];

    // 2. Resolve or create Room
    $rooms = &$workspace['rooms'];
    $targetRoomId = !empty($body['roomId']) ? trim($body['roomId']) : null;
    $targetRoomName = !empty($body['roomName']) ? trim($body['roomName']) : null;

    $matchedRoom = null;
    $matchedIndex = -1;

    if ($targetRoomId) {
        foreach ($rooms as $idx => $r) {
            if ($r['id'] === $targetRoomId) {
                $matchedRoom = &$rooms[$idx];
                $matchedIndex = $idx;
                break;
            }
        }
    }

    if (!$matchedRoom && $targetRoomName) {
        foreach ($rooms as $idx => $r) {
            if (strcasecmp($r['name'], $targetRoomName) === 0) {
                $matchedRoom = &$rooms[$idx];
                $matchedIndex = $idx;
                break;
            }
        }
    }

    // If still not matched, use first room or create new room
    if (!$matchedRoom) {
        if (!empty($rooms) && !$targetRoomName && !$targetRoomId) {
            $matchedRoom = &$rooms[0];
            $matchedIndex = 0;
        } else {
            $newRoomName = $targetRoomName ?: 'Scanned Room';
            $newRoomId = $targetRoomId ?: generateId('room');
            $newRoom = [
                'id' => $newRoomId,
                'locationId' => $locationId,
                'name' => $newRoomName,
                'color' => '#3b82f6',
                'gridWidth' => 30,
                'gridHeight' => 22,
                'unitSize' => 24,
                'shapeType' => 'rectangle',
                'doors' => [
                    [
                        'id' => generateId('door'),
                        'label' => 'Main Door',
                        'wall' => 'bottom',
                        'offset' => 12,
                        'swing' => 'inward_left',
                        'width' => 2
                    ]
                ],
                'createdAt' => round(microtime(true) * 1000),
                'updatedAt' => round(microtime(true) * 1000)
            ];
            $rooms[] = $newRoom;
            $matchedIndex = count($rooms) - 1;
            $matchedRoom = &$rooms[$matchedIndex];
        }
    }

    $activeRoomId = $matchedRoom['id'];
    $roomWidth = (int)($matchedRoom['gridWidth'] ?? 30);
    $roomHeight = (int)($matchedRoom['gridHeight'] ?? 22);

    // 3. Process Furniture & Smart Collision-Avoidance Placement
    $existingFurniture = &$workspace['furniture'];
    $containers = &$workspace['containers'];
    $items = &$workspace['items'];

    // Map occupied cells in the room
    $occupied = [];
    foreach ($existingFurniture as $f) {
        if (($f['roomId'] ?? '') === $activeRoomId && isset($f['position'], $f['dimension'])) {
            $fx = (int)$f['position']['x'];
            $fy = (int)$f['position']['y'];
            $fw = (int)$f['dimension']['width'];
            $fl = (int)$f['dimension']['length'];
            for ($x = $fx; $x < $fx + $fw; $x++) {
                for ($y = $fy; $y < $fy + $fl; $y++) {
                    $occupied["$x,$y"] = true;
                }
            }
        }
    }

    // Helper to find next non-overlapping spot
    $findFreePosition = function(int $width, int $length) use (&$occupied, $roomWidth, $roomHeight): array {
        // First try along perimeter walls (top, right, bottom, left) with margin
        for ($y = 1; $y <= $roomHeight - $length - 1; $y++) {
            for ($x = 1; $x <= $roomWidth - $width - 1; $x++) {
                $collides = false;
                for ($dx = 0; $dx < $width; $dx++) {
                    for ($dy = 0; $dy < $length; $dy++) {
                        if (isset($occupied[($x + $dx) . ',' . ($y + $dy)])) {
                            $collides = true;
                            break 2;
                        }
                    }
                }
                if (!$collides) {
                    // Mark occupied with 1 unit padding
                    for ($dx = 0; $dx < $width; $dx++) {
                        for ($dy = 0; $dy < $length; $dy++) {
                            $occupied[($x + $dx) . ',' . ($y + $dy)] = true;
                        }
                    }
                    return ['x' => $x, 'y' => $y, 'rotation' => 0];
                }
            }
        }
        return ['x' => 2, 'y' => 2, 'rotation' => 0];
    };

    $validFurnitureTypes = [
        'desk', 'closet', 'wardrobe', 'bookshelf', 'storage_rack',
        'dresser', 'cabinet', 'table', 'bed', 'sofa', 'workbench', 'box_stack', 'other'
    ];

    $typeColors = [
        'desk' => '#475569',
        'closet' => '#7c3aed',
        'wardrobe' => '#6d28d9',
        'bookshelf' => '#854d0e',
        'storage_rack' => '#059669',
        'dresser' => '#b45309',
        'cabinet' => '#0284c7',
        'table' => '#d97706',
        'bed' => '#4338ca',
        'sofa' => '#0d9488',
        'workbench' => '#ea580c',
        'box_stack' => '#ca8a04',
        'other' => '#64748b'
    ];

    $createdFurnitureCount = 0;
    $createdContainersCount = 0;
    $createdItemsCount = 0;

    $inputFurniture = $body['furniture'] ?? [];
    if (!is_array($inputFurniture)) {
        $inputFurniture = [];
    }

    foreach ($inputFurniture as $furnInput) {
        $rawType = strtolower(trim($furnInput['type'] ?? 'other'));
        // Normalize common AI variations
        if (strpos($rawType, 'shelf') !== false || strpos($rawType, 'book') !== false) {
            $fType = 'bookshelf';
        } elseif (strpos($rawType, 'desk') !== false || strpos($rawType, 'work') !== false) {
            $fType = 'desk';
        } elseif (strpos($rawType, 'wardrobe') !== false || strpos($rawType, 'closet') !== false || strpos($rawType, 'armoire') !== false) {
            $fType = 'wardrobe';
        } elseif (strpos($rawType, 'cabinet') !== false || strpos($rawType, 'cupboard') !== false || strpos($rawType, 'sideboard') !== false) {
            $fType = 'cabinet';
        } elseif (strpos($rawType, 'dresser') !== false || strpos($rawType, 'chest') !== false) {
            $fType = 'dresser';
        } elseif (strpos($rawType, 'table') !== false || strpos($rawType, 'dining') !== false) {
            $fType = 'table';
        } elseif (strpos($rawType, 'bed') !== false) {
            $fType = 'bed';
        } elseif (strpos($rawType, 'sofa') !== false || strpos($rawType, 'couch') !== false) {
            $fType = 'sofa';
        } elseif (in_array($rawType, $validFurnitureTypes, true)) {
            $fType = $rawType;
        } else {
            $fType = 'other';
        }

        // Dimension
        $fWidth = max(1, min($roomWidth, (int)($furnInput['dimension']['width'] ?? 4)));
        $fLength = max(1, min($roomHeight, (int)($furnInput['dimension']['length'] ?? 2)));
        $fHeight = !empty($furnInput['dimension']['height']) ? (int)$furnInput['dimension']['height'] : 120;

        // Position
        if (isset($furnInput['position']['x']) && isset($furnInput['position']['y'])) {
            $pos = [
                'x' => max(0, min($roomWidth - $fWidth, (int)$furnInput['position']['x'])),
                'y' => max(0, min($roomHeight - $fLength, (int)$furnInput['position']['y'])),
                'rotation' => in_array((int)($furnInput['position']['rotation'] ?? 0), [0, 90, 180, 270], true) 
                    ? (int)$furnInput['position']['rotation'] 
                    : 0
            ];
        } else {
            $pos = $findFreePosition($fWidth, $fLength);
        }

        $furnId = !empty($furnInput['id']) ? trim($furnInput['id']) : generateId('furn');
        $furnColor = !empty($furnInput['color']) ? trim($furnInput['color']) : ($typeColors[$fType] ?? '#475569');
        $furnName = !empty($furnInput['name']) ? trim($furnInput['name']) : ucfirst($fType);

        $now = round(microtime(true) * 1000);
        $furnitureRecord = [
            'id' => $furnId,
            'roomId' => $activeRoomId,
            'name' => $furnName,
            'type' => $fType,
            'position' => $pos,
            'dimension' => [
                'width' => $fWidth,
                'length' => $fLength,
                'height' => $fHeight
            ],
            'color' => $furnColor,
            'notes' => $furnInput['notes'] ?? 'Indexed by AI',
            'facadeLayout' => $furnInput['facadeLayout'] ?? 'horizontal_row',
            'createdAt' => $now,
            'updatedAt' => $now
        ];

        // Upsert furniture (update if existing ID, otherwise append)
        $existingFurnIdx = -1;
        foreach ($existingFurniture as $idx => $ef) {
            if ($ef['id'] === $furnId) {
                $existingFurnIdx = $idx;
                break;
            }
        }
        if ($existingFurnIdx >= 0) {
            $existingFurniture[$existingFurnIdx] = array_merge($existingFurniture[$existingFurnIdx], $furnitureRecord);
        } else {
            $existingFurniture[] = $furnitureRecord;
            $createdFurnitureCount++;
        }

        // Process Containers
        $inputContainers = $furnInput['containers'] ?? [];
        if (empty($inputContainers)) {
            // Auto-generate sensible default containers based on furniture type
            if ($fType === 'desk') {
                $inputContainers = [
                    ['name' => 'Desk Surface', 'type' => 'top_surface'],
                    ['name' => 'Upper Drawer', 'type' => 'drawer']
                ];
            } elseif ($fType === 'bookshelf') {
                $inputContainers = [
                    ['name' => 'Top Shelf', 'type' => 'shelf'],
                    ['name' => 'Middle Shelf', 'type' => 'shelf'],
                    ['name' => 'Bottom Shelf', 'type' => 'shelf']
                ];
            } elseif ($fType === 'wardrobe' || $fType === 'closet') {
                $inputContainers = [
                    ['name' => 'Hanging Section', 'type' => 'hanging_rod'],
                    ['name' => 'Top Shelf', 'type' => 'shelf']
                ];
            } else {
                $inputContainers = [
                    ['name' => 'Main Compartment', 'type' => 'compartment']
                ];
            }
        }

        $validContainerTypes = [
            'shelf', 'drawer', 'box', 'bin', 'compartment', 
            'cabinet_door', 'hanging_rod', 'top_surface', 'general'
        ];

        foreach ($inputContainers as $cIndex => $contInput) {
            $contId = !empty($contInput['id']) ? trim($contInput['id']) : generateId('cont');
            $rawCType = strtolower(trim($contInput['type'] ?? 'shelf'));
            $cType = in_array($rawCType, $validContainerTypes, true) ? $rawCType : 'shelf';
            $cName = !empty($contInput['name']) ? trim($contInput['name']) : ('Section ' . ($cIndex + 1));

            $containerRecord = [
                'id' => $contId,
                'furnitureId' => $furnId,
                'parentContainerId' => $contInput['parentContainerId'] ?? null,
                'name' => $cName,
                'type' => $cType,
                'color' => $contInput['color'] ?? null,
                'orderIndex' => isset($contInput['orderIndex']) ? (int)$contInput['orderIndex'] : $cIndex,
                'notes' => $contInput['notes'] ?? null,
                'createdAt' => $now,
                'updatedAt' => $now
            ];

            // Upsert container
            $existingCIdx = -1;
            foreach ($containers as $idx => $ec) {
                if ($ec['id'] === $contId) {
                    $existingCIdx = $idx;
                    break;
                }
            }
            if ($existingCIdx >= 0) {
                $containers[$existingCIdx] = array_merge($containers[$existingCIdx], $containerRecord);
            } else {
                $containers[] = $containerRecord;
                $createdContainersCount++;
            }

            // Process Items within container
            $inputItems = $contInput['items'] ?? [];
            foreach ($inputItems as $itemInput) {
                $itemId = !empty($itemInput['id']) ? trim($itemInput['id']) : generateId('item');
                $itemName = !empty($itemInput['name']) ? trim($itemInput['name']) : 'Indexed Object';
                $quantity = max(1, (int)($itemInput['quantity'] ?? 1));
                $tags = !empty($itemInput['tags']) && is_array($itemInput['tags']) 
                    ? array_values(array_unique(array_map('trim', $itemInput['tags'])))
                    : [];

                $itemRecord = [
                    'id' => $itemId,
                    'containerId' => $contId,
                    'name' => $itemName,
                    'description' => $itemInput['description'] ?? 'Detected by AI camera scanner',
                    'quantity' => $quantity,
                    'category' => $itemInput['category'] ?? 'General',
                    'tags' => $tags,
                    'favorite' => !empty($itemInput['favorite']),
                    'createdAt' => $now,
                    'updatedAt' => $now
                ];

                $existingItemIdx = -1;
                foreach ($items as $idx => $ei) {
                    if ($ei['id'] === $itemId) {
                        $existingItemIdx = $idx;
                        break;
                    }
                }
                if ($existingItemIdx >= 0) {
                    $items[$existingItemIdx] = array_merge($items[$existingItemIdx], $itemRecord);
                } else {
                    $items[] = $itemRecord;
                    $createdItemsCount++;
                }
            }
        }
    }

    // 4. Handle any root-level items (loose items)
    $rootItems = $body['items'] ?? [];
    if (is_array($rootItems) && !empty($rootItems)) {
        // If there are loose items without a container, put them in the first container of the room
        $targetContainerId = null;
        foreach ($containers as $c) {
            foreach ($existingFurniture as $f) {
                if ($f['id'] === $c['furnitureId'] && $f['roomId'] === $activeRoomId) {
                    $targetContainerId = $c['id'];
                    break 2;
                }
            }
        }

        if (!$targetContainerId) {
            // Create a general storage box
            $tempFurnId = generateId('furn');
            $tempPos = $findFreePosition(3, 2);
            $now = round(microtime(true) * 1000);
            $existingFurniture[] = [
                'id' => $tempFurnId,
                'roomId' => $activeRoomId,
                'name' => 'Storage Box Stack',
                'type' => 'box_stack',
                'position' => $tempPos,
                'dimension' => ['width' => 3, 'length' => 2, 'height' => 80],
                'color' => '#ca8a04',
                'notes' => 'Auto-created for loose indexed items',
                'createdAt' => $now,
                'updatedAt' => $now
            ];
            $createdFurnitureCount++;

            $tempContId = generateId('cont');
            $containers[] = [
                'id' => $tempContId,
                'furnitureId' => $tempFurnId,
                'name' => 'General Storage',
                'type' => 'box',
                'orderIndex' => 0,
                'createdAt' => $now,
                'updatedAt' => $now
            ];
            $createdContainersCount++;
            $targetContainerId = $tempContId;
        }

        foreach ($rootItems as $itemInput) {
            $itemId = !empty($itemInput['id']) ? trim($itemInput['id']) : generateId('item');
            $items[] = [
                'id' => $itemId,
                'containerId' => $targetContainerId,
                'name' => !empty($itemInput['name']) ? trim($itemInput['name']) : 'Object',
                'description' => $itemInput['description'] ?? 'Loose item indexed by AI',
                'quantity' => max(1, (int)($itemInput['quantity'] ?? 1)),
                'category' => $itemInput['category'] ?? 'General',
                'tags' => !empty($itemInput['tags']) && is_array($itemInput['tags']) ? $itemInput['tags'] : [],
                'createdAt' => round(microtime(true) * 1000),
                'updatedAt' => round(microtime(true) * 1000)
            ];
            $createdItemsCount++;
        }
    }

    // Update room timestamp
    $matchedRoom['updatedAt'] = round(microtime(true) * 1000);

    // Save atomic workspace state
    $saved = saveWorkspace($apiKey, $workspace);
    if (!$saved) {
        sendJsonError('Failed to save workspace state to server storage.', 500);
    }

    sendJsonResponse([
        'success' => true,
        'message' => sprintf(
            'Successfully indexed %d furniture piece(s), %d container(s), and %d item(s) into "%s".',
            $createdFurnitureCount,
            $createdContainersCount,
            $createdItemsCount,
            $matchedRoom['name']
        ),
        'workspaceKey' => $apiKey,
        'roomId' => $activeRoomId,
        'roomName' => $matchedRoom['name'],
        'created' => [
            'furniture' => $createdFurnitureCount,
            'containers' => $createdContainersCount,
            'items' => $createdItemsCount
        ],
        'total' => [
            'furniture' => count($existingFurniture),
            'containers' => count($containers),
            'items' => count($items)
        ],
        'data' => [
            'room' => $matchedRoom,
            'furniture' => array_values(array_filter($existingFurniture, fn($f) => $f['roomId'] === $activeRoomId))
        ]
    ], 200);
}
