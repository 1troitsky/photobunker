<?php

namespace App\Http\Controllers;

use App\Encrypted\Keys;
use App\Encrypted\Objects;
use App\Encrypted\Protocol;
use App\Identity\Accounts;
use App\Prototype\Retention;
use App\Workspace\Workspace;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * R1-03B v2 card shares are stored alongside, but never interpreted as,
 * legacy v1 JPEG shares. Nothing in this controller receives the AES key,
 * fragment secret or plaintext card. Only an encrypted 'card' object is
 * accepted until a redaction-certified preview/original renderer exists.
 */
final class PhotoCardShareController
{
    public function __construct(
        private readonly Keys $keys,
        private readonly Objects $objects,
        private readonly Workspace $workspace,
        private readonly Accounts $accounts,
        private readonly PhotoVersionController $versions,
        private readonly PhotoShareController $legacy,
    ) {}

    private function manifest(object $share): array
    {
        $m = Protocol::decode($share->manifest, 3000);
        if (($m['type'] ?? null) !== 'photo-card' || ($m['version'] ?? null) !== 2) {
            abort(404);
        }
        try {
            $this->validateManifest($m);
        } catch (\Throwable) {
            abort(410);
        }

        return $m;
    }

    private function validateManifest(array $m): void
    {
        Protocol::fields($m, ['type', 'version', 'id', 'scopes', 'expiresAt', 'durationSeconds', 'object']);
        Validator::make($m, [
            'type' => 'required|in:photo-card', 'version' => 'required|integer|in:2',
            'id' => 'required|uuid', 'expiresAt' => 'required|integer|min:1|max:9007199254740991',
            'durationSeconds' => 'required|integer|in:3600,86400,604800',
            'scopes' => 'required|array:card,photo,original,download,metadata|size:5',
            'scopes.card' => 'required|accepted',
            'scopes.photo' => 'required|boolean',
            'scopes.original' => 'required|boolean',
            'scopes.download' => 'required|boolean',
            'scopes.metadata' => 'required|boolean',
            'object' => 'required|array:type,version,iv,ciphertextHash,ciphertextBytes|size:5',
            'object.type' => 'required|in:card', 'object.version' => 'required|integer|in:1',
            'object.iv' => 'required|string|size:16',
            'object.ciphertextHash' => 'required|string|size:43',
            'object.ciphertextBytes' => 'required|integer|min:17|max:32784',
        ])->validate();
        // No accidental extra scopes, and never let download grant an image.
        abort_unless($m['scopes']['card'] === true &&
            $m['scopes']['photo'] === false && $m['scopes']['original'] === false &&
            $m['scopes']['download'] === false && is_bool($m['scopes']['metadata']), 422);
        Protocol::bytes($m['object']['iv'], 12);
    }

    private function effectiveRead(string $actor, object $row): array
    {
        $grant = $this->workspace->grant($actor, $row);
        abort_unless($grant['shareExternal'] && $grant['read'] && $grant['thumbnail'], 403);
        $actual = $this->objects->serialize($actor, $row)['access'];
        abort_unless($actual['read'] && $actual['shareExternal'], 403);

        return $actual;
    }

    public function index(Request $request, string $id)
    {
        $actor = $this->accounts->current($request)->id;
        $this->keys->read($request);
        $photo = $this->objects->active($actor, $id);
        $this->effectiveRead($actor, $photo);
        $items = DB::table('encrypted_shares')->where('photo_id', $id)
            ->where('creator_id', $actor)->orderByDesc('created_at')->get()
            ->map(function ($row) {
                $m = Protocol::decode($row->manifest);
                if (($m['type'] ?? null) !== 'photo-card' || ($m['version'] ?? null) !== 2) {
                    return null;
                }

                return ['id' => $row->id, 'expiresAt' => (int) $row->expires_at,
                    'scopes' => $m['scopes'], 'revoked' => (bool) $row->revoked_at];
            })->filter()->values();

        return response()->json(['shares' => $items], 200, ['Cache-Control' => 'no-store']);
    }

