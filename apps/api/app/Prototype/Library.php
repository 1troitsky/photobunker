<?php

namespace App\Prototype;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

final class Library
{
    public static function lock(string $id): void
    {
        DB::table('prototype_libraries')->where('id', $id)->lockForUpdate()->firstOrFail();
    }

    public static function photos(string $library): Builder
    {
        return DB::table('prototype_photos')->where('library_id', $library);
    }

    public static function serialize(object $photo): array
    {
        return array_filter([
            'id' => $photo->id, 'createdAt' => (int) $photo->captured_at,
            'width' => (int) $photo->width, 'height' => (int) $photo->height,
            'bytes' => (int) $photo->bytes, 'mime' => $photo->mime, 'method' => $photo->method,
            'title' => $photo->title, 'note' => $photo->note, 'favorite' => (bool) $photo->favorite,
            'remoteRevision' => (int) $photo->revision, 'remoteLibraryId' => $photo->library_id,
            'profile' => $photo->profile_snapshot ? json_decode($photo->profile_snapshot, true) : null,
            'shortId' => $photo->short_id, 'category' => $photo->category, 'shot' => $photo->shot,
            'metadata' => $photo->metadata ? (object) json_decode($photo->metadata, true) : null,
        ], fn ($value) => $value !== null);
    }

    // Access is revoked by a committed tombstone before physical deletion starts.
    public static function cleanup(string $library, string $id): bool
    {
        return DB::transaction(function () use ($library, $id): bool {
            self::lock($library);
            $photo = self::photos($library)->where('id', $id)->first();
            if (! $photo || $photo->state !== 'deleted') {
                return false;
            }
            try {
                $disk = Storage::disk(config('prototype.disk'));
                foreach ([$photo->original_key, $photo->thumbnail_key] as $key) {
                    if (! $disk->delete($key) || $disk->exists($key)) {
                        return false;
                    }
                }
                self::photos($library)->where('id', $id)->update(['delete_verified_at' => now()]);

                return true;
            } catch (Throwable) {
                return false;
            }
        });
    }
}
