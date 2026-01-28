/**
 * Test Ingestion Module
 *
 * Tools for ingesting existing Vitest tests into the framework.
 */

export { parseVitestFile, type ParsedTest, type ParseResult } from './vitest-parser';
export { ingestTests, ingestAndRun, type IngestOptions, type IngestResult } from './ingest';
