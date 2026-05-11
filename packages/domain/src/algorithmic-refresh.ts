/**
 * Algorithmic List Refresh Job
 *
 * Evaluates all registered algorithmic queries and materializes results
 * into shelves. Designed to run once daily (cron or scheduled worker).
 *
 * The job is a pure orchestrator — it reads from the query registry,
 * delegates evaluation to a `QueryEvaluator` port, and writes results
 * back to the shelf repository.
 */

import type { EntityId } from "./types";
import type {
  AlgorithmicQueryDefinition,
  AlgorithmicQueryResult,
  AlgorithmicQueryType,
  QueryParams,
} from "./algorithmic-list";
import {
  ALGORITHMIC_AUTHOR_LABEL,
  ALGORITHMIC_QUERY_REGISTRY,
  resolveParams,
} from "./algorithmic-list";

// ---------------------------------------------------------------------------
// Port: QueryEvaluator
// ---------------------------------------------------------------------------

/**
 * Port that the refresh job uses to evaluate a single query against real data.
 * The concrete implementation lives in the infrastructure layer (packages/db or apps/api).
 */
export interface QueryEvaluator {
  evaluate(
    definition: AlgorithmicQueryDefinition,
    params: Required<QueryParams>,
  ): Promise<AlgorithmicQueryResult>;
}

// ---------------------------------------------------------------------------
// Port: AlgorithmicShelfWriter
// ---------------------------------------------------------------------------

/**
 * Port for materializing query results into shelf storage.
 * Abstracts shelf creation/update so the job stays infra-agnostic.
 */
export interface AlgorithmicShelfWriter {
  /**
   * Upsert an algorithmic shelf: create if it doesn't exist for the
   * given (queryType, userId) pair, or replace its items.
   */
  upsert(input: {
    queryType: AlgorithmicQueryType;
    title: string;
    description: string;
    authorLabel: string;
    userId: EntityId | null;
    bookIds: EntityId[];
    generatedAt: Date;
  }): Promise<{ shelfId: EntityId }>;
}

// ---------------------------------------------------------------------------
// Refresh Job
// ---------------------------------------------------------------------------

export interface RefreshJobResult {
  queriesEvaluated: number;
  shelvesUpdated: number;
  errors: Array<{ queryType: AlgorithmicQueryType; error: string }>;
  completedAt: Date;
}

export interface RefreshJobOptions {
  /** Specific query types to refresh (defaults to all) */
  queryTypes?: AlgorithmicQueryType[];
  /** User IDs for per-user queries (empty = skip per-user queries) */
  userIds?: EntityId[];
  /** Override params per query type */
  paramOverrides?: Partial<Record<AlgorithmicQueryType, QueryParams>>;
}

/**
 * Run the daily algorithmic list refresh job.
 *
 * For global queries: evaluates once and upserts the shelf.
 * For per-user queries: evaluates once per userId provided.
 */
export async function runRefreshJob(
  evaluator: QueryEvaluator,
  writer: AlgorithmicShelfWriter,
  options: RefreshJobOptions = {},
): Promise<RefreshJobResult> {
  const queryTypes = options.queryTypes ?? ALGORITHMIC_QUERY_REGISTRY.map((q) => q.type);
  const userIds = options.userIds ?? [];

  let queriesEvaluated = 0;
  let shelvesUpdated = 0;
  const errors: RefreshJobResult["errors"] = [];

  const definitions = ALGORITHMIC_QUERY_REGISTRY.filter((q) =>
    queryTypes.includes(q.type),
  );

  for (const definition of definitions) {
    const overrides = options.paramOverrides?.[definition.type];

    if (definition.scope === "global") {
      try {
        const params = resolveParams(definition, overrides);
        const result = await evaluator.evaluate(definition, params);
        queriesEvaluated++;

        await writer.upsert({
          queryType: definition.type,
          title: definition.title,
          description: definition.description,
          authorLabel: ALGORITHMIC_AUTHOR_LABEL,
          userId: null,
          bookIds: result.bookIds,
          generatedAt: result.generatedAt,
        });
        shelvesUpdated++;
      } catch (err) {
        errors.push({
          queryType: definition.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      // per_user queries: evaluate for each user
      for (const userId of userIds) {
        try {
          const params = resolveParams(definition, {
            ...overrides,
            userId,
          });
          const result = await evaluator.evaluate(definition, params);
          queriesEvaluated++;

          await writer.upsert({
            queryType: definition.type,
            title: definition.title,
            description: definition.description,
            authorLabel: ALGORITHMIC_AUTHOR_LABEL,
            userId,
            bookIds: result.bookIds,
            generatedAt: result.generatedAt,
          });
          shelvesUpdated++;
        } catch (err) {
          errors.push({
            queryType: definition.type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return {
    queriesEvaluated,
    shelvesUpdated,
    errors,
    completedAt: new Date(),
  };
}
