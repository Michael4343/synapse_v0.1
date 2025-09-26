# Firecrawl Integration for Full Paper Content

This document details the implementation of the Firecrawl integration to fetch and display the full content of academic papers.

## Feature Overview

The goal of this feature is to provide users with the full text of a paper directly within the application, rather than linking to an external site. This is achieved by using the paper's DOI to construct a URL and then using Firecrawl to scrape the content of that URL.

## Implementation Details

### 1. API Route for Paper Details

- A new API route was created at `src/app/api/papers/[id]/route.ts`.
- This route accepts a paper's ID from our database.
- It queries the `search_results` table in Supabase to retrieve the paper's metadata, including the DOI.
- If a DOI is present, it uses the Firecrawl API to scrape the content from `https://doi.org/{doi}`.
- The route returns a JSON object containing the paper's metadata and the scraped content.

### 2. Paper Details Page

- A new page was created at `src/app/papers/[id]/page.tsx`.
- This page fetches the paper's data from the new `/api/papers/[id]` route.
- It displays the paper's title, authors, abstract, and other metadata.
- It renders the full paper content scraped by Firecrawl.
- A disabled button with the text "Email author for paper" is included for future implementation.

### 3. Search Results Page Update

- The search results page (`src/app/search/page.tsx`) was modified to link to the new paper details page (`/papers/{id}`).

## Environment Variables

This feature requires the `FIRECRAWL_API_KEY` environment variable to be set in your `.env.local` file.

```
FIRECRAWL_API_KEY=YOUR_FIRECRAWL_API_KEY
```
