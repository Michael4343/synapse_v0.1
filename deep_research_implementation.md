Deep Research Integration Plan                                                                   
                                                                                                   
  - Document Scope                                                                                 
      - Goal: normalise Perplexity deep-research output so compiled lists match existing feed items
  (title, authors, meta line, abstract snippet, primary link).                                     
      - Out of scope: model selection changes, UI redesign, long-term data store schema.           
  - Current Behaviour Recap                                                                        
      - /api/research/compile posts to sonar-deep-research; response begins with <think> reasoning,
  then free-form Markdown.                                                                         
      - response_format is ignored; parser falls back to regex. Titles often miss authors/links;   
  DOIs absent; abstract slot reused for relevance text.                                            
      - UI expects ApiSearchResult with populated title, authors[], year, venue, doi, url,         
  abstract.                                                                                        
  - Implementation Plan                                                                            
      1. Response Handling                                                                         
          - Strip <think>…</think> segment before any parsing; log it separately for debugging.    
          - Capture choices[0].message plus citations/documents arrays for supplemental metadata.  
      2. Two-Step Formatting                                                                       
          - Step 1: run deep-research call as-is.                                                  
          - Step 2: send the cleaned answer (no <think>) to a lighter model (sonar-medium or       
  internal formatter) with a strict prompt: output JSON array with fields matching ApiSearchResult.          - Enforce schema in step 2 (OpenAI-style response_format works with sonar-medium).       
      3. Parser Update                                                                             
          - Add parseFormattedResults that accepts the step-2 JSON and maps entries into           
  ApiSearchResult.                                                                                 
          - Preserve fallback regex for disaster recovery, but log when invoked.                   
          - Use helper utilities:                                                                  
              - normaliseTitle, normaliseAuthors, normaliseVenue.                                  
              - pickPrimaryLink (prefers DOI, falls back to URL).                                  
              - truncateRelevanceToAbstract to populate abstract snippet (max 500 chars).          
      4. Error Handling & Telemetry                                                                
          - If step 2 fails (timeout or malformed JSON), fall back to regex but surface warning in 
  logs and API response message.                                                                   
          - Extend debug logs to include step identifiers, elapsed time, and whether fallback      
  triggered.                                                                                       
          - Track metrics: number of formatted entries, missing DOI count, JSON parse success rate.      5. UI Alignment                                                                              
          - Ensure compiled entries supply:                                                        
              - title (string)                                                                     
              - authors (array of strings; populate with ["Unknown"] if empty)                     
              - year (number | null)                                                               
              - venue (string | null)                                                              
              - abstract (short relevance summary)                                                 
              - doi / url (used by existing link helpers)                                          
          - Maintain source: 'perplexity_research' for traceability.                               
      6. Testing Checklist                                                                         
          - Unit tests for formatter prompt response parsing (mocked JSON).                        
          - Integration test hitting mocked Perplexity responses containing <think> blocks and     
  unordered bullet lists.                                                                          
          - Manual QA: trigger compile on known paper, verify UI shows consistent metadata/link.   
  - Risks & Mitigations                                                                            
      - Perplexity rate limits: cache reformatter results or use exponential backoff.              
      - Formatter hallucination: keep schema strict, validate required fields before saving to     
  Supabase.                                                                                        
      - Added latency: measure sequential call time; consider parallelising logging/fallback to    
  keep UX responsive.                                                                              
  - Next Steps                                                                                     
      - Draft formatter prompt and schema.                                                         
      - Prototype the two-step call outside the app (e.g., in debug/perplexity-api-test.js).       
      - Update API route once confidence in formatter output is established.                       
                                                                                                                                                                                                      