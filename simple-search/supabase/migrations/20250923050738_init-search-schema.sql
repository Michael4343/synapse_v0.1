-- Database schema for Synapse Academic Research Aggregator
-- Run these commands in your Supabase SQL editor

-- Enable UUID/crypto extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table for storing unique search queries
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(query)
);

-- Table for storing search results from various academic sources
CREATE TABLE search_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    authors JSONB DEFAULT '[]'::jsonb, -- Array of author names
    abstract TEXT,
    year INTEGER,
    venue TEXT, -- Journal/conference name
    citation_count INTEGER DEFAULT 0,
    semantic_scholar_id TEXT UNIQUE, -- Semantic Scholar paper ID
    arxiv_id TEXT, -- arXiv ID if available
    doi TEXT, -- DOI if available
    url TEXT, -- Direct link to paper
    source_api TEXT DEFAULT 'semantic_scholar', -- Which API this came from
    raw_data JSONB, -- Store the original API response for future reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table to link search queries with their results
CREATE TABLE search_result_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_query_id UUID REFERENCES search_queries(id) ON DELETE CASCADE,
    search_result_id UUID REFERENCES search_results(id) ON DELETE CASCADE,
    relevance_score REAL DEFAULT 0, -- For future ranking improvements
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(search_query_id, search_result_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_search_results_semantic_scholar_id ON search_results(semantic_scholar_id);
CREATE INDEX idx_search_results_title ON search_results USING gin(to_tsvector('english', title));
CREATE INDEX idx_search_results_abstract ON search_results USING gin(to_tsvector('english', abstract));
CREATE INDEX idx_search_results_year ON search_results(year);
CREATE INDEX idx_search_results_citation_count ON search_results(citation_count DESC);
CREATE INDEX idx_search_results_created_at ON search_results(created_at DESC);
CREATE INDEX idx_search_queries_query ON search_queries(query);
CREATE INDEX idx_search_queries_created_at ON search_queries(created_at DESC);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at on search_results
CREATE TRIGGER update_search_results_updated_at
    BEFORE UPDATE ON search_results
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - for future user-specific features
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_result_queries ENABLE ROW LEVEL SECURITY;

-- For now, allow public read access to all tables
-- (You can make this more restrictive later when adding user authentication)
CREATE POLICY "Allow public read access on search_queries"
    ON search_queries FOR SELECT
    USING (true);

CREATE POLICY "Allow public insert on search_queries"
    ON search_queries FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public read access on search_results"
    ON search_results FOR SELECT
    USING (true);

CREATE POLICY "Allow public insert on search_results"
    ON search_results FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public access on search_result_queries"
    ON search_result_queries FOR ALL
    USING (true);

-- Sample data for testing (optional)
-- INSERT INTO search_queries (query) VALUES ('machine learning');
-- INSERT INTO search_queries (query) VALUES ('natural language processing');
