<?php

declare(strict_types=1);

namespace VDM\Plugin\Console\JoomlaMcp\Domain;

/** Central denylist for fields that must never appear in companion read output. */
final class ReadOutputPolicy
{
    private const SENSITIVE_FIELDS = ['ip_address', 'token'];

    public static function isSensitiveField(string $field): bool
    {
        return in_array(strtolower($field), self::SENSITIVE_FIELDS, true);
    }
}
