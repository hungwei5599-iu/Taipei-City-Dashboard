# Backend Code Style Guide — Taipei Dashdorad

## Core Principles
1. **Robustness**: Proper error handling and logging for every operation.
2. **Performance**: Efficient SQL queries and concurrent processing where applicable.
3. **AI Security**: All AI interactions must pass through the authorized TWCC proxy.

## Technology Stack
- **Language**: Go 1.24+
- **Web Framework**: Gin 1.9+
- **ORM**: GORM
- **AI Framework**: LangChainGo
- **Database**: PostgreSQL 16 + PostGIS / Qdrant / Redis

## Code Standards

### 1. Architecture (MVC-S)
- **Controllers**: Handle HTTP requests, parameter validation, and response formatting.
- **Services**: Contain business logic and interact with external APIs (like TWCC).
- **Models**: Define data structures and GORM mappings.

### 2. Error Handling
- Never ignore errors (`_ = ...`).
- Use structured error responses for the frontend.
- Log errors with context using `logrus` or `zap`.

```go
if err := db.Create(&record).Error; err != nil {
    logger.Errorf("failed to save chatlog: %v", err)
    c.JSON(500, gin.H{"error": "Internal Server Error"})
    return
}
```

### 3. AI Proxy Implementation
- **NO DIRECT CALLS**: Do not use OpenAI/Anthropic/Gemini SDKs.
- **Authorized Path**: `/api/v1/ai/chat/twai`.
- **Tool Registry**: All AI tools must be registered in `app/services/ai/tools/registry.go`.

### 4. Data Formats
The backend MUST serve data in one of the 5 approved formats:
- `two_d`: Standard XY charts.
- `percent`: Donut/Pie charts.
- `three_d`: Multi-series data.
- `map_legend`: Geographic data categorization.
- `time`: Time-series data.

## API Documentation
- Use **Swagger/OpenAPI** annotations for all endpoints.
- Ensure every field in a JSON response has a descriptive `json` tag.

## Concurrency
- Use `context.Context` for cancellation and timeout management.
- Use Semaphores for limiting expensive AI requests (default: 10 concurrent).