    public function create(Request $request, string $id)
    {
        $actor = $this->accounts->current($request)->id;
        $this->keys->read($request);
        $data = $request->validate(['manifest' => 'required|string|max:3000', 'file' => 'required|file|max:40']);
        $manifest = Protocol::decode($data['manifest'], 3000);
        $this->validateManifest($manifest);
        $file = $request->file('file');
        abort_unless($file->getSize() === $manifest['object']['ciphertextBytes'] &&
            Protocol::ciphertextHash($file->getRealPath()) === $manifest['object']['ciphertextHash'], 422);

        $result = DB::transaction(function () use ($actor, $id, $data, $manifest, $file) {
            $photo = $this->versions->lock($actor, $id);
            $this->effectiveRead($actor, $photo);
            abort_unless($photo->creator_id && $manifest['expiresAt'] <= $photo->expires_at &&
                $manifest['expiresAt'] > Retention::milliseconds() &&
                $manifest['expiresAt'] <= Retention::milliseconds() + $manifest['durationSeconds'] * 1000, 422);
            abort_if(DB::table('photo_card_share_tombstones')->where('id', $manifest['id'])->exists(), 410);
            $existing = DB::table('encrypted_shares')->find($manifest['id']);
            if ($existing) {
                abort_if($existing->revoked_at, 410);
                abort_unless($existing->creator_id === $actor && $existing->photo_id === $id &&
                    hash_equals($existing->manifest, $data['manifest']), 409);

                return ['id' => $existing->id, 'expiresAt' => (int) $existing->expires_at];
            }
            $this->versions->quota($photo, $file->getSize());
            $object = (string) Str::uuid();
            $this->versions->store($photo, $object, 'share-export', $file, '{}');
            abort_if($photo->expires_at <= Retention::milliseconds(), 410);
            DB::table('encrypted_shares')->insert([
                'id' => $manifest['id'], 'photo_id' => $id, 'object_id' => $object,
                'creator_id' => $actor, 'manifest' => $data['manifest'],
                'expires_at' => $manifest['expiresAt'], 'created_at' => now(),
            ]);

            return ['id' => $manifest['id'], 'expiresAt' => $manifest['expiresAt']];
        }, 3);

        return response()->json($result, 200, ['Cache-Control' => 'no-store']);
    }

    public function revoke(Request $request, string $id, string $shareId)
    {
        $actor = $this->accounts->current($request)->id;
        $this->keys->read($request);
        $share = DB::transaction(function () use ($actor, $id, $shareId) {
            $photo = $this->versions->lock($actor, $id);
            $grant = $this->workspace->grant($actor, $photo);
            $share = DB::table('encrypted_shares')->where('id', $shareId)->first();
            if ($share) {
                abort_unless($share->photo_id === $id, 404);
                $this->manifest($share); // never revoke a legacy /s share here
                abort_unless($share->creator_id === $actor ||
                    in_array($grant['role'], ['owner', 'curator'], true), 403);
            } else {
                $prior = DB::table('photo_card_share_tombstones')->where('id', $shareId)->first();
                if ($prior) {
                    abort_unless($prior->photo_id === $id && $prior->creator_id === $actor, 404);
                } else {
                    // Allowed to pre-revoke the UUID of an as-yet unacknowledged
                    // card only with the current shareExternal/strong E2EE grant.
                    $this->effectiveRead($actor, $photo);
                }
            }
            DB::table('photo_card_share_tombstones')->insertOrIgnore([
                'id' => $shareId, 'photo_id' => $id, 'creator_id' => $share?->creator_id ?? $actor,
                'created_at' => now(),
            ]);
            if ($share && ! $share->revoked_at) {
                DB::table('encrypted_shares')->where('id', $shareId)->update(['revoked_at' => now()]);
            }

            return $share;
        }, 3);
        $deleted = ! $share || $this->legacy->cleanup($share);

        return response()->json(['revoked' => true, 'deletion' => $deleted ? 'verified' : 'pending'],
            $deleted ? 200 : 202, ['Cache-Control' => 'no-store']);
    }

    private function publicCard(Request $request, string $id): object
    {
        $bucket = 'photo-card:'.hash('sha256', (string) $request->ip());
        abort_if(RateLimiter::tooManyAttempts($bucket, 120), 429);
        RateLimiter::hit($bucket, 60);
        $share = DB::table('encrypted_shares')->find($id);
        abort_unless($share, 404);
        $this->manifest($share); // legacy IDs can never be promoted
        $photo = DB::table('encrypted_photos')->find($share->photo_id);
        abort_if(! $photo || $share->revoked_at || $photo->state !== 'active' ||
            min((int) $share->expires_at, (int) $photo->expires_at) <= Retention::milliseconds(), 410);
        try {
            $grant = $this->workspace->grant($share->creator_id, $photo);
            $actual = $this->objects->serialize($share->creator_id, $photo)['access'];
        } catch (HttpException) {
            abort(410);
        }
        abort_unless($grant['shareExternal'] && $actual['shareExternal'] && $actual['read'], 410);

        return $share;
    }

    public function show(Request $request, string $id)
    {
        $share = $this->publicCard($request, $id);

        return response()->json($this->manifest($share), 200,
            ['Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer']);
    }

    public function content(Request $request, string $id)
    {
        $share = $this->publicCard($request, $id);
        $object = DB::table('encrypted_objects')->find($share->object_id);
        abort_unless($object && $object->kind === 'share-export' && $object->bytes > 16, 410);
        try {
            $stream = Storage::disk(config('prototype.disk'))->readStream($object->object_key);
        } catch (\Throwable) {
            abort(503);
        }
        abort_unless(is_resource($stream), 503);

        return response()->stream(function () use ($stream) {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, 200, ['Content-Type' => 'application/octet-stream',
            'Content-Length' => (string) $object->bytes,
            'Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer']);
    }
}
