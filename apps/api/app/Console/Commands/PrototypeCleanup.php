<?php

namespace App\Console\Commands;

use App\Prototype\Library;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class PrototypeCleanup extends Command
{
    protected $signature = 'photobunker:prototype-cleanup';

    protected $description = 'Retry local prototype deletions and expire abandoned upload reservations';

    public function handle(): int
    {
        if (! app()->environment('local', 'testing') || ! config('prototype.enabled')) {
            return self::SUCCESS;
        }
        DB::table('prototype_photos')->where('state', 'pending')->where('created_at', '<=', now()->subHour())->get()->each(function ($photo): void {
            DB::transaction(function () use ($photo): void {
                Library::lock($photo->library_id);
                Library::photos($photo->library_id)->where('id', $photo->id)->where('state', 'pending')->update(['state' => 'deleted']);
            });
        });
        DB::table('prototype_photos')->where('state', 'deleted')->whereNull('delete_verified_at')->get()->each(function ($photo): void {
            Library::cleanup($photo->library_id, $photo->id);
        });

        return self::SUCCESS;
    }
}
