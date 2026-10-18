<?php

return [
    'enabled' => env('IDENTITY_ENABLED', true),
    'origins' => explode(',', env('IDENTITY_ORIGINS', 'http://localhost:8080,http://127.0.0.1:8080,http://photobunker.orb.local,https://photobunker.orb.local')),
    'read_requests_per_minute' => 1200,
    'write_requests_per_minute' => 180,
    'session_minutes' => 60 * 24 * 400,
    'matrix_url' => env('MATRIX_INTERNAL_URL', 'http://matrix:8008'),
    'matrix_server' => env('MATRIX_SERVER_NAME', 'matrix.photobunker.test'),
    'matrix_secret' => env('MATRIX_REGISTRATION_SECRET', ''),
    'matrix_admin_password' => env('MATRIX_BOOTSTRAP_PASSWORD', ''),
];
