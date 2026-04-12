"""
Farm Management Module - AI Hub API Endpoints

Exposes 6 endpoints under /ai-hub for the unified AI Hub interface:
  POST   /ai-hub/chat              - Send a message to a Hub section assistant
  POST   /ai-hub/confirm           - Confirm or deny a pending write action
  POST   /ai-hub/transcribe        - Transcribe uploaded audio via Vertex AI
  GET    /ai-hub/history/{section} - Retrieve chat history for a section
  POST   /ai-hub/tts               - Convert text to speech via ElevenLabs
  POST   /ai-hub/export-report     - Export AI report as PDF or Excel

All endpoints are restricted to super_admin role only.
"""

import logging
import re
from datetime import datetime, timezone

import httpx
import vertexai
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from vertexai.generative_models import GenerativeModel, GenerationConfig, Part

from src.config.settings import settings
from ...middleware.auth import get_current_active_user, CurrentUser
from ...services.ai_hub import AIHubService
from ...services.ai_hub.models import (
    AIHubChatRequest,
    AIHubChatResponse,
    AIHubSection,
    ConfirmActionRequest,
    ConfirmActionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-hub", tags=["ai-hub"])


async def require_super_admin(
    current_user: CurrentUser = Depends(get_current_active_user),
) -> CurrentUser:
    """
    Dependency that restricts access to super_admin users only.

    Args:
        current_user: Authenticated user resolved by get_current_active_user.

    Returns:
        The same CurrentUser if the role check passes.

    Raises:
        HTTPException 403: If the user does not have the super_admin role.
    """
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required.",
        )
    return current_user


@router.post(
    "/chat",
    response_model=AIHubChatResponse,
    summary="Send a message to an AI Hub section assistant",
    description=(
        "Processes a natural language message through the appropriate Hub section "
        "assistant (Control, Monitor, Report, or Advise). Control section supports "
        "write actions that are held pending until confirmed via /ai-hub/confirm."
    ),
)
async def chat(
    body: AIHubChatRequest,
    current_user: CurrentUser = Depends(require_super_admin),
) -> AIHubChatResponse:
    """
    Send a message to an AI Hub section assistant.

    The section field in the request body determines which personality and
    tool set is active. The Control section is the only section that can
    produce pending write actions (relay control, automation management).

    Read actions execute immediately. Write actions (Control only) return a
    pending_action that must be confirmed via the /confirm endpoint.

    Args:
        body: Chat request with section, message, and conversation history.
        current_user: Authenticated super admin user.

    Returns:
        AIHubChatResponse with the assistant's reply and optional pending_action.

    Raises:
        HTTPException 500: If the AI service encounters an unhandled error.
    """
    try:
        response = await AIHubService.chat(
            message=body.message,
            conversation_history=[m.model_dump() for m in body.conversation_history],
            section=body.section,
            user_id=current_user.userId,
        )
        return response
    except Exception as e:
        logger.error(f"AI Hub chat error (section={body.section}): {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI Hub chat error. Please try again.",
        )


