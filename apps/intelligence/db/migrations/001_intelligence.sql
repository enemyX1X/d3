CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sources (
  source_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  domain text NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('GOVERNMENT', 'CORPORATE', 'PUBLIC', 'NEWS', 'OTHER')),
  authority_level text NOT NULL CHECK (authority_level IN ('PRIMARY', 'OFFICIAL', 'REGULATORY', 'SECONDARY', 'NEWS', 'COMMUNITY', 'UNKNOWN')),
  authority_score real NOT NULL DEFAULT 0.2 CHECK (authority_score >= 0 AND authority_score <= 1),
  jurisdiction text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en',
  crawl_frequency_seconds integer NOT NULL DEFAULT 21600 CHECK (crawl_frequency_seconds >= 300),
  robots_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (robots_status IN ('UNKNOWN', 'ALLOWED', 'PARTIAL', 'BLOCKED', 'ERROR')),
  active boolean NOT NULL DEFAULT true,
  last_crawled timestamptz,
  last_changed timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sources_due_idx ON sources (active, last_crawled);
CREATE INDEX IF NOT EXISTS sources_domain_idx ON sources (domain);

CREATE TABLE IF NOT EXISTS crawl_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
  attempts integer NOT NULL DEFAULT 0,
  http_status integer,
  error_code text,
  error_message text NOT NULL DEFAULT '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crawl_jobs_source_created_idx ON crawl_jobs (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crawl_jobs_status_idx ON crawl_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  canonical_url text NOT NULL,
  title text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'text/html',
  current_version_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, canonical_url)
);
CREATE INDEX IF NOT EXISTS documents_source_idx ON documents (source_id);
CREATE INDEX IF NOT EXISTS documents_url_idx ON documents (canonical_url);

CREATE TABLE IF NOT EXISTS document_versions (
  version_id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content_hash char(64) NOT NULL,
  normalized_text text NOT NULL,
  structure jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  effective_from date,
  effective_until date,
  etag text,
  last_modified text,
  UNIQUE (document_id, version_number),
  UNIQUE (document_id, content_hash)
);
CREATE INDEX IF NOT EXISTS document_versions_hash_idx ON document_versions (content_hash);
CREATE INDEX IF NOT EXISTS document_versions_retrieved_idx ON document_versions (retrieved_at DESC);
CREATE INDEX IF NOT EXISTS document_versions_effective_idx ON document_versions (effective_from, effective_until);
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_current_version_fk;
ALTER TABLE documents ADD CONSTRAINT documents_current_version_fk FOREIGN KEY (current_version_id) REFERENCES document_versions(version_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS document_chunks (
  chunk_id bigserial PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES document_versions(version_id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  embedding_model text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (version_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS document_chunks_version_idx ON document_chunks (version_id, chunk_index);
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS changes (
  change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  previous_version_id bigint REFERENCES document_versions(version_id) ON DELETE SET NULL,
  current_version_id bigint NOT NULL REFERENCES document_versions(version_id) ON DELETE CASCADE,
  change_types text[] NOT NULL DEFAULT '{}',
  summary text NOT NULL,
  added_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  significance text NOT NULL DEFAULT 'UNASSESSED' CHECK (significance IN ('UNASSESSED', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence real NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (previous_version_id, current_version_id)
);
CREATE INDEX IF NOT EXISTS changes_source_detected_idx ON changes (source_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS changes_type_detected_idx ON changes USING gin (change_types);
CREATE INDEX IF NOT EXISTS changes_significance_idx ON changes (significance, detected_at DESC);
