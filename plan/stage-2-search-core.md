# Stage 2: Search Core Implementation

## Goal
Implement basic search functionality with single API integration (arXiv) and result display.

## Deliverables

### 2.1 API Integration Infrastructure
- [ ] Create API route handlers (`/api/search`)
- [ ] Implement arXiv API integration with proper rate limiting
- [ ] Add error handling and timeout management
- [ ] Create result standardization interface

### 2.2 Search API Implementation
- [ ] arXiv API client with 3-second rate limiting
- [ ] Query parsing and sanitization
- [ ] Result mapping to unified format
- [ ] Basic deduplication logic

### 2.3 Frontend Search Interface
- [ ] Search input component with validation
- [ ] Loading states and error handling
- [ ] Basic results display component
- [ ] Pagination implementation

### 2.4 Data Models
- [ ] Define unified search result interface:
  ```typescript
  interface SearchResult {
    id: string;
    title: string;
    authors: string[];
    source: 'arxiv' | 'pubmed' | 'biorxiv' | 'medrxiv';
    date: Date;
    abstract: string;
    url: string;
    doi?: string;
    categories?: string[];
  }
  ```

### 2.5 Basic Caching
- [ ] Implement query caching (15-minute TTL)
- [ ] Cache hit/miss logic
- [ ] Cache invalidation strategy

## Acceptance Criteria

### ✅ Must Pass Before Stage 3
1. **Search functionality works** - user can enter query and get results
2. **arXiv integration works** - returns properly formatted results
3. **Rate limiting respected** - 3-second delay between arXiv requests
4. **Error handling works** - graceful degradation when API fails
5. **Results display properly** - title, authors, date, abstract visible
6. **Pagination works** - can load more results
7. **Basic caching works** - repeat searches return faster

### 🧪 Testing Checklist
- [ ] Search for "machine learning" returns 10+ results
- [ ] Search for non-existent term returns empty results gracefully
- [ ] API rate limiting prevents hammering arXiv
- [ ] Network error displays appropriate message
- [ ] Results show all required fields (title, authors, date, abstract)
- [ ] Clicking result opens original arXiv paper
- [ ] Repeat search within 15 minutes loads from cache
- [ ] Pagination loads additional results

## API Integration Details

### arXiv API Specifications
- **Base URL**: `http://export.arxiv.org/api/query`
- **Rate Limit**: 3 seconds between requests
- **Parameters**:
  - `search_query`: Query string
  - `start`: Pagination offset
  - `max_results`: Results per page (max 50)
- **Response Format**: Atom XML

### Example Query
```
http://export.arxiv.org/api/query?search_query=all:machine%20learning&start=0&max_results=10
```

## Implementation Notes

### API Route Structure
```
/api/search
  - GET: Handle search requests
  - Query params: q, page, source
  - Response: { results, pagination, metadata }
```

### Error Handling Strategy
- Network timeouts: 10 second limit
- API errors: Log and return partial results
- Rate limiting: Queue requests with delays
- Invalid queries: Sanitize and validate input

### Caching Strategy
- Use Supabase for cache storage
- Key format: `search:${hash(query)}`
- Store serialized results with expiration
- Background cache warming for popular queries

## Risk Mitigation
- **arXiv downtime**: Implement circuit breaker pattern
- **Rate limiting**: Add request queue with automatic delays
- **Large result sets**: Implement streaming/chunking
- **XML parsing**: Add robust error handling for malformed responses