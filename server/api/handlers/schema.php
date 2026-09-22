<?php
// Placemend API - Schema, OpenAPI & Vision AI System Prompt Handler

require_once __DIR__ . '/../common.php';

function handleSchema(): void {
    $baseUrl = 'https://freshcoders.nl/placemend/api';

    $visionSystemPrompt = <<<PROMPT
You are a spatial interior vision assistant for Placemend, a 2D floorplan and physical inventory management application.
When the user gives you an image or walkaround video of a room, your task is to identify furniture, the storage compartments/containers on or inside that furniture, and any visible or stated items.

Output strictly valid JSON matching this schema:
```json
{
  "roomName": "Living Room",
  "furniture": [
    {
      "name": "Oak Bookshelf",
      "type": "bookshelf",
      "dimension": { "width": 4, "length": 2, "height": 180 },
      "color": "#854d0e",
      "notes": "Against north wall",
      "containers": [
        {
          "name": "Top Shelf",
          "type": "shelf",
          "items": [
            {
              "name": "Sci-Fi Novels",
              "quantity": 5,
              "category": "Books",
              "tags": ["books", "fiction", "reading"]
            }
          ]
        },
        {
          "name": "Bottom Shelf",
          "type": "shelf",
          "items": [
            {
              "name": "Board Games",
              "quantity": 2,
              "category": "Games",
              "tags": ["games", "entertainment"]
            }
          ]
        }
      ]
    }
  ]
}
```

Rules:
1. Supported furniture types: "desk", "closet", "wardrobe", "bookshelf", "storage_rack", "dresser", "cabinet", "table", "bed", "sofa", "workbench", "box_stack", "other".
2. Supported container types: "shelf", "drawer", "box", "bin", "compartment", "cabinet_door", "hanging_rod", "top_surface", "general".
3. Dimensions are in grid units (approx 1 unit = 0.5 to 1 meter). Height is in cm.
4. If exact position is unknown, omit the "position" field; Placemend's engine will auto-place the furniture.
PROMPT;

    $openApiSpec = [
        'openapi' => '3.0.0',
        'info' => [
            'title' => 'Placemend Room & Inventory AI API',
            'version' => '1.0.0',
            'description' => 'Real-time spatial inventory indexing API for external AI vision models and automation scripts.'
        ],
        'servers' => [
            ['url' => $baseUrl, 'description' => 'Production API Server']
        ],
        'paths' => [
            '/v1/ai/index' => [
                'post' => [
                    'summary' => 'Index detected room furniture, containers, and items',
                    'requestBody' => [
                        'required' => true,
                        'content' => [
                            'application/json' => [
                                'schema' => [
                                    'type' => 'object',
                                    'properties' => [
                                        'roomId' => ['type' => 'string'],
                                        'roomName' => ['type' => 'string'],
                                        'furniture' => ['type' => 'array'],
                                        'items' => ['type' => 'array']
                                    ]
                                ]
                            ]
                        ]
                    ],
                    'responses' => [
                        '200' => ['description' => 'Objects indexed successfully']
                    ]
                ]
            ],
            '/v1/sync' => [
                'get' => ['summary' => 'Get full workspace state'],
                'post' => ['summary' => 'Bidirectional state synchronization']
            ],
            '/v1/rooms' => [
                'get' => ['summary' => 'List workspace rooms']
            ]
        ]
    ];

    sendJsonResponse([
        'success' => true,
        'endpoints' => [
            'aiIndex' => $baseUrl . '/v1/ai/index',
            'sync' => $baseUrl . '/v1/sync',
            'rooms' => $baseUrl . '/v1/rooms',
            'schema' => $baseUrl . '/v1/schema'
        ],
        'visionSystemPrompt' => $visionSystemPrompt,
        'openApi' => $openApiSpec
    ]);
}
