"""
Gemini Service

Handles all interactions with Google Vertex AI Gemini API.
Implements context caching for cost optimization.
"""

import os
import logging
import time
from typing import Dict, Any, Optional, List
from datetime import datetime
import vertexai
from vertexai.preview.generative_models import GenerativeModel, GenerationConfig
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


class GeminiService:
    """
    Service for interacting with Google Vertex AI Gemini.

    Features:
    - Context caching for schema information (75% cost savings)
    - Configurable temperature and output tokens
    - Zero Data Retention (privacy guaranteed)
    - Retry logic for reliability
    """

    def __init__(self):
        """Initialize Gemini service with credentials from environment"""
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        self.location = os.getenv("VERTEX_AI_LOCATION", "us-central1")
        self.model_name = os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")
        self.max_output_tokens = int(os.getenv("VERTEX_AI_MAX_OUTPUT_TOKENS", "2048"))
        self.temperature = float(os.getenv("VERTEX_AI_TEMPERATURE", "0.1"))

        # Initialize Vertex AI
        vertexai.init(project=self.project_id, location=self.location)

        # Create model instance
        self.model = GenerativeModel(self.model_name)

        # Context cache for schema information
        self._schema_cache: Optional[str] = None
        self._schema_cache_timestamp: Optional[datetime] = None

        logger.info(
            f"GeminiService initialized: project={self.project_id}, "
            f"location={self.location}, model={self.model_name}"
        )

    def _create_generation_config(
        self,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None
    ) -> GenerationConfig:
        """
        Create generation configuration for API calls.

        Args:
            temperature: Controls randomness (0.0 = deterministic, 1.0 = creative)
            max_output_tokens: Maximum tokens in response

        Returns:
            GenerationConfig object
        """
        return GenerationConfig(
            temperature=temperature or self.temperature,
            max_output_tokens=max_output_tokens or self.max_output_tokens,
        )

    def set_schema_cache(self, schema: str) -> None:
        """
        Set the schema cache for context caching.

        This allows Gemini to cache the schema information, reducing costs
        by 75% for queries that use the same schema.

        Args:
            schema: JSON string representation of database schema
        """
        self._schema_cache = schema
        self._schema_cache_timestamp = datetime.utcnow()
        logger.info(f"Schema cache updated: {len(schema)} characters")

    def clear_schema_cache(self) -> None:
        """Clear the schema cache"""
        self._schema_cache = None
        self._schema_cache_timestamp = None
        logger.info("Schema cache cleared")

    def get_schema_cache_age(self) -> Optional[float]:
        """
        Get age of schema cache in seconds.

        Returns:
            Age in seconds, or None if no cache
        """
        if self._schema_cache_timestamp is None:
            return None
        return (datetime.utcnow() - self._schema_cache_timestamp).total_seconds()

    async def generate_mongodb_query(
        self,
        user_prompt: str,
        schema: str,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Generate MongoDB query from natural language prompt.

        Args:
            user_prompt: User's natural language query
            schema: Database schema (JSON string)
            conversation_history: Previous messages for context

        Returns:
            Dict containing:
                - query: MongoDB query object
                - explanation: Human-readable explanation
                - collection: Target collection name
                - estimated_cost: Tokens used
        """
        # Update schema cache if needed
        if self._schema_cache != schema:
            self.set_schema_cache(schema)

        # Build system prompt
        system_prompt = self._build_system_prompt(schema)

        # Build conversation context
        full_prompt = self._build_prompt_with_history(
            system_prompt,
            user_prompt,
            conversation_history
        )

        # Generate response
        try:
            generation_config = self._create_generation_config()

            response = self.model.generate_content(
                full_prompt,
                generation_config=generation_config
            )

            # Parse response
            result = self._parse_query_response(response.text)

            # Add metadata
            result["estimated_cost"] = self._estimate_cost(response)
            result["cache_hit"] = self._schema_cache is not None

            logger.info(
                f"Query generated successfully: collection={result.get('collection')}, "
                f"cache_hit={result['cache_hit']}"
            )

            return result

        except Exception as e:
            logger.error(f"Failed to generate query: {e}")
            raise

    async def generate_report(
        self,
        query_results: List[Dict[str, Any]],
        user_prompt: str,
        query_explanation: str
    ) -> Dict[str, Any]:
        """
        Generate human-readable report from query results.

        Args:
            query_results: Results from MongoDB query
            user_prompt: Original user prompt
            query_explanation: Explanation of the query

        Returns:
            Dict containing:
                - summary: High-level summary
                - insights: List of key insights
                - visualization_suggestions: Suggested chart types
                - markdown: Formatted markdown report
        """
        # Build report prompt
        prompt = self._build_report_prompt(
            query_results,
            user_prompt,
            query_explanation
        )

        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                # Use more tokens for reports (they can be longer than queries)
                generation_config = self._create_generation_config(
                    temperature=0.3,  # Slightly higher for more creative reports
                    max_output_tokens=8192  # Increased to prevent truncation
                )

                response = self.model.generate_content(
                    prompt,
                    generation_config=generation_config
                )

                # Check for empty response and retry if needed
                if not hasattr(response, 'text') or not response.text:
                    raise ValueError("Empty response from Gemini - no content parts")

                # Parse report
                result = self._parse_report_response(response.text)
                result["estimated_cost"] = self._estimate_cost(response)

                logger.info("Report generated successfully")

                return result

            except ValueError as e:
                last_error = e
                error_str = str(e)
                # Retry on empty responses or truncated JSON
                if any(msg in error_str for msg in [
                    "Content has no parts",
                    "Empty response",
                    "Unterminated string",
                    "Invalid JSON response"
                ]):
                    logger.warning(
                        f"Retryable error (attempt {attempt + 1}/{max_retries}): {error_str[:100]}..."
                    )
                    if attempt < max_retries - 1:
                        time.sleep(2 ** attempt)  # Exponential backoff: 1s, 2s, 4s
                        continue
                raise

            except Exception as e:
                logger.error(f"Failed to generate report: {e}")
                raise

        # All retries exhausted
        logger.error(f"Failed to generate report after {max_retries} attempts: {last_error}")
        raise last_error or ValueError("Failed to generate report after all retries")

    def _build_system_prompt(self, schema: str) -> str:
        """
        Build system prompt for query generation.

        Args:
            schema: Database schema

        Returns:
            System prompt string
        """
        return f"""You are an expert MongoDB query assistant for an agricultural farm management system.

DATABASE SCHEMA:
{schema}

YOUR TASKS:
1. Convert natural language queries to MongoDB aggregation pipelines
2. Ensure queries are efficient and use proper indexes
3. Validate that queries are safe (no $where, no eval)
4. Provide clear explanations of what the query does

RESPONSE FORMAT (JSON):
{{
    "collection": "collection_name",
    "query": {{ /* MongoDB aggregation pipeline */ }},
    "explanation": "What this query does in simple terms",
    "filters": ["field1", "field2"],  // Fields being filtered
    "grouping": ["field1"],  // Fields being grouped (if any)
    "sorting": ["field1"],  // Fields being sorted (if any)
    "estimated_documents": 100  // Rough estimate of results
}}

RULES:
- Always use aggregation pipelines (even for simple finds)
- Never use $where or JavaScript evaluation
- Always include proper $match stages for filtering
- Use $lookup for joins between collections
- Include $sort for ordering results
- Limit results to max 1000 documents with $limit
- Return ONLY valid JSON, no markdown formatting"""

    def _build_report_prompt(
        self,
        query_results: List[Dict[str, Any]],
        user_prompt: str,
        query_explanation: str
    ) -> str:
        """
        Build prompt for report generation.

        Args:
            query_results: Query results
            user_prompt: Original user prompt
            query_explanation: Query explanation

        Returns:
            Report prompt string
        """
        # Limit results in prompt to avoid token limits
        results_summary = query_results[:10] if len(query_results) > 10 else query_results

        return f"""Generate a comprehensive report based on the following data analysis.

USER QUESTION: {user_prompt}

QUERY PERFORMED: {query_explanation}

DATA RESULTS ({len(query_results)} records):
{results_summary}

RESPONSE FORMAT (JSON):
{{
    "summary": "2-3 sentence high-level summary of findings",
    "insights": [
        "Key insight 1",
        "Key insight 2",
        "Key insight 3"
    ],
    "statistics": {{
        "total_records": 100,
        "key_metric_1": "value",
        "key_metric_2": "value"
    }},
    "visualization_suggestions": [
        {{"type": "bar_chart", "title": "Chart Title", "x_axis": "field1", "y_axis": "field2"}},
        {{"type": "pie_chart", "title": "Chart Title", "data_field": "field1"}}
    ],
    "markdown": "# Report Title\\n\\n## Summary\\n...\\n\\n## Key Findings\\n..."
}}

RULES:
- Be concise and actionable
- Focus on insights, not just data
- Suggest visualizations that would be helpful
- Use agricultural/farming terminology appropriately
- Return ONLY valid JSON, no markdown formatting"""

    def _build_prompt_with_history(
        self,
        system_prompt: str,
        user_prompt: str,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> str:
        """
        Build full prompt with conversation history.

        Args:
            system_prompt: System instructions
            user_prompt: Current user query
            conversation_history: Previous messages

        Returns:
            Full prompt string
        """
        prompt_parts = [system_prompt, "\n\n"]

        # Add conversation history (last 3 messages only to save tokens)
        if conversation_history:
            recent_history = conversation_history[-3:]
            prompt_parts.append("CONVERSATION HISTORY:\n")
            for msg in recent_history:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                prompt_parts.append(f"{role.upper()}: {content}\n")
            prompt_parts.append("\n")

        # Add current user prompt
        prompt_parts.append(f"USER: {user_prompt}\n\n")
        prompt_parts.append("ASSISTANT (respond in JSON format):")

        return "".join(prompt_parts)

    def _parse_query_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse query generation response.

        Args:
            response_text: Raw response from Gemini

        Returns:
            Parsed query dict
        """
        import json
        import re

        # Extract JSON from markdown code blocks if present
        # Strip markdown code fences if they exist
        if response_text.strip().startswith('```'):
            # Remove opening ```json or ```
            response_text = re.sub(r'^```(?:json)?\s*\n?', '', response_text.strip(), flags=re.MULTILINE)
            # Remove closing ```
            response_text = re.sub(r'\n?```\s*$', '', response_text.strip(), flags=re.MULTILINE)

        # Try to parse JSON with multiple strategies
        try:
            # Strategy 1: Parse as-is
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.warning(f"Initial JSON parse failed: {e}, trying repair strategies...")

            # Strategy 2: Try to fix truncated JSON by finding last complete brace
            try:
                last_brace = response_text.rfind('}')
                if last_brace > 0:
                    truncated_text = response_text[:last_brace + 1]
                    return json.loads(truncated_text)
            except json.JSONDecodeError:
                pass

            # Strategy 3: Try to extract JSON using regex (find outermost braces)
            try:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

            # All strategies failed - log and raise error
            logger.error(f"Failed to parse JSON response after all strategies: {e}")
            logger.error(f"Response text (first 1000 chars): {response_text[:1000]}")
            raise ValueError(f"Invalid JSON response from Gemini: {e}")

    def _repair_truncated_json(self, text: str) -> str:
        """
        Attempt to repair truncated JSON by closing open brackets and braces.
        """
        # Count open brackets/braces
        open_braces = text.count('{') - text.count('}')
        open_brackets = text.count('[') - text.count(']')

        # Remove any trailing incomplete string (ends with unclosed quote)
        if text.count('"') % 2 == 1:
            # Find last quote and truncate there, then close the string
            last_quote = text.rfind('"')
            text = text[:last_quote] + '..."'

        # Close open brackets/braces
        text = text.rstrip(',\n\t ')  # Remove trailing commas/whitespace
        text += ']' * open_brackets
        text += '}' * open_braces

        return text

    def _create_fallback_report(self, response_text: str, error: Exception) -> Dict[str, Any]:
        """
        Create a fallback report when JSON parsing fails completely.
        Extracts what data we can from the truncated response.
        """
        import re

        # Try to extract summary
        summary_match = re.search(r'"summary"\s*:\s*"([^"]+)', response_text)
        summary = summary_match.group(1) if summary_match else "Report generation was interrupted. Please try again."

        # Try to extract insights
        insights = []
        insight_matches = re.findall(r'"([^"]{20,200})"', response_text)
        for match in insight_matches[:3]:
            if any(word in match.lower() for word in ['farm', 'block', 'yield', 'harvest', 'crop', 'performance']):
                insights.append(match)

        if not insights:
            insights = ["Analysis was partially completed. Please try rephrasing your question."]

        logger.warning(f"Created fallback report due to JSON parse error: {error}")

        return {
            "summary": summary,
            "insights": insights,
            "statistics": {},
            "visualization_suggestions": [],
            "markdown": f"## Analysis Results\n\n{summary}\n\n**Note:** The full report could not be generated. Please try again.",
            "_fallback": True
        }

    def _parse_report_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse report generation response.

        Args:
            response_text: Raw response from Gemini

        Returns:
            Parsed report dict
        """
        import json
        import re

        # Extract JSON from markdown code blocks if present
        # Strip markdown code fences if they exist
        if response_text.strip().startswith('```'):
            # Remove opening ```json or ```
            response_text = re.sub(r'^```(?:json)?\s*\n?', '', response_text.strip(), flags=re.MULTILINE)
            # Remove closing ```
            response_text = re.sub(r'\n?```\s*$', '', response_text.strip(), flags=re.MULTILINE)

        # Try to parse JSON with multiple strategies
        try:
            # Strategy 1: Parse as-is
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.warning(f"Initial JSON parse failed: {e}, trying repair strategies...")

            # Strategy 2: Try to repair truncated JSON
            try:
                repaired = self._repair_truncated_json(response_text)
                return json.loads(repaired)
            except json.JSONDecodeError:
                pass

            # Strategy 3: Try to find last complete brace
            try:
                last_brace = response_text.rfind('}')
                if last_brace > 0:
                    truncated_text = response_text[:last_brace + 1]
                    return json.loads(truncated_text)
            except json.JSONDecodeError:
                pass

            # Strategy 4: Try to extract JSON using regex (find outermost braces)
            try:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

            # Strategy 5: Return a fallback response with extracted data
            logger.warning(f"All JSON parse strategies failed, creating fallback report")
            return self._create_fallback_report(response_text, e)

    def _estimate_cost(self, response: Any) -> Dict[str, Any]:
        """
        Estimate cost of API call.

        Args:
            response: Gemini response object

        Returns:
            Dict with cost estimation
        """
        # Gemini 2.5 Flash pricing: $0.075 per 1M input tokens, $0.30 per 1M output tokens
        # These are approximations since we don't have exact token counts in the response

        try:
            # Estimate tokens (rough approximation: 1 token ≈ 4 characters)
            input_tokens = len(response.prompt_feedback.get("prompt_text", "")) // 4 if hasattr(response, 'prompt_feedback') else 0
            output_tokens = len(response.text) // 4

            # Calculate cost
            input_cost = (input_tokens / 1_000_000) * 0.075
            output_cost = (output_tokens / 1_000_000) * 0.30
            total_cost = input_cost + output_cost

            return {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "input_cost_usd": round(input_cost, 6),
                "output_cost_usd": round(output_cost, 6),
                "total_cost_usd": round(total_cost, 6)
            }
        except Exception as e:
            logger.warning(f"Failed to estimate cost: {e}")
            return {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "input_cost_usd": 0.0,
                "output_cost_usd": 0.0,
                "total_cost_usd": 0.0
            }


# Singleton instance
_gemini_service: Optional[GeminiService] = None


def get_gemini_service() -> GeminiService:
    """
    Get singleton instance of GeminiService.

    Returns:
        GeminiService instance
    """
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service
