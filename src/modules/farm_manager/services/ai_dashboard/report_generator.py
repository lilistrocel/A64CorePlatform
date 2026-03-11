"""
AI Dashboard Report Generator

Passes raw inspection data to Vertex AI Gemini and parses the structured
JSON response into an AISummary object.
"""

import json
import logging
from typing import Any, Dict

import vertexai
from vertexai.generative_models import GenerationConfig, GenerativeModel

from src.config.settings import settings
from .models import AISummary, FarmStatusCard, InspectionVerdict, InspectionRawData, Recommendation

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt template
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are an expert agricultural operations AI assistant
analysing automated farm inspection data for the A64 Core Platform.

Your task is to analyse the provided raw inspection data and return a
structured JSON object with the following exact schema:

{
  "executiveSummary": "<2-3 sentences summarising the overall farm status>",
  "overallHealthRating": "<one of: excellent | good | fair | poor | critical>",
  "farmStatusCards": [
    {
      "farmName": "<string>",
      "farmId": "<string>",
      "health": "<one of: excellent | good | fair | poor | critical>",
      "yieldEfficiency": <float>,
      "topIssues": ["<issue string>", ...]
    }
  ],
  "inspectionResults": [
    {
      "taskName": "<string — one of: Farm Census | Yield Assessment | Growth Timeline | SenseHub Alerts | Equipment Health | Automation Audit | Harvest Progress | Platform Alerts>",
      "verdict": "<one of: pass | warning | fail>",
      "summary": "<1-2 sentence description of findings>"
    }
  ],
  "recommendations": [
    {
      "priority": "<one of: high | medium | low>",
      "category": "<string>",
      "message": "<actionable recommendation>",
      "affectedFarms": ["<farm name or ID>", ...]
    }
  ]
}

Rules:
- Return ONLY valid JSON — no markdown code fences, no prose before or after.
- Include an inspectionResult entry for every inspection task that has data.
- Produce 1-5 recommendations ordered from highest to lowest priority.
- farmStatusCards should only include farms that appear in the yield data.
- overallHealthRating must reflect the worst issue found.
- If a data section is null/missing, omit it from verdicts rather than guessing.
"""


def _init_vertexai() -> None:
    """
    Initialise the Vertex AI SDK once per process.

    The GOOGLE_APPLICATION_CREDENTIALS environment variable must point to a
    valid Google Cloud service-account JSON file at runtime.

    Args:
        None

    Returns:
        None
    """
    vertexai.init(
        project=settings.GOOGLE_CLOUD_PROJECT,
        location=settings.VERTEX_AI_LOCATION,
    )


class ReportGenerator:
    """
    Generates an AI-powered summary from raw inspection data using Gemini.
    """

    def __init__(self) -> None:
        # Initialise Vertex AI SDK on first instantiation (idempotent)
        _init_vertexai()

    async def generate_summary(
        self, raw_data: InspectionRawData
    ) -> AISummary:
        """
        Send raw inspection data to Gemini and parse the structured response.

        Args:
            raw_data: Complete InspectionRawData from DataCollector.

        Returns:
            AISummary parsed from Gemini's JSON response.

        Raises:
            ValueError: If Gemini's response cannot be parsed as valid JSON.
            Exception: If the Vertex AI API call fails.
        """
        if not settings.GOOGLE_CLOUD_PROJECT:
            raise ValueError(
                "GOOGLE_CLOUD_PROJECT is not configured. "
                "Cannot generate AI summary."
            )

        # Serialise the raw data to a JSON-safe dict for the prompt
        raw_dict: Dict[str, Any] = raw_data.model_dump(mode="json")

        user_message = (
            "Here is the latest farm inspection data in JSON format. "
            "Analyse it and return the structured summary as specified:\n\n"
            + json.dumps(raw_dict, indent=2, default=str)
        )

        model = GenerativeModel(
            settings.VERTEX_AI_MODEL,
            system_instruction=_SYSTEM_PROMPT,
        )

        generation_config = GenerationConfig(
            max_output_tokens=8192,
            temperature=0.1,
            response_mime_type="application/json",
        )

        logger.info("[ReportGenerator] Sending inspection data to Gemini")

        response = await model.generate_content_async(
            user_message,
            generation_config=generation_config,
        )

        response_text: str = ""
        for part in response.candidates[0].content.parts:
            if part.text:
                response_text += part.text

        if not response_text:
            raise ValueError("Gemini returned an empty response")

        logger.debug(
            f"[ReportGenerator] Raw Gemini response (first 500 chars): "
            f"{response_text[:500]}"
        )

        # Parse JSON response
        try:
            parsed: Dict[str, Any] = json.loads(response_text)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Gemini response is not valid JSON: {exc}\n"
                f"Response text: {response_text[:1000]}"
            ) from exc

        # Build AISummary from parsed data
        try:
            farm_status_cards = [
                FarmStatusCard(**card)
                for card in parsed.get("farmStatusCards", [])
            ]
            inspection_results = [
                InspectionVerdict(**verdict)
                for verdict in parsed.get("inspectionResults", [])
            ]
            recommendations = [
                Recommendation(**rec)
                for rec in parsed.get("recommendations", [])
            ]

            summary = AISummary(
                executiveSummary=parsed.get("executiveSummary", ""),
                overallHealthRating=parsed.get("overallHealthRating", "fair"),
                farmStatusCards=farm_status_cards,
                inspectionResults=inspection_results,
                recommendations=recommendations,
            )
        except Exception as exc:
            raise ValueError(
                f"Failed to construct AISummary from Gemini response: {exc}\n"
                f"Parsed data: {parsed}"
            ) from exc

        logger.info(
            f"[ReportGenerator] Generated summary: "
            f"health={summary.overallHealthRating}, "
            f"{len(summary.recommendations)} recommendations"
        )

        return summary
