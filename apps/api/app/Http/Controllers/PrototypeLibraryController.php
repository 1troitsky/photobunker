<?php

namespace App\Http\Controllers;

use App\Http\ApiResponse;
use App\Prototype\Library;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Throwable;

final class PrototypeLibraryController extends Controller
{
    public function create()
    {
        $token = bin2hex(random_bytes(32));
        $id = (string) Str::uuid();
        DB::table('prototype_libraries')->insert([
            'id' => $id, 'token_hash' => hash('sha256', $token), 'created_at' => now(),
        ]);

        return response()->json(['accessCode' => $token, 'libraryId' => $id], 201);
    }

    public function index(Request $request)
    {
        $library = $request->attributes->get('prototype_library');
        $rows = Library::photos($library)->get();

        return response()->json([
            'photos' => $rows->where('state', 'active')->sortByDesc('captured_at')->map(Library::serialize(...))->values(),
            'deleted' => $rows->where('state', 'deleted')->pluck('id')->merge(DB::table('prototype_deletions')->where('library_id', $library)->pluck('id'))->unique()->values(),
            'libraryId' => $library,
        ]);
    }

    public function upload(Request $request)
    {
        $request->validate(['manifest' => 'required|string|max:12000', 'original' => 'required|file|max:65536', 'thumbnail' => 'required|file|max:2048']);
        $manifest = json_decode($request->input('manifest'), true);
        abort_unless(is_array($manifest), 422);
        $data = Validator::make($manifest, [
            'id' => 'required|uuid', 'createdAt' => 'required|integer|min:0|max:9007199254740991',
            'width' => 'required|integer|min:1|max:32768', 'height' => 'required|integer|min:1|max:32768',
            'mime' => ['required', Rule::in(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'])],
            'method' => ['required', Rule::in(['demo', 'image-capture', 'video-frame'])],
            'title' => 'present|nullable|string|max:120', 'note' => 'present|nullable|string|max:2000', 'favorite' => 'required|boolean',
        ])->validate();
        $original = $request->file('original');
        $thumbnail = $request->file('thumbnail');
        abort_unless($original->getSize() > 0 && $thumbnail->getSize() > 0, 422);
        $fingerprint = hash('sha256', json_encode([
            hash_file('sha256', $original->getRealPath()), hash_file('sha256', $thumbnail->getRealPath()),
            $data['createdAt'], $data['width'], $data['height'], $data['mime'], $data['method'],
        ]));
        $library = $request->attributes->get('prototype_library');
        // Commit a reservation before any S3 I/O; crashes leave discoverable keys.
        DB::transaction(function () use ($library, $data, $original, $thumbnail, $fingerprint): void {
            Library::lock($library);
            abort_if(DB::table('prototype_deletions')->where('library_id', $library)->where('id', $data['id'])->exists(), 410);
            $existing = Library::photos($library)->where('id', $data['id'])->first();
            if ($existing) {
                abort_if($existing->state === 'deleted', 410);
                abort_unless(hash_equals($existing->fingerprint, $fingerprint), 409);

                return;
            }
            $reserved = Library::photos($library)->whereIn('state', ['active', 'pending']);
            abort_if($reserved->count() >= config('prototype.max_photos') || $reserved->sum(DB::raw('bytes + thumbnail_bytes')) + $original->getSize() + $thumbnail->getSize() > config('prototype.max_bytes'), 413);
            $prefix = 'prototype/'.Str::uuid();
            Library::photos($library)->insert([
                'library_id' => $library, 'id' => $data['id'], 'state' => 'pending',
                'original_key' => $prefix.'/original', 'thumbnail_key' => $prefix.'/thumbnail',
                'fingerprint' => $fingerprint, 'bytes' => $original->getSize(), 'thumbnail_bytes' => $thumbnail->getSize(),
                'captured_at' => $data['createdAt'], 'width' => $data['width'], 'height' => $data['height'],
                'mime' => $data['mime'], 'method' => $data['method'], 'title' => $data['title'] ?? '',
                'note' => $data['note'] ?? '', 'favorite' => $data['favorite'], 'revision' => 1, 'created_at' => now(),
            ]);
        });
        $photo = DB::transaction(function () use ($library, $data, $original, $thumbnail) {
            Library::lock($library);
            $row = Library::photos($library)->where('id', $data['id'])->firstOrFail();
            abort_if($row->state === 'deleted', 410);
            if ($row->state === 'active') {
                return $row;
            }
            try {
                $disk = Storage::disk(config('prototype.disk'));
                foreach ([[$row->original_key, $original, $row->bytes], [$row->thumbnail_key, $thumbnail, $row->thumbnail_bytes]] as [$key, $file, $bytes]) {
                    $stream = fopen($file->getRealPath(), 'rb');
                    try {
                        if (! $disk->put($key, $stream) || $disk->size($key) !== (int) $bytes) {
                            return null;
                        }
                    } finally {
                        if (is_resource($stream)) {
                            fclose($stream);
                        }
                    }
                }
            } catch (Throwable) {
                return null;
            }
            Library::photos($library)->where('id', $row->id)->update(['state' => 'active']);

            return $row;
        });

        return $photo ? response()->json(['photo' => Library::serialize($photo)]) : ApiResponse::error($request, 503);
    }

    public function show(Request $request, string $id)
    {
        return response()->json(['photo' => Library::serialize($this->active($request, $id))]);
    }

    public function content(Request $request, string $id, string $kind)
    {
        abort_unless(in_array($kind, ['original', 'thumbnail'], true), 404);
        $photo = $this->active($request, $id);
        try {
            $stream = Storage::disk(config('prototype.disk'))->readStream($kind === 'original' ? $photo->original_key : $photo->thumbnail_key);
            if (! is_resource($stream)) {
                return ApiResponse::error($request, 503);
            }
        } catch (Throwable) {
            return ApiResponse::error($request, 503);
        }

        return response()->stream(function () use ($stream): void {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, 200, ['Content-Type' => 'application/octet-stream', 'Content-Length' => (string) ($kind === 'original' ? $photo->bytes : $photo->thumbnail_bytes)]);
    }

    public function update(Request $request, string $id)
    {
        $data = $request->validate(['title' => 'present|nullable|string|max:120', 'note' => 'present|nullable|string|max:2000', 'favorite' => 'required|boolean', 'revision' => 'required|integer|min:1']);
        $photo = DB::transaction(function () use ($request, $id, $data) {
            $library = $request->attributes->get('prototype_library');
            Library::lock($library);
            $row = $this->active($request, $id);
            abort_unless((int) $row->revision === (int) $data['revision'], 409);
            Library::photos($library)->where('id', $id)->update([
                'title' => trim($data['title'] ?? ''), 'note' => trim($data['note'] ?? ''),
                'favorite' => $data['favorite'], 'revision' => $row->revision + 1,
            ]);

            return Library::photos($library)->where('id', $id)->firstOrFail();
        });

        return response()->json(['photo' => Library::serialize($photo)]);
    }

    public function delete(Request $request, string $id)
    {
        $library = $request->attributes->get('prototype_library');
        DB::transaction(function () use ($library, $id): void {
            Library::lock($library);
            DB::table('prototype_deletions')->insertOrIgnore(['library_id' => $library, 'id' => $id]);
            Library::photos($library)->where('id', $id)->update(['state' => 'deleted']);
        });
        $verified = ! Library::photos($library)->where('id', $id)->exists() || Library::cleanup($library, $id);

        return response()->json(['deletion' => $verified ? 'verified' : 'pending'], $verified ? 200 : 202);
    }

    private function active(Request $request, string $id): object
    {
        $photo = Library::photos($request->attributes->get('prototype_library'))->where('id', $id)->first();
        abort_unless($photo, 404);
        abort_if($photo->state === 'deleted', 410);
        abort_unless($photo->state === 'active', 404);

        return $photo;
    }
}
