<?php
declare(strict_types=1);

namespace Joomla\Database {
    if (!interface_exists(DatabaseInterface::class)) {
        interface DatabaseInterface
        {
        }
    }
}

namespace {
    use Joomla\Database\DatabaseInterface;
    use VDM\Plugin\Console\JoomlaMcp\Action\DjClassifiedsInspectAction;
    use VDM\Plugin\Console\JoomlaMcp\Domain\ActionException;

    $inspectFixtureRoot = sys_get_temp_dir() . '/joomla-mcp-inspect-' . bin2hex(random_bytes(4));
    $adminComponent = $inspectFixtureRoot . '/administrator/components/com_djclassifieds';
    $siteComponent = $inspectFixtureRoot . '/site/components/com_djclassifieds';
    mkdir($adminComponent . '/models', 0777, true);
    mkdir($adminComponent . '/views', 0777, true);
    mkdir($siteComponent . '/models', 0777, true);
    mkdir($siteComponent . '/views', 0777, true);
    if (!defined('JPATH_ADMINISTRATOR')) {
        define('JPATH_ADMINISTRATOR', $inspectFixtureRoot . '/administrator');
    }
    if (!defined('JPATH_SITE')) {
        define('JPATH_SITE', $inspectFixtureRoot . '/site');
    }
    register_shutdown_function(static function () use ($inspectFixtureRoot): void {
        if (!is_dir($inspectFixtureRoot)) {
            return;
        }
        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($inspectFixtureRoot, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($inspectFixtureRoot);
    });

    final class DjClassifiedsInspectTestDatabase implements DatabaseInterface
    {
        public string $query = '';
        /** @var list<string> */
        public array $queries = [];
        /** @var list<array{0: string, 1: bool}> */
        public array $columnCalls = [];

        public function __construct(private string $serverType = 'postgresql')
        {
        }

        public function getServerType(): string
        {
            return $this->serverType;
        }

        public function getPrefix(): string
        {
            return 'prefix_';
        }

        public function quote(string $value): string
        {
            return "'" . str_replace("'", "''", $value) . "'";
        }

        public function quoteName(string $name): string
        {
            return '"' . $name . '"';
        }

        public function setQuery(string $query): void
        {
            $this->query = $query;
            $this->queries[] = $query;
        }

        /** @return list<string> */
        public function loadColumn(): array
        {
            expect(str_contains($this->query, 'current_schema()'), 'PostgreSQL table listing was not scoped to its current schema.');
            expect(!str_contains($this->query, 'DATABASE()'), 'MySQL DATABASE() leaked into PostgreSQL table listing.');
            return ['prefix_djcf_ads', 'prefix_content', 'other_djcf_ads'];
        }

        public function loadResult(): mixed
        {
            return null;
        }

        /** @return array<string, object> */
        public function getTableColumns(string $table, bool $typeOnly = true): array
        {
            $this->columnCalls[] = [$table, $typeOnly];
            expect($table === 'prefix_djcf_ads' && $typeOnly === false, 'Portable full column metadata was not requested for the validated table.');
            return [
                'id' => (object) [
                    'column_name' => 'id',
                    'type' => 'integer',
                    'null' => 'NO',
                    'Default' => null,
                    'Field' => 'id',
                    'Type' => 'integer',
                    'Null' => 'NO',
                ],
                'category_id' => (object) [
                    'column_name' => 'category_id',
                    'type' => 'integer',
                    'null' => 'YES',
                    'Default' => null,
                    'Field' => 'category_id',
                    'Type' => 'integer',
                    'Null' => 'YES',
                ],
                'title' => (object) [
                    'column_name' => 'title',
                    'type' => 'character varying(255)',
                    'null' => 'YES',
                    'Default' => null,
                    'Field' => 'title',
                    'Type' => 'character varying(255)',
                    'Null' => 'YES',
                ],
            ];
        }

        /** @return list<object> */
        public function getTableKeys(string $table): array
        {
            throw new \RuntimeException('The PostgreSQL path must not use MySQL-shaped Joomla key metadata.');
        }

        /** @return list<string> */
        public function getTableList(): array
        {
            throw new \RuntimeException('The PostgreSQL path must scope tables to current_schema().');
        }

        /** @return list<array<string, mixed>> */
        public function loadAssocList(): array
        {
            if (str_contains($this->query, 'pg_catalog.pg_class AS table_class')) {
                expect(str_contains($this->query, 'pg_catalog.pg_get_indexdef'), 'PostgreSQL index expressions are not represented.');
                expect(str_contains($this->query, 'table_schema.nspname = current_schema()'), 'PostgreSQL indexes were not scoped to the current schema.');
                return [
                    [
                        'index_name' => 'idx_ads_category_title',
                        'is_unique' => false,
                        'index_type' => 'btree',
                        'seq_in_index' => 1,
                        'column_name' => 'category_id',
                    ],
                    [
                        'index_name' => 'idx_ads_category_title',
                        'is_unique' => false,
                        'index_type' => 'btree',
                        'seq_in_index' => 2,
                        'column_name' => 'title',
                    ],
                    [
                        'index_name' => 'pk_ads',
                        'is_unique' => true,
                        'index_type' => 'btree',
                        'seq_in_index' => 1,
                        'column_name' => 'id',
                    ],
                ];
            }

            if (str_starts_with($this->query, 'SELECT * FROM')) {
                return [[
                    'id' => 73,
                    'title' => 'Visible listing',
                    'ip_address' => '203.0.113.17',
                    'token' => 'DJC-INSPECT-TOKEN-SECRET',
                ]];
            }

            expect(str_contains($this->query, 'FROM #__extensions'), 'Unexpected associative query in inspect regression test.');
            return [];
        }
    }

    function inspectTestAction(DjClassifiedsInspectTestDatabase $database): DjClassifiedsInspectAction
    {
        $container = new class ($database) {
            public function __construct(private object $database)
            {
            }

            public function get(string $service): object
            {
                expect($service === DatabaseInterface::class, 'Inspect requested an unexpected Joomla service.');
                return $this->database;
            }
        };
        $application = new class ($container) {
            public function __construct(private object $container)
            {
            }

            public function getContainer(): object
            {
                return $this->container;
            }
        };

        return new DjClassifiedsInspectAction($application);
    }

    test('DJ-Classifieds inspect uses PostgreSQL-compatible, schema-scoped metadata', static function (): void {
        $database = new DjClassifiedsInspectTestDatabase();
        $result = inspectTestAction($database)->execute([]);

        expect($result['database']['tableCount'] === 1, 'PostgreSQL inspection did not filter to the configured DJ-Classifieds table prefix.');
        $table = $result['database']['tables'][0];
        expect($table['name'] === 'prefix_djcf_ads', 'Unexpected PostgreSQL table name.');
        expect($table['columns'][0]['name'] === 'id' && $table['columns'][0]['null'] === false, 'PostgreSQL columns were not normalized from Joomla metadata.');
        expect($table['columns'][1]['name'] === 'category_id' && $table['columns'][1]['null'] === true, 'Nullable PostgreSQL column metadata is incorrect.');
        expect($table['indexes'][0]['name'] === 'idx_ads_category_title', 'PostgreSQL index metadata is missing.');
        expect($table['indexes'][0]['unique'] === false, 'PostgreSQL non-unique index metadata is incorrect.');
        expect($table['indexes'][0]['columns'] === ['category_id', 'title'], 'PostgreSQL compound index columns were not ordered.');
        expect($table['indexes'][1]['name'] === 'pk_ads' && $table['indexes'][1]['unique'] === true, 'PostgreSQL primary index metadata is incorrect.');
        expect($database->columnCalls === [['prefix_djcf_ads', false]], 'PostgreSQL columns did not use Joomla’s portable metadata API.');

        $queries = implode("\n", $database->queries);
        expect(!str_contains($queries, 'DATABASE()'), 'PostgreSQL inspection executed DATABASE().');
        expect(!str_contains($queries, 'SHOW FULL COLUMNS'), 'PostgreSQL inspection executed SHOW FULL COLUMNS.');
        expect(!str_contains($queries, 'SHOW INDEX'), 'PostgreSQL inspection executed SHOW INDEX.');
        expect(str_contains($queries, 'current_schema()'), 'PostgreSQL metadata queries are not current-schema scoped.');
    });

    test('DJ-Classifieds inspect fails closed for an unsupported database driver', static function (): void {
        $database = new DjClassifiedsInspectTestDatabase('sqlite');
        try {
            inspectTestAction($database)->execute([]);
            expect(false, 'Unsupported database driver was accepted.');
        } catch (ActionException $exception) {
            expect($exception->errorCode === 'UNSUPPORTED_DATABASE_DRIVER', 'Unsupported driver produced the wrong error code.');
            expect(str_contains($exception->getMessage(), 'MySQL/MariaDB and PostgreSQL'), 'Unsupported driver error was not user-facing.');
        }

        expect($database->queries === [], 'Unsupported driver reached database metadata queries.');
    });

    test('DJ-Classifieds inspect sample rows redact IP addresses and tokens', static function (): void {
        $result = inspectTestAction(new DjClassifiedsInspectTestDatabase())->execute(['sampleRows' => true]);
        $sample = $result['sampleRows']['prefix_djcf_ads'][0] ?? null;
        $encoded = json_encode($result, JSON_THROW_ON_ERROR);

        expect(is_array($sample), 'DJ-Classifieds inspect did not return its requested sample row.');
        expect(!array_key_exists('ip_address', $sample) && !array_key_exists('token', $sample), 'Sensitive fields escaped the inspect sample row.');
        expect(!str_contains($encoded, '203.0.113.17'), 'An IP address escaped the inspect output.');
        expect(!str_contains($encoded, 'DJC-INSPECT-TOKEN-SECRET'), 'A token escaped the inspect output.');
    });
}
