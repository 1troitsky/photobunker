<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

final class LocalPrototype
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(app()->environment('local', 'testing') && config('prototype.enabled'), 404);
        $creating = $request->method() === 'POST' && $request->is('api/v1/prototype/libraries');
        $ip = hash('sha256', (string) $request->ip());
        // No cookies: the explicit Authorization header prevents cross-site form CSRF.
        if ($creating) {
            $this->limit('prototype:create:'.$ip, 10);

            return $next($request);
        }
        $invalid = 'prototype:invalid:'.$ip;
        abort_if(RateLimiter::tooManyAttempts($invalid, 120), 429);
        $token = $request->bearerToken() ?? '';
        $library = preg_match('/^[a-f0-9]{64}$/D', $token)
            ? DB::table('prototype_libraries')->where('token_hash', hash('sha256', $token))->value('id') : null;
        if (! $library) {
            RateLimiter::hit($invalid, 60);
            abort(401);
        }
        $this->limit('prototype:library:'.$library, 120);
        $request->attributes->set('prototype_library', $library);

        return $next($request);
    }

    private function limit(string $key, int $maximum): void
    {
        abort_if(RateLimiter::tooManyAttempts($key, $maximum), 429);
        RateLimiter::hit($key, 60);
    }
}