@router.post(
    "/confirm",
    response_model=ConfirmActionResponse,
    summary="Confirm or deny a pending AI Hub write action",
    description=(
        "Approve or cancel a pending write action produced by the Control section. "
        "Pending actions expire after 5 minutes. Approval executes the stored "
        "SenseHub command immediately."
    ),
)
async def confirm_action(
    body: ConfirmActionRequest,
    current_user: CurrentUser = Depends(require_super_admin),
) -> ConfirmActionResponse:
    """
    Confirm or deny a pending write action from the AI Hub Control section.

    Args:
        body: Confirm request with action_id and approved flag.
        current_user: Authenticated super admin user.

    Returns:
        ConfirmActionResponse indicating executed, cancelled, or not_found.

    Raises:
        HTTPException 500: If confirmation handling fails unexpectedly.
    """
    try:
        response = await AIHubService.confirm_action(
            action_id=body.action_id,
            approved=body.approved,
        )
        return response
    except Exception as e:
        logger.error(f"AI Hub confirm action error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI Hub confirm error. Please try again.",
        )


ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/mp4",
    "audio/mpeg", "audio/x-m4a", "video/webm",
}
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post(
    "/transcribe",
    summary="Transcribe uploaded audio via Vertex AI",
    description=(
        "Accepts an audio file (WebM, OGG, WAV, MP4) up to 10 MB and returns "
        "the transcribed text using Vertex AI Gemini. Used by the AI Hub voice "
        "input feature as a backend alternative to browser SpeechRecognition."
    ),
)
async def transcribe_audio(
    audio: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_super_admin),
) -> dict:
    """
    Transcribe an uploaded audio file using Vertex AI Gemini.

    Args:
        audio: Uploaded audio file (WebM/OGG/WAV/MP4, max 10 MB).
        current_user: Authenticated super admin user.

    Returns:
        dict with "transcript" key containing the transcribed text.

    Raises:
        HTTPException 400: If the file type is unsupported or too large.
        HTTPException 500: If transcription fails.
    """
    raw_content_type = audio.content_type or ""
    # Strip codec suffix: "audio/webm;codecs=opus" → "audio/webm"
    content_type = raw_content_type.split(";")[0].strip()
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio type: {raw_content_type}. "
                   f"Allowed: {', '.join(sorted(ALLOWED_AUDIO_TYPES))}",
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file too large. Maximum size is 10 MB.",
        )
    if len(audio_bytes) < 100:
        return {"transcript": ""}

    try:
        vertexai.init(
            project=settings.GOOGLE_CLOUD_PROJECT,
            location=settings.VERTEX_AI_LOCATION,
        )
        model = GenerativeModel(settings.VERTEX_AI_MODEL)
        audio_part = Part.from_data(data=audio_bytes, mime_type=content_type)
        response = await model.generate_content_async(
            [
                audio_part,
                "Transcribe this audio exactly as spoken. "
                "Return ONLY the transcribed text, nothing else. "
                "If the audio is empty or inaudible, return an empty string.",
            ],
            generation_config=GenerationConfig(
                max_output_tokens=1024,
                temperature=0.0,
            ),
        )
        transcript = response.text.strip() if response.text else ""
        return {"transcript": transcript}

    except Exception as e:
        logger.error(f"Audio transcription failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transcription failed. Please try again.",
        )


@router.get(
    "/history/{section}",
    summary="Get AI Hub chat history for a section",
    description=(
        "Returns paginated chat history for the specified Hub section, "
        "filtered to the authenticated user's conversations. "
        "Results are ordered newest-first."
    ),
)
async def get_history(
    section: AIHubSection,
    skip: int = 0,
    limit: int = 20,
    current_user: CurrentUser = Depends(require_super_admin),
) -> list[dict]:
    """
    Retrieve AI Hub chat history for a specific section.

    Args:
        section: Hub section to fetch history for.
        skip: Number of records to skip (pagination offset).
        limit: Maximum number of records to return (max 20).
        current_user: Authenticated super admin user.

    Returns:
        List of chat log entries ordered by timestamp descending.

    Raises:
        HTTPException 500: If the database query fails.
    """
    try:
        return await AIHubService.get_history(
            section=section,
            user_id=current_user.userId,
            skip=skip,
            limit=min(limit, 50),  # Reason: Cap at 50 to protect DB load
        )
    except Exception as e:
        logger.error(
            f"AI Hub history fetch error (section={section}): {e}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve AI Hub history.",
        )


ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
MAX_TTS_TEXT_LENGTH = 5000


class TTSRequest(BaseModel):
    """Request body for the TTS endpoint."""

    text: str = Field(..., min_length=1, max_length=MAX_TTS_TEXT_LENGTH)


