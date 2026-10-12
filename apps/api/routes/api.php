<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health', [HealthController::class, 'live']);
    Route::get('/ready', [HealthController::class, 'ready']);
});
