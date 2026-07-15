WITH function_definitions AS (
  SELECT
    'function_definition'::text AS category,
    format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid)
    ) AS identity,
    concat_ws(
      '|',
      pg_get_function_result(procedure.oid),
      language.lanname,
      procedure.prokind,
      procedure.prosecdef,
      procedure.provolatile,
      procedure.proparallel,
      coalesce(procedure.proconfig::text, ''),
      pg_get_functiondef(procedure.oid)
    ) AS payload
  FROM pg_proc AS procedure
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  INNER JOIN pg_language AS language
    ON language.oid = procedure.prolang
  WHERE namespace.nspname IN ('public', 'private')
    AND procedure.prokind IN ('f', 'p')
),
function_acl AS (
  SELECT
    'function_acl'::text AS category,
    format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid)
    ) AS identity,
    concat_ws(
      '|',
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee.rolname
      END,
      acl.privilege_type,
      acl.is_grantable
    ) AS payload
  FROM pg_proc AS procedure
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL aclexplode(
    coalesce(
      procedure.proacl,
      acldefault('f', procedure.proowner)
    )
  ) AS acl
  LEFT JOIN pg_roles AS grantee
    ON grantee.oid = acl.grantee
  WHERE namespace.nspname IN ('public', 'private')
    AND procedure.prokind IN ('f', 'p')
    AND (
      acl.grantee = 0
      OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
    )
),
relation_definitions AS (
  SELECT
    'relation_definition'::text AS category,
    format('%I.%I', namespace.nspname, relation.relname) AS identity,
    concat_ws(
      '|',
      relation.relkind,
      relation.relpersistence,
      relation.relrowsecurity,
      relation.relforcerowsecurity,
      relation.relreplident,
      coalesce(relation.reloptions::text, '')
    ) AS payload
  FROM pg_class AS relation
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND relation.relkind IN ('r', 'p', 'v', 'm')
),
column_definitions AS (
  SELECT
    'column_definition'::text AS category,
    format(
      '%I.%I.%I',
      namespace.nspname,
      relation.relname,
      attribute.attname
    ) AS identity,
    concat_ws(
      '|',
      format_type(attribute.atttypid, attribute.atttypmod),
      attribute.attnotnull,
      attribute.attidentity,
      attribute.attgenerated,
      coalesce(pg_get_expr(default_value.adbin, default_value.adrelid), ''),
      coalesce(collation_row.collname, '')
    ) AS payload
  FROM pg_attribute AS attribute
  INNER JOIN pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  LEFT JOIN pg_collation AS collation_row
    ON collation_row.oid = attribute.attcollation
   AND attribute.attcollation <> 0
  WHERE namespace.nspname IN ('public', 'private')
    AND relation.relkind IN ('r', 'p', 'v', 'm')
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
),
enum_definitions AS (
  SELECT
    'enum_definition'::text AS category,
    format('%I.%I', namespace.nspname, type_row.typname) AS identity,
    string_agg(enum_row.enumlabel, '|' ORDER BY enum_row.enumsortorder) AS payload
  FROM pg_type AS type_row
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = type_row.typnamespace
  INNER JOIN pg_enum AS enum_row
    ON enum_row.enumtypid = type_row.oid
  WHERE namespace.nspname IN ('public', 'private')
  GROUP BY namespace.nspname, type_row.typname
),
constraint_definitions AS (
  SELECT
    'constraint_definition'::text AS category,
    format(
      '%I.%I.%I',
      namespace.nspname,
      relation.relname,
      constraint_row.conname
    ) AS identity,
    concat_ws(
      '|',
      constraint_row.contype,
      constraint_row.condeferrable,
      constraint_row.condeferred,
      constraint_row.convalidated,
      pg_get_constraintdef(constraint_row.oid, true)
    ) AS payload
  FROM pg_constraint AS constraint_row
  INNER JOIN pg_class AS relation
    ON relation.oid = constraint_row.conrelid
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname IN ('public', 'private')
),
index_definitions AS (
  SELECT
    'index_definition'::text AS category,
    format('%I.%I', namespace.nspname, index_relation.relname) AS identity,
    pg_get_indexdef(index_relation.oid) AS payload
  FROM pg_index AS index_row
  INNER JOIN pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  INNER JOIN pg_class AS table_relation
    ON table_relation.oid = index_row.indrelid
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = table_relation.relnamespace
  WHERE namespace.nspname IN ('public', 'private')
),
policy_definitions AS (
  SELECT
    'policy_definition'::text AS category,
    format('%I.%I.%I', schemaname, tablename, policyname) AS identity,
    concat_ws(
      '|',
      permissive,
      roles::text,
      cmd,
      coalesce(qual, ''),
      coalesce(with_check, '')
    ) AS payload
  FROM pg_policies
  WHERE schemaname IN ('public', 'private', 'storage')
),
relation_acl AS (
  SELECT
    'relation_acl'::text AS category,
    format('%I.%I', namespace.nspname, relation.relname) AS identity,
    concat_ws(
      '|',
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee.rolname
      END,
      acl.privilege_type,
      acl.is_grantable
    ) AS payload
  FROM pg_class AS relation
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL aclexplode(
    coalesce(
      relation.relacl,
      acldefault(
        CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
        relation.relowner
      )
    )
  ) AS acl
  LEFT JOIN pg_roles AS grantee
    ON grantee.oid = acl.grantee
  WHERE namespace.nspname IN ('public', 'private')
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
    AND (
      acl.grantee = 0
      OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
    )
),
view_definitions AS (
  SELECT
    'view_definition'::text AS category,
    format('%I.%I', namespace.nspname, relation.relname) AS identity,
    pg_get_viewdef(relation.oid, true) AS payload
  FROM pg_class AS relation
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND relation.relkind IN ('v', 'm')
),
trigger_definitions AS (
  SELECT
    'trigger_definition'::text AS category,
    format(
      '%I.%I.%I',
      namespace.nspname,
      relation.relname,
      trigger_row.tgname
    ) AS identity,
    pg_get_triggerdef(trigger_row.oid, true) AS payload
  FROM pg_trigger AS trigger_row
  INNER JOIN pg_class AS relation
    ON relation.oid = trigger_row.tgrelid
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND NOT trigger_row.tgisinternal
),
relation_comments AS (
  SELECT
    'relation_comment'::text AS category,
    format('%I.%I', namespace.nspname, relation.relname) AS identity,
    obj_description(relation.oid, 'pg_class') AS payload
  FROM pg_class AS relation
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND relation.relkind IN ('r', 'p', 'v', 'm')
    AND obj_description(relation.oid, 'pg_class') IS NOT NULL
),
extension_definitions AS (
  SELECT
    'extension_definition'::text AS category,
    extension.extname AS identity,
    namespace.nspname AS payload
  FROM pg_extension AS extension
  INNER JOIN pg_namespace AS namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname IN ('uuid-ossp', 'vector')
),
storage_bucket_definitions AS (
  SELECT
    'storage_bucket_definition'::text AS category,
    bucket.id AS identity,
    concat_ws(
      '|',
      bucket.name,
      bucket.public,
      coalesce(bucket.file_size_limit::text, ''),
      coalesce(bucket.allowed_mime_types::text, '')
    ) AS payload
  FROM storage.buckets AS bucket
  WHERE bucket.id IN ('audio', 'media')
),
all_definitions AS (
  SELECT * FROM function_definitions
  UNION ALL SELECT * FROM function_acl
  UNION ALL SELECT * FROM relation_definitions
  UNION ALL SELECT * FROM column_definitions
  UNION ALL SELECT * FROM enum_definitions
  UNION ALL SELECT * FROM constraint_definitions
  UNION ALL SELECT * FROM index_definitions
  UNION ALL SELECT * FROM policy_definitions
  UNION ALL SELECT * FROM relation_acl
  UNION ALL SELECT * FROM view_definitions
  UNION ALL SELECT * FROM trigger_definitions
  UNION ALL SELECT * FROM relation_comments
  UNION ALL SELECT * FROM extension_definitions
  UNION ALL SELECT * FROM storage_bucket_definitions
)
SELECT
  category,
  count(*)::integer AS object_count,
  md5(
    string_agg(
      identity || E'\n' || payload,
      E'\n--\n'
      ORDER BY identity, payload
    )
  ) AS fingerprint
FROM all_definitions
GROUP BY category
ORDER BY category;
