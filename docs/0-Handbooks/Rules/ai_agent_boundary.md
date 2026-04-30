# AI Agent Boundary & Capability Specification

## Overview
This document defines the operational scope, capabilities, and safety boundaries for the AI Agent (Llama 3.3) within the Taipei-New Taipei Twin City Dashboard. 

## 1. Agent Architecture
The agent is not a standalone autonomous entity but a **Server-Side Tool-Calling Loop** orchestrated by the Go backend.

- **Model**: `llama3.3-ffm-70b-16k-chat` (via TWCC)
- **Orchestration**: Go `ai_service.go` managing the multi-turn loop.
- **Lifecycle**: Frontend Request → Backend Loop (Model → Tool → Model) → Final Response.

## 2. Capabilities

### Multi-Turn Tool Calling
- The agent can invoke multiple Go functions in sequence to fulfill a request.
- **Max Rounds**: 5 iterations per request to prevent infinite loops and excessive token usage.

### Available Tools (The "Skills")
The agent has access to the following domain-specific tools:
- **Time/Status**: `get_current_time`.
- **Demographics**: `get_population_summary`.
- **Hackathon Modules**:
  - `query_aed_overview`: Automated External Defibrillator distribution.
  - `query_food_inspection_trend`: Food safety inspection results.
  - `query_death_cause_ranking`: Public health data.
  - `query_cultural_facilities/events`: Cultural inclusive data.
  - `query_shelter_gap`: Disaster resilience gap analysis.

### Context Awareness
- Supports `session_id` for maintaining short-term conversation memory.
- Uses `system_instruction` to enforce its persona as a "Taipei City Dashboard Expert".

## 3. Boundaries & Constraints

### ⛔ Hard Constraints (The "Red Lines")
1. **Network Isolation**: The agent cannot access the public internet directly. All data must come from pre-defined Go tools or internal databases.
2. **Execution Limit**: Maximum 5 tool-calling rounds. If the model hasn't finished, the backend will force-terminate with the current output.
3. **Provider Locking**: ONLY the TWCC LLM is permitted. No fallbacks to OpenAI/Claude are allowed.
4. **Data Format Lock**: Output involving charts MUST correspond to the 5 approved visual formats.

### Resource Limits
- **Input Limit**: ~12k tokens (reserved 4k for output/tools).
- **Concurrency**: 10 simultaneous AI sessions per server instance.
- **Timeout**: 60 seconds per request.

## 4. Safety & Governance

### Silent Interception
To ensure a premium UX, raw tool-calling syntax (e.g., `<function=...>` or XML tags) is intercepted by the backend and never shown to the end-user.

### Audit Logging
Every interaction is recorded in the `ai_chatlog` table:
- Input/Output Tokens.
- Latency (ms).
- Tools used and their arguments.
- User ID and IP.

### Hallucination Mitigation
- Tools return structured data (JSON/Text).
- The `cleanXML` filter prevents the model from generating or echoing invalid tags that could break the stream.
