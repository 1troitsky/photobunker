<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('photobunker:prototype-cleanup')->everyMinute()->withoutOverlapping();
