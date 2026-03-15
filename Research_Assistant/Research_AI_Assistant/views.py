"""
Views for Research AI Assistant API.
Handles OpenAlex paper search with three ranking modes.
"""

import logging
import json
import re

from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django_ratelimit.decorators import ratelimit

from .models import QueryLog
from .services.openalex_service import OpenAlexAPIError, OpenAlexService
from .services.extract_service import ExtractionService
from .services.openrouter_service import OpenRouterAPIError, OpenRouterService
from .services.prompt_builder import system_prompt, build_user_message

logger = logging.getLogger(__name__)

openalex_service = OpenAlexService()


@require_GET
def api_root(request):
    """
    Root endpoint providing API information.

    GET /api/
    """
    return JsonResponse(
        {
            "message": "AI Research Assistant API",
            "version": "1.0",
            "endpoints": {
                "search": "/api/search/?q=<query>&mode=<mode>&per_page=<int>",
                "modes": ["relevance", "open_access", "best_match"],
            },
            "documentation": "https://docs.openalex.org/",
        }
    )


@require_GET
@ratelimit(key="ip", rate="100/s")  # OpenAlex: Max 100 requests per second
def search(request):
    """
    Search academic papers via OpenAlex with ranking modes and pagination.

    GET /api/search/?q=<query>&mode=<mode>&per_page=<int>&page=<int>&cursor=<str>&oa_status=<status>

    Query params:
        q (required): keyword search string
        mode (optional): relevance | open_access | best_match (default: relevance)
        per_page (optional): results per page, 1-50 (default: 25)
        page (optional): page number for basic pagination (default: 1)
        cursor (optional): cursor for advanced pagination (overrides page)
        oa_status (optional): gold | green | hybrid | bronze

    Returns JSON:
    {
        "papers": [...],
        "count": int,
        "total_count": int,
        "per_page": int,
        "page": int,
        "next_cursor": str|null,
        "has_more": bool,
        "mode": str,
        "query": str
    }

    References:
        Django views: https://docs.djangoproject.com/en/6.0/topics/http/views/
        OpenAlex API: https://docs.openalex.org/api-entities/works
    """
    query = request.GET.get("q", "").strip()
    mode = request.GET.get("mode", "open_access").strip()
    per_page_raw = request.GET.get("per_page", "25")
    cursor = request.GET.get("cursor", None)
    oa_status = request.GET.get("oa_status", None)

    # Validate query
    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    # Validate mode
    valid_modes = {"relevance", "open_access", "best_match"}
    if mode not in valid_modes:
        return JsonResponse(
            {
                "error": f"Invalid mode '{mode}'. Must be one of: {', '.join(sorted(valid_modes))}"
            },
            status=400,
        )

    # Validate per_page
    try:
        per_page = int(per_page_raw)
        if per_page < 1 or per_page > 50:
            per_page = 25
    except (ValueError, TypeError):
        per_page = 25

    # Map mode to OpenAlexService parameters
    open_access_only = mode == "open_access"

    logger.info(
        "Search request: query='%s' mode='%s' per_page=%d", query, mode, per_page
    )

    try:
        # Fetch raw works from OpenAlex with pagination
        api_response = openalex_service.search_papers(
            query=query,
            per_page=per_page,
            cursor=cursor,
            open_access_only=open_access_only,
            oa_status=oa_status,
        )
        
        raw_results = api_response.get('results', [])
        meta = api_response.get('meta', {})
        total_count = meta.get('count', len(raw_results))
        next_cursor = meta.get('next_cursor')
        
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except OpenAlexAPIError as exc:
        logger.error("OpenAlex error: %s", exc)
        return JsonResponse({"error": str(exc)}, status=502)

    # Extract structured metadata from raw works
    papers = [ExtractionService.extract_metadata(work) for work in raw_results]

    # Log query — non-blocking
    try:
        QueryLog.objects.create(
            query_text=query,
            ranking_mode=mode,
            result_count=len(papers),
        )
    except Exception:
        logger.warning("Failed to write QueryLog entry.", exc_info=True)

    return JsonResponse(
        {
            "papers": papers,
            "count": len(papers),
            "total_count": total_count,
            "per_page": per_page,
            "next_cursor": next_cursor,
            "has_more": next_cursor is not None,
            "mode": mode,
            "query": query,
        }
    )


