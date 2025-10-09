# Deep Research Prompt: Systematic Literature Methodology Comparison

## Primary Objective
Conduct comprehensive research to identify, extract, and compare methodologies across relevant academic literature, presenting findings in a structured comparative table that reveals methodological gaps and variations.

## Research Instructions

### Phase 1: Literature Discovery (5-10 searches)
Given the reference paper: **[INSERT PAPER TITLE/DOI/TOPIC]**

1. **Initial Search**: Search for the exact paper title to understand the core methodology
2. **Related Work Search**: Search for papers cited in the reference paper's methods section
3. **Forward Citation Search**: Search for recent papers citing the reference paper (past 2-3 years)
4. **Methodological Variations**: Search for "[KEY METHOD] + variations" or "alternative approaches to [RESEARCH PROBLEM]"
5. **Comparative Studies**: Search for "comparison + [METHOD NAME]" or "[FIELD] methodology review"
6. **Recent Advances**: Search for "2024 [METHOD/FIELD]" or "recent advances [TOPIC]"

**Target**: Identify 10-20 highly relevant papers with similar research objectives

---

### Phase 2: Methodology Extraction
For each identified paper, extract and fetch the full text to analyze the methods section. Extract the following structured information:

#### Paper Identification
- **Author(s) & Year**
- **Title**
- **DOI/Link**
- **Journal/Conference**

#### Core Methodology Details
1. **Research Design**: (Experimental/Observational/Computational/Mixed)
2. **Sample/Dataset**: 
   - Source
   - Size (n=?)
   - Characteristics
   - Selection criteria
3. **Primary Method(s)**: (Specific techniques, algorithms, protocols)
4. **Key Parameters/Variables**: (Independent, dependent, control variables)
5. **Equipment/Tools/Software**: (Specific instruments, platforms, code libraries)
6. **Procedural Steps**: (Summarize the workflow in 3-5 key steps)
7. **Data Collection Protocol**: (How data was gathered)
8. **Analysis Techniques**: (Statistical methods, computational approaches)
9. **Validation/Quality Control**: (How results were verified)
10. **Limitations Acknowledged**: (What the authors identified as constraints)
11. **Novel Contributions**: (What's methodologically new or different)

---

### Phase 3: Comparative Table Generation

Create a comprehensive comparison table with these columns:

| Paper (Author, Year) | Research Design | Sample/Dataset | Primary Method(s) | Key Parameters | Tools/Software | Validation Approach | Reported Limitations | Novel Aspect |
|---------------------|-----------------|----------------|-------------------|----------------|----------------|---------------------|---------------------|--------------|
| [Fill for each paper] | | | | | | | | |

**Additional Tables** (create separate tables for):
- **Procedural Workflow Comparison**: Step-by-step comparison of each method
- **Parameter Variations**: Specific values, ranges, and settings used across studies
- **Performance Metrics**: Accuracy, precision, reproducibility metrics reported

---

### Phase 4: Gap Analysis

After completing the table, provide:

#### Methodological Gaps Identified
1. **Underexplored Variations**: Parameters or conditions not adequately tested
2. **Missing Comparisons**: Methods that haven't been directly compared
3. **Validation Gaps**: Aspects of validation that are weak or absent
4. **Scale Limitations**: Sample sizes, dataset diversity, or scope limitations
5. **Reproducibility Concerns**: Missing details that would prevent replication
6. **Temporal Gaps**: Outdated methods still in use, or new methods not yet validated
7. **Cross-Study Inconsistencies**: Contradictory approaches or conflicting protocols

#### Recommendations for Future Research
- Priority areas where methodological standardization is needed
- Suggested parameter ranges to explore
- Combinations of methods that should be tested
- Validation approaches that should be adopted

---

### Phase 5: Synthesis Summary

Provide a concise executive summary (250-300 words) that includes:
- Common methodological themes across literature
- Primary points of divergence
- Most significant gaps identified
- Key takeaways for researchers in this field

---

## Output Format Requirements

1. **Begin with**: Brief overview of search strategy and papers found (2-3 sentences)
2. **Main comparative tables**: Well-formatted, scannable tables
3. **Gap analysis section**: Bullet points with clear, specific gaps
4. **End with**: Actionable recommendations

## Quality Standards

- Extract ONLY information explicitly stated in methods sections
- Note when information is missing with "Not reported"
- Cite specific page numbers or sections when possible
- Flag methodological choices that appear questionable or unusual
- Prioritize recent papers (last 5 years) but include seminal older work
- Be precise with numbers, parameters, and technical specifications

---

## Usage Instructions

**To use this prompt:**
1. Replace [INSERT PAPER TITLE/DOI/TOPIC] with your reference paper
2. Provide this full prompt to Claude with web search capabilities
3. Allow 10-20 searches for comprehensive coverage
4. Review the generated tables and refine specific sections if needed

**For best results:**
- Start with a clearly defined reference paper or research question
- Be prepared for 15-20 minutes of deep research processing
- Have access to paper repositories (PubMed, arXiv, Google Scholar, etc.)
- Follow up with specific questions about gaps or comparisons of interest