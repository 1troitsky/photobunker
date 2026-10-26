<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('photo_card_share_objects', function (Blueprint $table): void {
            $table->uuid('share_id');
            $table->string('kind', 16);
            $table->uuid('object_id')->unique();
            $table->primary(['share_id', 'kind']);
            $table->index('share_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('photo_card_share_objects');
    }
};
