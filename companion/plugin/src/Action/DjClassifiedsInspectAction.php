<?php

declare(strict_types=1);

namespace VDM\Plugin\Console\JoomlaMcp\Action;

use Joomla\Database\DatabaseInterface;
use Throwable;
use VDM\Plugin\Console\JoomlaMcp\Contract\ActionInterface;
use VDM\Plugin\Console\JoomlaMcp\Domain\ActionDescriptor;
use VDM\Plugin\Console\JoomlaMcp\Domain\ActionException;
use VDM\Plugin\Console\JoomlaMcp\Domain\Input;

/**
 * Inspects the live DJ-Classifieds installation and returns a complete,
 * machine-readable reference of its database, on-disk models and views,
 * installed plugins, and the component version.
 *
 * Read-only: no model is loaded, no table is written, and no Joomla command
 * runs. Table names are read back from the database and validated before any
 * follow-up query, so no caller-controlled value ever reaches a query.
 */
final readonly class DjClassifiedsInspectAction implements ActionInterface
{
    private const COMPONENT = 'com_djclassifieds';
    private const TABLE_PREFIX_MARKER = 'djcf_';
    private const MAX_FILE_ENTRIES = 200;
    private const MAX_PLUGINS = 100;

    public function __construct(private object $application)
    {
    }

    public function descriptor(): ActionDescriptor
    {
        return new ActionDescriptor(
            'djclassifieds.inspect',
            'Inspect the live DJ-Classifieds installation and return its complete machine-readable reference.',
            'read',
            [['action' => 'core.manage', 'asset' => self::COMPONENT]],
            [
                'type' => 'object',
                'properties' => [
                    'sampleRows' => ['type' => 'boolean', 'default' => false],
                    'maxTables' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 1000, 'default' => 200],
                    'maxColumns' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 1000, 'default' => 200],
                    'maxSampleRows' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'default' => 5],
                ],
                'additionalProperties' => false,
            ],
            [
                'type' => 'object',
                'required' => ['meta', 'database', 'files', 'plugins'],
                'properties' => [
                    'meta' => ['type' => 'object'],
                    'database' => ['type' => 'object'],
                    'files' => ['type' => 'object'],
                    'plugins' => ['type' => 'array'],
                    'sampleRows' => ['type' => 'object'],
                ],
                'additionalProperties' => false,
            ],
        );
    }

    /**
     * @param array<string, mixed> $input
     *
     * @return array<string, mixed>
     */
    public function execute(array $input): array
    {
        Input::rejectUnknown($input, ['sampleRows', 'maxTables', 'maxColumns', 'maxSampleRows']);
        $wantSampleRows = Input::boolean($input, 'sampleRows', false);
        $maxTables = Input::integer($input, 'maxTables', 200, 1, 1_000);
        $maxColumns = Input::integer($input, 'maxColumns', 200, 1, 1_000);
        $maxSampleRows = Input::integer($input, 'maxSampleRows', 5, 1, 50);

        $db = $this->database();
        $driver = $this->databaseServerType($db);
        $prefix = (string) $db->getPrefix();
        $tables = $this->tables($db, $prefix, $maxTables, $maxColumns, $driver);

        return [
            'meta' => [
                'component' => self::COMPONENT,
                'version' => $this->componentVersion($db),
                'generatedAt' => gmdate('c'),
                'source' => 'live',
            ],
            'database' => [
                'tableCount' => count($tables),
                'tables' => $tables,
            ],
            'files' => $this->files(),
            'plugins' => $this->plugins($db),
            'sampleRows' => $wantSampleRows ? $this->sampleRows($db, $tables, $maxSampleRows) : [],
        ];
    }

    private function database(): DatabaseInterface
    {
        if (!method_exists($this->application, 'getContainer')) {
            throw new ActionException('JOOMLA_RUNTIME_UNAVAILABLE', 'The Joomla application container is unavailable.');
        }

        try {
            $db = $this->application->getContainer()->get(DatabaseInterface::class);
        } catch (ActionException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new ActionException('JOOMLA_RUNTIME_UNAVAILABLE', 'The Joomla database service is unavailable.');
        }

        if (!$db instanceof DatabaseInterface) {
            throw new ActionException('JOOMLA_RUNTIME_UNAVAILABLE', 'The Joomla database service is incompatible.');
        }

        return $db;
    }

    private function databaseServerType(DatabaseInterface $db): string
    {
        try {
            $type = strtolower($db->getServerType());
        } catch (Throwable) {
            $type = '';
        }

        if (!in_array($type, ['mysql', 'postgresql'], true)) {
            throw new ActionException(
                'UNSUPPORTED_DATABASE_DRIVER',
                'DJ-Classifieds inspection supports Joomla MySQL/MariaDB and PostgreSQL database drivers only.',
            );
        }

        return $type;
    }

    private function componentVersion(DatabaseInterface $db): ?string
    {
        $query = 'SELECT manifest_cache FROM #__extensions'
            . ' WHERE type = ' . $db->quote('component')
            . ' AND element = ' . $db->quote(self::COMPONENT)
            . ' LIMIT 1';
        $db->setQuery($query);

        try {
            $manifest = $db->loadResult();
        } catch (Throwable) {
            return null;
        }

        if (!is_string($manifest) || $manifest === '') {
            return null;
        }

        try {
            $data = json_decode($manifest, true, 8, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return null;
        }

        $version = is_array($data) ? ($data['version'] ?? null) : null;

        return is_string($version) && $version !== '' ? $version : null;
    }

    /** @return list<array<string, mixed>> */
    private function tables(DatabaseInterface $db, string $prefix, int $maxTables, int $maxColumns, string $driver): array
    {
        $names = $this->tableNames($db, $prefix, $driver);

        if ($names === []) {
            throw new ActionException('COMPONENT_NOT_FOUND', 'DJ-Classifieds tables were not found on this site.');
        }

        /** @var array<string, true> $known */
        $known = array_fill_keys($names, true);
        /** @var list<array<string, mixed>> $tables */
        $tables = [];

        foreach ($names as $name) {
            if (count($tables) >= $maxTables) {
                break;
            }

            $columns = $this->columns($db, $name, $maxColumns);

            $tables[] = [
                'name' => $name,
                'role' => $this->role($columns),
                'roleNote' => 'inferred from column shape',
                'columns' => $columns,
                'indexes' => $this->indexes($db, $name, $driver),
                'references' => $this->references($known, $prefix, $columns),
            ];
        }

        return $tables;
    }

    /** @return list<string> */
    private function tableNames(DatabaseInterface $db, string $prefix, string $driver): array
    {
        try {
            if ($driver === 'postgresql') {
                $db->setQuery(
                    'SELECT table_name FROM information_schema.tables'
                    . ' WHERE table_schema = current_schema()'
                    . ' AND table_type = ' . $db->quote('BASE TABLE')
                    . ' ORDER BY table_name',
                );
                $rows = $db->loadColumn();
            } else {
                $rows = $db->getTableList();
            }
        } catch (Throwable) {
            throw new ActionException('DATABASE_QUERY_FAILED', 'DJ-Classifieds tables could not be listed.');
        }

        if (!is_array($rows)) {
            throw new ActionException('DATABASE_QUERY_FAILED', 'DJ-Classifieds tables could not be listed.');
        }

        $names = [];
        $tablePrefix = $prefix . self::TABLE_PREFIX_MARKER;

        foreach ($rows as $name) {
            if (
                is_string($name)
                && str_starts_with($name, $tablePrefix)
                && preg_match('/^[A-Za-z0-9_]+$/', $name) === 1
            ) {
                $names[] = $name;
            }
        }

        $names = array_values(array_unique($names));
        sort($names, SORT_STRING);

        return $names;
    }

    /** @return list<array<string, mixed>> */
    private function columns(DatabaseInterface $db, string $name, int $maxColumns): array
    {
        try {
            $rows = $db->getTableColumns($name, false);
        } catch (Throwable) {
            throw new ActionException('DATABASE_QUERY_FAILED', sprintf('Columns for table "%s" could not be read.', $name));
        }

        if (!is_array($rows)) {
            throw new ActionException('DATABASE_QUERY_FAILED', sprintf('Columns for table "%s" could not be read.', $name));
        }

        /** @var list<array<string, mixed>> $columns */
        $columns = [];

        foreach ($rows as $key => $row) {
            if (count($columns) >= $maxColumns) {
                break;
            }

            if (is_object($row)) {
                $row = get_object_vars($row);
            }

            if (!is_array($row)) {
                continue;
            }

            $row = array_change_key_case($row, CASE_LOWER);
            $field = $row['field'] ?? $row['column_name'] ?? (is_string($key) ? $key : null);

            if (!is_string($field) || preg_match('/^[A-Za-z0-9_]+$/', $field) !== 1) {
                continue;
            }

            $columns[] = [
                'name' => $field,
                'type' => is_string($row['type'] ?? null) ? $row['type'] : null,
                'collation' => is_string($row['collation'] ?? null) ? $row['collation'] : null,
                'null' => strtoupper((string) ($row['null'] ?? '')) === 'YES',
                'key' => is_string($row['key'] ?? null) ? $row['key'] : null,
                'default' => !isset($row['default']) ? null : (string) $row['default'],
                'extra' => is_string($row['extra'] ?? null) ? $row['extra'] : null,
            ];
        }

        return $columns;
    }

    /** @return list<array<string, mixed>> */
    private function indexes(DatabaseInterface $db, string $name, string $driver): array
    {
        try {
            if ($driver === 'postgresql') {
                $db->setQuery(
                    'SELECT index_class.relname AS index_name,'
                    . ' index_info.indisunique AS is_unique,'
                    . ' access_method.amname AS index_type,'
                    . ' key_column.ordinality AS seq_in_index,'
                    . ' COALESCE(attribute.attname, pg_catalog.pg_get_indexdef('
                    . 'index_info.indexrelid, key_column.ordinality::integer, true)) AS column_name'
                    . ' FROM pg_catalog.pg_class AS table_class'
                    . ' JOIN pg_catalog.pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace'
                    . ' JOIN pg_catalog.pg_index AS index_info ON index_info.indrelid = table_class.oid'
                    . ' JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_info.indexrelid'
                    . ' JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam'
                    . ' CROSS JOIN LATERAL unnest(index_info.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)'
                    . ' LEFT JOIN pg_catalog.pg_attribute AS attribute'
                    . ' ON attribute.attrelid = table_class.oid AND attribute.attnum = key_column.attnum'
                    . ' WHERE table_schema.nspname = current_schema()'
                    . ' AND table_class.relname = ' . $db->quote($name)
                    . ' ORDER BY index_class.relname, key_column.ordinality',
                );
                $rows = $db->loadAssocList();
            } else {
                $rows = $db->getTableKeys($name);
            }
        } catch (Throwable) {
            throw new ActionException('DATABASE_QUERY_FAILED', sprintf('Indexes for table "%s" could not be read.', $name));
        }

        if (!is_array($rows)) {
            throw new ActionException('DATABASE_QUERY_FAILED', sprintf('Indexes for table "%s" could not be read.', $name));
        }

        /** @var array<string, array<string, mixed>> $grouped */
        $grouped = [];

        foreach ($rows as $row) {
            if (is_object($row)) {
                $row = get_object_vars($row);
            }

            if (!is_array($row)) {
                continue;
            }

            $row = array_change_key_case($row, CASE_LOWER);
            $keyName = $driver === 'postgresql' ? ($row['index_name'] ?? null) : ($row['key_name'] ?? null);
            $columnName = $row['column_name'] ?? null;
            $sequence = (int) ($row['seq_in_index'] ?? 0);

            if (!is_string($keyName) || !is_string($columnName) || $sequence < 1) {
                continue;
            }

            if (!isset($grouped[$keyName])) {
                $grouped[$keyName] = [
                    'name' => $keyName,
                    'unique' => $driver === 'postgresql'
                        ? in_array(strtolower((string) ($row['is_unique'] ?? '')), ['1', 't', 'true', 'yes'], true)
                        : (int) ($row['non_unique'] ?? 1) === 0,
                    'type' => is_string($row['index_type'] ?? null) ? $row['index_type'] : null,
                    'columns' => [],
                ];
            }

            $grouped[$keyName]['columns'][$sequence] = $columnName;
        }

        $indexes = [];

        foreach ($grouped as $index) {
            ksort($index['columns'], SORT_NUMERIC);
            $index['columns'] = array_values($index['columns']);
            $indexes[] = $index;
        }

        usort($indexes, static fn (array $a, array $b): int => strcmp((string) $a['name'], (string) $b['name']));

        return $indexes;
    }

    /**
     * @param array<string, true>    $known
     * @param list<array<string, mixed>> $columns
     *
     * @return list<array<string, mixed>>
     */
    private function references(array $known, string $prefix, array $columns): array
    {
        $references = [];

        foreach ($columns as $column) {
            $columnName = (string) ($column['name'] ?? '');

            if ($columnName === 'id' || preg_match('/^(.+)_id$/', $columnName, $match) !== 1) {
                continue;
            }

            $suffix = $match[1];

            if ($columnName === 'parent_id') {
                $references[] = ['column' => $columnName, 'table' => null, 'columnRef' => 'id', 'self' => true];
                continue;
            }

            if ($columnName === 'user_id') {
                $references[] = ['column' => $columnName, 'table' => $prefix . 'users', 'columnRef' => 'id', 'self' => false];
                continue;
            }

            $target = $suffix === 'cat' ? 'categories' : $suffix;
            $targetTable = $prefix . self::TABLE_PREFIX_MARKER . $target;

            if (isset($known[$targetTable])) {
                $references[] = ['column' => $columnName, 'table' => $targetTable, 'columnRef' => 'id', 'self' => false];
            }
        }

        return $references;
    }

    /**
     * @param list<array<string, mixed>> $columns
     */
    private function role(array $columns): string
    {
        $hasId = false;
        $refCount = 0;

        foreach ($columns as $column) {
            $columnName = (string) ($column['name'] ?? '');

            if ($columnName === 'id') {
                $hasId = true;
            } elseif ($columnName !== 'parent_id' && preg_match('/^.+_id$/', $columnName) === 1) {
                ++$refCount;
            }
        }

        if ($refCount >= 2 || !$hasId) {
            return 'xref';
        }

        return $refCount === 1 ? 'child' : 'core';
    }

    /** @return array<string, mixed> */
    private function files(): array
    {
        $adminRoot = JPATH_ADMINISTRATOR . '/components/' . self::COMPONENT;
        $siteRoot = JPATH_SITE . '/components/' . self::COMPONENT;

        if (!is_dir($adminRoot)) {
            throw new ActionException('COMPONENT_NOT_FOUND', 'DJ-Classifieds is not installed on this site.');
        }

        return [
            'models' => [
                'admin' => $this->phpNames($adminRoot . '/models'),
                'site' => $this->phpNames($siteRoot . '/models'),
            ],
            'views' => [
                'admin' => $this->directoryNames($adminRoot . '/views'),
                'site' => $this->directoryNames($siteRoot . '/views'),
            ],
        ];
    }

    /** @return list<string> */
    private function phpNames(string $directory): array
    {
        if (!is_dir($directory)) {
            return [];
        }

        $files = glob($directory . '/*.php');
        $names = [];

        if (is_array($files)) {
            foreach ($files as $file) {
                $base = basename($file, '.php');

                if ($base !== '' && $base !== 'index.html') {
                    $names[] = $base;
                }
            }
        }

        sort($names, SORT_STRING);

        return array_slice($names, 0, self::MAX_FILE_ENTRIES);
    }

    /** @return list<string> */
    private function directoryNames(string $directory): array
    {
        if (!is_dir($directory)) {
            return [];
        }

        $directories = glob($directory . '/*', GLOB_ONLYDIR);
        $names = [];

        if (is_array($directories)) {
            foreach ($directories as $path) {
                $names[] = basename($path);
            }
        }

        sort($names, SORT_STRING);

        return array_slice($names, 0, self::MAX_FILE_ENTRIES);
    }

    /** @return list<array<string, mixed>> */
    private function plugins(DatabaseInterface $db): array
    {
        $query = 'SELECT extension_id, name, element, folder, state, enabled'
            . ' FROM #__extensions'
            . ' WHERE type = ' . $db->quote('plugin')
            . ' AND (element LIKE ' . $db->quote('djclassifieds%') . ' OR folder = ' . $db->quote('djclassifieds') . ')'
            . ' ORDER BY folder, element'
            . ' LIMIT ' . self::MAX_PLUGINS;
        $db->setQuery($query);

        try {
            $rows = $db->loadAssocList();
        } catch (Throwable) {
            throw new ActionException('DATABASE_QUERY_FAILED', 'DJ-Classifieds plugins could not be listed.');
        }

        if (!is_array($rows)) {
            throw new ActionException('DATABASE_QUERY_FAILED', 'DJ-Classifieds plugins could not be listed.');
        }

        $plugins = [];

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $plugins[] = [
                'extension_id' => isset($row['extension_id']) ? (int) $row['extension_id'] : null,
                'name' => isset($row['name']) ? (string) $row['name'] : null,
                'element' => isset($row['element']) ? (string) $row['element'] : null,
                'folder' => isset($row['folder']) ? (string) $row['folder'] : null,
                'state' => isset($row['state']) ? (int) $row['state'] : null,
                'enabled' => isset($row['enabled']) ? (int) $row['enabled'] : null,
            ];
        }

        return $plugins;
    }

    /**
     * @param list<array<string, mixed>> $tables
     *
     * @return array<string, list<array<string, mixed>>>
     */
    private function sampleRows(DatabaseInterface $db, array $tables, int $maxSampleRows): array
    {
        $samples = [];

        foreach ($tables as $table) {
            $name = (string) ($table['name'] ?? '');

            if ($name === '') {
                continue;
            }

            $db->setQuery('SELECT * FROM ' . $db->quoteName($name) . ' LIMIT ' . $maxSampleRows);

            try {
                $rows = $db->loadAssocList();
            } catch (Throwable) {
                continue;
            }

            if (!is_array($rows)) {
                continue;
            }

            $normalised = [];

            foreach ($rows as $row) {
                if (is_array($row)) {
                    $normalised[] = $this->sanitiseSampleRow($row);
                }
            }

            $samples[$name] = $normalised;
        }

        return $samples;
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function sanitiseSampleRow(array $row): array
    {
        $result = [];

        foreach ($row as $key => $value) {
            if (!is_string($key) || preg_match('/^[A-Za-z0-9_]+$/', $key) !== 1) {
                continue;
            }

            if ($value === null || is_bool($value) || is_int($value) || is_float($value)) {
                $result[$key] = $value;
            } elseif (is_string($value)) {
                $result[$key] = strlen($value) > 2_000 ? null : $value;
            } else {
                $result[$key] = null;
            }
        }

        return $result;
    }
}