@router.post(
    "/tts",
    summary="Convert text to speech via ElevenLabs",
    description=(
        "Accepts a text payload (max 5000 characters) and returns the synthesised "
        "audio as an audio/mpeg stream using the configured ElevenLabs voice. "
        "Requires a valid ELEVENLABS_API_KEY to be set in the environment."
    ),
    response_class=StreamingResponse,
)
async def text_to_speech(
    body: TTSRequest,
    current_user: CurrentUser = Depends(require_super_admin),
) -> StreamingResponse:
    """
    Synthesise speech from text using the ElevenLabs REST API.

    Args:
        body: TTS request containing the text to synthesise.
        current_user: Authenticated super admin user.

    Returns:
        StreamingResponse with audio/mpeg content.

    Raises:
        HTTPException 400: If text is empty (enforced by Pydantic) or too long.
        HTTPException 503: If ElevenLabs API is unreachable or returns an error.
        HTTPException 500: For any other unexpected failure.
    """
    if not settings.ELEVENLABS_API_KEY:
        logger.error("TTS request received but ELEVENLABS_API_KEY is not configured.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Text-to-speech service is not configured.",
        )

    url = ELEVENLABS_TTS_URL.format(voice_id=settings.ELEVENLABS_VOICE_ID)
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": body.text,
        "model_id": settings.ELEVENLABS_MODEL_ID,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code == 200:
            # Reason: Stream the raw bytes back so the client can play immediately
            return StreamingResponse(
                iter([response.content]),
                media_type="audio/mpeg",
            )

        # ElevenLabs returned a non-200 — surface a safe error without leaking the key
        logger.error(
            f"ElevenLabs API error: status={response.status_code} "
            f"body={response.text[:200]}"
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Text-to-speech service is currently unavailable.",
        )

    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.error("ElevenLabs API request timed out.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Text-to-speech service timed out. Please try again.",
        )
    except httpx.RequestError as e:
        logger.error(f"ElevenLabs API connection error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Text-to-speech service is unreachable.",
        )
    except Exception as e:
        logger.error(f"TTS unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Text-to-speech failed. Please try again.",
        )


# ---------------------------------------------------------------------------
# Report export
# ---------------------------------------------------------------------------

MAX_EXPORT_MARKDOWN_LENGTH = 50_000


class ExportReportRequest(BaseModel):
    """Request body for the /ai-hub/export-report endpoint."""

    markdown: str = Field(
        ...,
        min_length=1,
        max_length=MAX_EXPORT_MARKDOWN_LENGTH,
        description="Markdown content to export (AI report text).",
    )
    title: str = Field(
        default="AI Hub Report",
        max_length=200,
        description="Document title embedded in the exported file.",
    )
    format: str = Field(
        default="pdf",
        pattern="^(pdf|excel)$",
        description="Export format: 'pdf' or 'excel'.",
    )


@router.post(
    "/export-report",
    summary="Export AI-generated report as PDF or Excel",
    description=(
        "Accepts markdown text (the AI assistant's report response) and converts it "
        "to a downloadable PDF (A4, styled) or Excel (.xlsx) file. "
        "The response is a binary file attachment. "
        "Restricted to super_admin role."
    ),
)
async def export_report(
    body: ExportReportRequest,
    current_user: CurrentUser = Depends(require_super_admin),
) -> Response:
    """
    Convert a markdown report to a PDF or Excel file and return it as a download.

    The markdown content is expected to be the AI-generated report text from the
    Report section of the AI Hub.  The conversion is CPU-bound but fast enough
    for typical report sizes that running it in the request thread is acceptable.

    Args:
        body: Export request containing markdown text, title, and format.
        current_user: Authenticated super admin user.

    Returns:
        Binary Response with Content-Disposition attachment header.

    Raises:
        HTTPException 400: If the format value is not 'pdf' or 'excel'
                           (enforced by Pydantic pattern validator).
        HTTPException 500: If the document generation library raises an error.
    """
    # Reason: Deferred import keeps the service layer out of module-load scope
    from ...services.ai_hub.report_exporter import ReportExporter

    # Reason: Sanitise title for use in the filename — strip path separators
    safe_title = re.sub(r'[\\/:*?"<>|]', "_", body.title).strip() or "report"
    date_stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d")

    try:
        if body.format == "pdf":
            content = ReportExporter.markdown_to_pdf(body.markdown, body.title)
            media_type = "application/pdf"
            filename = f"{safe_title}_{date_stamp}.pdf"
        else:
            content = ReportExporter.markdown_to_excel(body.markdown, body.title)
            media_type = (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            filename = f"{safe_title}_{date_stamp}.xlsx"

        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except Exception as e:
        logger.error(f"Report export error (format={body.format}): {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate report. Please try again.",
        )
