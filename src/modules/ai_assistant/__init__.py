"""
AI Assistant Module

Single Claude Sonnet 4.6 assistant replacing the four Gemini agents
(farm_ai, farm_level_ai, global_ai, ai_hub). Provides a read-only chat
surface available on every authenticated page via a slide-out side panel.

Phases implemented here:
  A — Foundation (SDK, settings, claude_service, cost_tracker)
  B — Tools (query_mongodb + SenseHub read tools, tool_executor)
  C — Context + API (context_composer, conversation_repository, /ai/chat endpoint)
"""
