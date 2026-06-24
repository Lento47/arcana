export type SqlDialect = "postgres" | "mysql" | "sqlite" | "mssql" | "generic"

export type SqlOptimizationInput = {
  request?: string
  query?: string
  dialect?: SqlDialect
  schemaSummary?: string
}

export type SqlOptimizationFinding = {
  severity: "info" | "warning"
  category: "index" | "query_shape" | "schema" | "pagination" | "observability" | "safety"
  message: string
  suggestion: string
}

export type SqlOptimizationPlan = {
  dialect: SqlDialect
  intent: "read_query" | "write_query" | "schema_design" | "performance_review" | "unknown"
  findings: SqlOptimizationFinding[]
  recommendedNextSteps: string[]
}

function detectIntent(text: string): SqlOptimizationPlan["intent"] {
  if (/\b(insert|update|delete|upsert|merge)\b/i.test(text)) return "write_query"
  if (/\b(create table|alter table|migration|schema|foreign key)\b/i.test(text)) return "schema_design"
  if (/\b(slow|optimi[sz]e|index|explain|analyze|latency|performance)\b/i.test(text)) return "performance_review"
  if (/\b(select|join|where|order by|group by)\b/i.test(text)) return "read_query"
  return "unknown"
}

function finding(
  severity: SqlOptimizationFinding["severity"],
  category: SqlOptimizationFinding["category"],
  message: string,
  suggestion: string,
): SqlOptimizationFinding {
  return { severity, category, message, suggestion }
}

export function analyzeSqlOptimization(input: SqlOptimizationInput): SqlOptimizationPlan {
  const dialect = input.dialect ?? "generic"
  const text = [input.request, input.query, input.schemaSummary].filter(Boolean).join("\n")
  const query = input.query ?? ""
  const findings: SqlOptimizationFinding[] = []
  const intent = detectIntent(text)

  if (/select\s+\*/i.test(query)) {
    findings.push(finding("warning", "query_shape", "Query selects every column.", "Select only the columns required by the caller to reduce IO, memory, and network cost."))
  }
  if (/like\s+['"]%/i.test(query)) {
    findings.push(finding("warning", "index", "Leading-wildcard LIKE can bypass normal b-tree index usage.", "Consider full-text search, trigram indexes, generated search columns, or suffix-specific indexing depending on dialect."))
  }
  if (/order\s+by/i.test(query) && !/limit\s+\d+/i.test(query)) {
    findings.push(finding("warning", "pagination", "ORDER BY without LIMIT can force large sorts.", "Add keyset pagination or a LIMIT when rendering user-facing lists."))
  }
  if (/join/i.test(query) && !/\bon\b/i.test(query)) {
    findings.push(finding("warning", "query_shape", "JOIN appears without an ON predicate.", "Verify this is intentional; otherwise add explicit join predicates to avoid accidental cartesian products."))
  }
  if (/where/i.test(query)) {
    findings.push(finding("info", "index", "Query filters rows with WHERE.", "Check whether the filtered columns have selective indexes and confirm with EXPLAIN/ANALYZE."))
  }
  if (/group\s+by/i.test(query)) {
    findings.push(finding("info", "query_shape", "Query aggregates rows.", "Consider pre-aggregation, covering indexes, or materialized views for high-frequency analytics."))
  }
  if (/offset\s+\d+/i.test(query)) {
    findings.push(finding("warning", "pagination", "OFFSET pagination can become slower as pages grow.", "Prefer keyset pagination using a stable cursor such as created_at/id."))
  }
  if (/delete\s+from/i.test(query) && !/where/i.test(query)) {
    findings.push(finding("warning", "safety", "DELETE query has no WHERE clause.", "Require explicit confirmation or add a predicate before execution."))
  }
  if (/update\s+\w+/i.test(query) && !/where/i.test(query)) {
    findings.push(finding("warning", "safety", "UPDATE query has no WHERE clause.", "Require explicit confirmation or add a predicate before execution."))
  }
  if (input.schemaSummary && !/index|primary key|foreign key|unique/i.test(input.schemaSummary)) {
    findings.push(finding("info", "schema", "Schema summary does not mention keys or indexes.", "Collect primary keys, foreign keys, unique constraints, and existing indexes before recommending migrations."))
  }

  if (!findings.length) {
    findings.push(finding("info", "observability", "No obvious SQL anti-patterns detected from the request.", "Run EXPLAIN/ANALYZE and capture row counts, timing, index usage, and query plan before changing schema."))
  }

  const recommendedNextSteps = [
    "Ask for dialect, schema, table sizes, existing indexes, and EXPLAIN/ANALYZE output when missing.",
    "Prefer query rewrites before adding indexes; add indexes only when supported by observed plans.",
    "Measure before and after with the same representative parameters.",
  ]

  if (dialect === "postgres") recommendedNextSteps.push("For Postgres, inspect pg_stat_statements and consider partial, composite, covering, GIN, or trigram indexes where appropriate.")
  if (dialect === "sqlite") recommendedNextSteps.push("For SQLite, use EXPLAIN QUERY PLAN and keep indexes minimal to avoid write amplification.")

  return { dialect, intent, findings, recommendedNextSteps }
}