@require_POST
@ratelimit(key="ip", rate="20/m")
def generate_title(request):
    """
    Generate a title for a research conversation using OpenRouter LLM.

    POST /api/generate_title/
    Content-Type: application/json

    Body:
    {
        "messages": [...]  # List of message objects with role and content
    }

    Returns:
    {
        "title": "Generated title"
    }
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    messages = data.get("messages")

    if not messages or not isinstance(messages, list) or len(messages) == 0:
        return JsonResponse({"error": "Missing or invalid 'messages' field"}, status=400)

    try:
        # Initialize OpenRouter service
        openrouter_service = OpenRouterService()

        # Convert conversation history to a single user message for title generation
        conversation_text = "\n".join([
            f"{msg.get('role', '').title()}: {msg.get('content', '')}"
            for msg in messages[-5:]  # Use last 5 messages to avoid token limits
        ])
        
        # Get title from LLM
        title = openrouter_service.complete(
            system_prompt="You are a helpful assistant that generates concise, professional titles for research conversations.",
            user_message=f"Based on this conversation, suggest a short, catchy, professional title (maximum 40 characters). Respond with ONLY the title text - no quotes, explanations, or extra words.\n\nConversation:\n{conversation_text}"
        )

        # Clean the title
        title = re.sub(r'^["\']|["\']$|^\s*Title:\s*', '', title).strip()

        if len(title) < 5 or len(title) > 60:
            title = "Research Conversation"

        return JsonResponse({"title": title})

    except OpenRouterAPIError as exc:
        logger.error("OpenRouter title generation error: %s", exc)
        return JsonResponse({"error": "Service temporarily unavailable"}, status=503)
    except Exception as exc:
        logger.error("Unexpected error in generate_title: %s", exc, exc_info=True)
        return JsonResponse({"error": "Internal server error"}, status=500)


def frontend(request):
    """
    Render the frontend HTML template for BRAIN AI Research Assistant.
    """
    return render(request, 'index.html')


@require_POST
@ratelimit(key="ip", rate="20/m")
def summarise(request):
    """
    Generate a summary of research papers using OpenRouter LLM.

    POST /api/summarise/
    Content-Type: application/json

    Body:
    {
        "query": "research question",
        "papers": [...]  # List of paper objects from search endpoint
    }

    Returns:
    {
        "summary": "Generated summary"
    }
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    query = data.get("query")
    papers = data.get("papers")

    if not query or not isinstance(query, str):
        return JsonResponse({"error": "Missing or invalid 'query' field"}, status=400)

    if not papers or not isinstance(papers, list):
        return JsonResponse({"error": "Missing or invalid 'papers' field"}, status=400)

    try:
        # Initialize OpenRouter service
        openrouter_service = OpenRouterService()

        # Build user message with papers context
        user_message = build_user_message(papers, query)

        # Get summary from LLM
        summary = openrouter_service.complete(
            system_prompt=system_prompt,
            user_message=user_message
        )

        return JsonResponse({"summary": summary})

    except OpenRouterAPIError as exc:
        logger.error("OpenRouter summarise error: %s", exc)
        return JsonResponse({"error": "Service temporarily unavailable"}, status=503)
    except Exception as exc:
        logger.error("Unexpected error in summarise: %s", exc, exc_info=True)
        return JsonResponse({"error": "Internal server error"}, status=500)


@require_GET
@ratelimit(key="ip", rate="100/s")  # OpenAlex: Max 100 requests per second
def search_authors(request):
    """
    Search authors via OpenAlex API.

    GET /api/openalex/authors/?q=<query>&per_page=<int>&page=<int>

    Query params:
        q (required): author search string
        per_page (optional): results per page, 1-50 (default: 10)
        page (optional): page number (default: 1)

    Returns JSON:
    {
        "results": [...],
        "page": int,
        "per_page": int,
        "query": str
    }
    """
    query = request.GET.get("q", "").strip()
    per_page_raw = request.GET.get("per_page", "10")
    page_raw = request.GET.get("page", "1")

    # Validate query
    if not query:
        return JsonResponse(
            {
                "error": {
                    "code": "missing_query",
                    "message": "Query parameter 'q' is required.",
                }
            },
            status=400,
        )

    # Validate per_page
    try:
        per_page = int(per_page_raw)
        if per_page < 1 or per_page > 50:
            per_page = 10
    except (ValueError, TypeError):
        per_page = 10

    # Validate page
    try:
        page = int(page_raw)
        if page < 1:
            page = 1
    except (ValueError, TypeError):
        page = 1

    logger.info(
        "Author search request: query='%s' per_page=%d page=%d", query, per_page, page
    )

    try:
        # Fetch authors from OpenAlex
        results = openalex_service.search_authors(
            query=query,
            per_page=per_page,
            page=page,
        )
        return JsonResponse(
            {
                "results": results,
                "page": page,
                "per_page": per_page,
                "query": query,
            }
        )
    except OpenAlexAPIError as exc:
        logger.error("OpenAlex author search error: %s", exc)
        return JsonResponse({"error": str(exc)}, status=502)


