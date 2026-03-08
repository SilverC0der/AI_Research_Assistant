"""
Prompt builder for the LLM instructions and metadata from the user query

Converts a list of structured paper metadata from the ExtractionService into system prompt (instructions for LLM to output the response) and user message

The models is instructed to:
   - Write a synthesized summary of the papers.
   - Use inline[N] citations markers tied to the numbered reference list.
   - Format each reference in Harvard style.
   - Use ONLY the metadata provided. No fabrication.

Harvard citation format reference:
  Author(s) (Year) Title. Source. DOI.
"""

from typing import List, Dict

system_prompt = """You are an academic research assistant. Summarise each paper individually using only the provided metadata. No fabrication.
For each paper output:
Paper [N]: Title
Authors | Year | Source | DOI
Summary: 80-100 words on the problem, method, and findings.
After all papers, output:
References
[N] Surname, I. (Year) 'Title'. Source. doi: DOI. Up to three authors, then et al.
Rules: Plain text only. No markdown. Each paper separate. Use exact numbering. Omit missing fields."""
# ---------------------------------------------------------------------------
# User message builder — assembles the numbered paper block for each request.
# ---------------------------------------------------------------------------


def build_user_message(papers: List[Dict], query: str) -> str:
    """
    Build the user-turn message from extracted paper metadata.

    Args:
        papers: List of dicts produced by ExtractionService.extract_metadata().
                Expected keys: title, authors, abstract, publication_year,
                doi, source, cited_by_count, concepts.
        query:  The original search query. Provides context for the synthesis.

    Returns:
        A formatted string listing all papers with their metadata, ready
        to be sent as the user message to the LLM.
    """
    if not papers:
        return "No papers were found for this query."

    lines = [
        f'Query: "{query}"',
        "Summarize each paper individually:",
        "",
    ]

    for idx, paper in enumerate(papers, start=1):
        lines.append(f"Paper {idx}: {paper.get('title') or 'N/A'}")
        
        authors = paper.get("authors", [])
        if authors:
            author_strings = _format_author_list(authors)
            lines.append(f"Authors: {author_strings}")

        year = paper.get('publication_year')
        if year:
            lines.append(f"Year: {year}")

        source = paper.get('source')
        if source and source != 'N/A':
            lines.append(f"Source: {source}")

        doi = paper.get('doi')
        if doi and doi != 'N/A':
            lines.append(f"DOI: {doi}")

        # Only include abstract if it's substantial (reduce tokens)
        abstract = paper.get("abstract", "").strip()
        if abstract and len(abstract) > 100:
            lines.append(f"Abstract: {abstract[:200]}...")  # Truncate long abstracts

        lines.append("")

    return "\n".join(lines)


def _format_author_list(authors: List[Dict]) -> str:
    """
    Convert author dicts to a comma-separated display string.

    Each author dict has keys: name, orcid, institutions.
    Only the name field is used here; the LLM handles Harvard formatting.
    """
    names = [a.get("name", "").strip() for a in authors if a.get("name")]
    if not names:
        return ""
    return "; ".join(names)
