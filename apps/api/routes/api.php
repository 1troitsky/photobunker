<?php

use App\Http\Controllers\HealthController;
use App\Http\Controllers\PrototypeLibraryController;
use App\Http\Controllers\PrototypeProfileController;
use App\Http\Middleware\LocalPrototype;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health', [HealthController::class, 'live']);
    Route::get('/ready', [HealthController::class, 'ready']);
    Route::prefix('prototype')->middleware(LocalPrototype::class)->group(function (): void {
        Route::post('/libraries', [PrototypeLibraryController::class, 'create']);
        Route::get('/profiles', [PrototypeProfileController::class, 'index']);
        Route::put('/profiles/{id}', [PrototypeProfileController::class, 'save'])->whereUuid('id');
        Route::get('/photos', [PrototypeLibraryController::class, 'index']);
        Route::post('/photos', [PrototypeLibraryController::class, 'upload']);
        Route::get('/photos/{id}', [PrototypeLibraryController::class, 'show'])->whereUuid('id');
        Route::get('/photos/{id}/{kind}', [PrototypeLibraryController::class, 'content'])->whereUuid('id');
        Route::patch('/photos/{id}', [PrototypeLibraryController::class, 'update'])->whereUuid('id');
        Route::delete('/photos/{id}', [PrototypeLibraryController::class, 'delete'])->whereUuid('id');
    });
});
