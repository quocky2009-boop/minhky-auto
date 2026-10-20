<?php
declare(strict_types=1);

function connect_db(array $c): PDO
{
    $driver = $c['db_driver'] ?? 'mysql';
    if ($driver === 'sqlite') {
        $pdo = new PDO('sqlite:' . $c['db_path']);
        $pdo->exec('PRAGMA foreign_keys = ON');
    } else {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $c['db_host'] ?? 'localhost',
            (int) ($c['db_port'] ?? 3306),
            $c['db_name'] ?? ''
        );
        $pdo = new PDO($dsn, (string) ($c['db_user'] ?? ''), (string) ($c['db_pass'] ?? ''));
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    return $pdo;
}

function db(): PDO
{
    static $pdo = null;
    global $CONFIG;
    return $pdo ??= connect_db($CONFIG);
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function q_all(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function q_one(string $sql, array $params = []): ?array
{
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function q_val(string $sql, array $params = []): mixed
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

function create_schema(PDO $pdo, string $driver): void
{
    $mysql = $driver !== 'sqlite';
    $pk = $mysql ? 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $long = $mysql ? 'MEDIUMTEXT' : 'TEXT';
    $tail = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';

    $statements = [
        "CREATE TABLE IF NOT EXISTS users (
            id $pk,
            username VARCHAR(50) NOT NULL UNIQUE,
            full_name VARCHAR(120) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'staff',
            active TINYINT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS posts (
            id $pk,
            type VARCHAR(20) NOT NULL DEFAULT 'news',
            title VARCHAR(255) NOT NULL,
            slug VARCHAR(160) NOT NULL UNIQUE,
            excerpt VARCHAR(500) NOT NULL DEFAULT '',
            content $long NOT NULL,
            cover VARCHAR(255) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            author_id INT NOT NULL,
            rescue_location VARCHAR(255) NOT NULL DEFAULT '',
            rescue_vehicle VARCHAR(255) NOT NULL DEFAULT '',
            rescue_service VARCHAR(255) NOT NULL DEFAULT '',
            rescue_date DATE NULL,
            published_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )$tail",
        'CREATE INDEX idx_posts_list ON posts (type, status, published_at)',
        "CREATE TABLE IF NOT EXISTS settings (
            skey VARCHAR(100) NOT NULL PRIMARY KEY,
            svalue $long NOT NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS callbacks (
            id $pk,
            name VARCHAR(120) NOT NULL DEFAULT '',
            phone VARCHAR(20) NOT NULL,
            note VARCHAR(500) NOT NULL DEFAULT '',
            status VARCHAR(10) NOT NULL DEFAULT 'new',
            ip VARCHAR(45) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL
        )$tail",
        'CREATE INDEX idx_callbacks_ip ON callbacks (ip, created_at)',
        "CREATE TABLE IF NOT EXISTS login_attempts (
            id $pk,
            ip VARCHAR(45) NOT NULL,
            created_at DATETIME NOT NULL
        )$tail",
        'CREATE INDEX idx_login_ip ON login_attempts (ip, created_at)',
    ];

    foreach ($statements as $sql) {
        try {
            $pdo->exec($sql);
        } catch (PDOException $ex) {
            // CREATE INDEX không có IF NOT EXISTS trên MySQL: bỏ qua khi chạy lại.
            if (!str_starts_with($sql, 'CREATE INDEX')) {
                throw $ex;
            }
        }
    }
}
