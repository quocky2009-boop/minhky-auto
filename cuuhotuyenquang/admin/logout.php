<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
logout_user();
redirect(url('admin/login.php'));
