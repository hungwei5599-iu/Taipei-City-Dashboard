package controllers

import (
	"TaipeiCityDashboardBE/app/cache"
	"TaipeiCityDashboardBE/app/services/ai"
	aitools "TaipeiCityDashboardBE/app/services/ai/tools"
	"TaipeiCityDashboardBE/app/util"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis"
	"github.com/tmc/langchaingo/llms"
)

// AIChatInput matches the Request Schema in specification。https://docs.twcloud.ai/docs/user-guides/twcc/afs/api-and-parameters/api-parameter-information#模型說明
type AIChatInput struct {
	SessionID string `json:"session"`
	Stream    bool   `json:"stream"`
	Messages  []struct {
		Role      string `json:"role" binding:"required,oneof=system user assistant tool"`
		Content   string `json:"content" binding:"required"`
		ToolCalls []struct {
			ID       string `json:"id"`
			Type     string `json:"type"`
			Function struct {
				Name      string `json:"name"`
				Arguments string `json:"arguments"`
			} `json:"function"`
		} `json:"tool_calls,omitempty"`
		ToolCallID string `json:"tool_call_id,omitempty"`
	} `json:"messages" binding:"required,gt=0"`
	MaxNewTokens     *int      `json:"max_new_tokens" binding:"omitempty,gt=0"`
	Temperature      *float64  `json:"temperature" binding:"omitempty,gt=0"`
	TopP             *float64  `json:"top_p" binding:"omitempty,gt=0,lte=1"`
	TopK             *int      `json:"top_k" binding:"omitempty,gte=1,lte=100"`
	FrequencePenalty *float64  `json:"frequence_penalty" binding:"omitempty,gt=0"`
	StopSequences    []string  `json:"stop_sequences" binding:"omitempty,max=4"`
	Seed             *int      `json:"seed" binding:"omitempty,gte=0"`
	Tools            []struct {
		Type     string `json:"type" binding:"required,eq=function"`
		Function struct {
			Name        string      `json:"name" binding:"required"`
			Description string      `json:"description,omitempty"`
			Parameters  interface{} `json:"parameters,omitempty"`
		} `json:"function" binding:"required"`
	} `json:"tools,omitempty"`
	ToolChoice interface{} `json:"tool_choice,omitempty"`
}

const aiRPMLimit = 30

// ChatWithTWCC is the controller for POST /api/v1/ai/chat/twai
func ChatWithTWCC(c *gin.Context) {
	chatWithTWCC(c, false)
}

// ChatWithHackathonTools is the controller for POST /api/v1/ai/chat.
func ChatWithHackathonTools(c *gin.Context) {
	chatWithTWCC(c, true)
}

func chatWithTWCC(c *gin.Context, includeRegistryTools bool) {
	var input AIChatInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status": "error",
			"error_code": "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}

	cacheKey := aiCacheIdentifier(c)
	if limited := enforceAIRateLimit(c, cacheKey); limited {
		return
	}

	// 1. Session ID Management
	sessionID := input.SessionID
	if sessionID == "" {
		sessionID = "session_" + util.GenerateRandomString(10)
	}
	sessionID = html.EscapeString(sessionID)

	// 2. Prepare AI Request
	_, accountID, _, _, _ := util.GetUserInfoFromContext(c)
	req := ai.AIChatRequest{
		SessionID: sessionID,
		UserID:    fmt.Sprintf("%d", accountID),
		IPAddress: c.ClientIP(),
		Messages:  input.ToServiceMessages(),
	}

	// 3. Prepare Dynamic Options
	options := input.ToCallOptions()
	if includeRegistryTools && len(input.Tools) == 0 {
		options = append(options, llms.WithTools(registryToolDefinitions()))
	}

	// 4. Handle Streaming Response
	if input.Stream {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Connection", "keep-alive")

		// Add Streaming Callback
		options = append(options, llms.WithStreamingFunc(func(ctx context.Context, chunk []byte) error {
			if string(chunk) == ": heartbeat\n\n" {
				return nil
			}
			_, err := c.Writer.Write(chunk)
			if err != nil {
				return err
			}
			c.Writer.Flush()
			return nil
		}))

		_, err := ai.ChatWithTWCC(c.Request.Context(), req, options...)
		if err != nil {
			if !c.Writer.Written() {
				c.JSON(http.StatusInternalServerError, gin.H{
					"status": "error",
					"error_code": "AI_SERVICE_STREAM_ERROR",
					"message": err.Error(),
				})
			}
		}
		return
	}

	// 5. Standard Non-Streaming Response
	logEntry, err := ai.ChatWithTWCC(c.Request.Context(), req, options...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status": "error",
			"error_code": "AI_SERVICE_ERROR",
			"message": err.Error(),
		})
		return
	}

	response := gin.H{
		"status": "success",
		"data": gin.H{
			"session":     logEntry.SessionID,
			"content":     logEntry.Answer,
			"usage": gin.H{
				"input_tokens":  logEntry.InputTokens,
				"output_tokens": logEntry.OutputTokens,
				"total_tokens":  logEntry.TotalTokens,
			},
			"tool_used":   logEntry.ToolUsed,
			"latency_ms":  logEntry.LatencyMS,
			"model":       logEntry.Model,
			"provider":    logEntry.Provider,
			"cached":      false,
		},
	}
	cacheAIResponse(cacheKey, response)
	c.JSON(http.StatusOK, response)
}

func GetHackathonDecisions(c *gin.Context) {
	scenarioID := c.DefaultQuery("scenario_id", "001")
	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data":   aitools.GenerateDecisionsPayload(scenarioID),
	})
}

func GetHackathonSideEffects(c *gin.Context) {
	decisionID := c.DefaultQuery("decision_id", "d001")
	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data":   aitools.VisualizeSideEffectsPayload(decisionID),
	})
}

func GenerateHackathonBriefing(c *gin.Context) {
	var input struct {
		ScenarioID string `json:"scenario_id"`
		City       string `json:"city"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status": "error",
			"error_code": "INVALID_REQUEST",
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data":   aitools.GenerateBriefingPayload(input.ScenarioID, input.City),
	})
}

func registryToolDefinitions() []llms.Tool {
	definitions := aitools.Definitions()
	output := make([]llms.Tool, 0, len(definitions))
	for _, tool := range definitions {
		output = append(output, llms.Tool{
			Type: "function",
			Function: &llms.FunctionDefinition{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  tool.InputSchema,
			},
		})
	}
	return output
}

func enforceAIRateLimit(c *gin.Context, cacheKey string) bool {
	if cache.Redis == nil {
		return false
	}

	now := time.Now().UnixNano()
	rateKey := fmt.Sprintf("AI_RPM:%s", cacheKey)
	windowStart := now - time.Minute.Nanoseconds()
	if _, err := cache.Redis.ZRemRangeByScore(rateKey, "0", fmt.Sprint(windowStart)).Result(); err != nil {
		return false
	}

	count, err := cache.Redis.ZCard(rateKey).Result()
	if err != nil {
		return false
	}
	if count >= aiRPMLimit {
		if writeCachedAIResponse(c, cacheKey) {
			return true
		}
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
			"status": "error",
			"error_code": "AI_RATE_LIMITED",
			"message": "AI request limit exceeded and no cached response is available.",
		})
		return true
	}

	cache.Redis.ZAddNX(rateKey, redis.Z{Score: float64(now), Member: now})
	cache.Redis.Expire(rateKey, time.Minute)
	return false
}

func cacheAIResponse(cacheKey string, response gin.H) {
	if cache.Redis == nil {
		return
	}
	raw, err := json.Marshal(response)
	if err != nil {
		return
	}
	cache.Redis.Set(fmt.Sprintf("AI_LAST_RESPONSE:%s", cacheKey), raw, 5*time.Minute)
}

func writeCachedAIResponse(c *gin.Context, cacheKey string) bool {
	raw, err := cache.Redis.Get(fmt.Sprintf("AI_LAST_RESPONSE:%s", cacheKey)).Result()
	if err != nil {
		return false
	}

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return false
	}
	if data, ok := payload["data"].(map[string]interface{}); ok {
		data["cached"] = true
		payload["data"] = data
	}
	c.JSON(http.StatusOK, payload)
	return true
}

func aiCacheIdentifier(c *gin.Context) string {
	user := c.GetString("user")
	if user != "" {
		return html.EscapeString(user)
	}
	return html.EscapeString(c.ClientIP())
}

// ToServiceMessages converts input messages to langchaingo internal format
func (input *AIChatInput) ToServiceMessages() []llms.MessageContent {
	serviceMsgs := make([]llms.MessageContent, 0)
	for _, m := range input.Messages {
		role := llms.ChatMessageTypeHuman
		var parts []llms.ContentPart
		parts = append(parts, llms.TextContent{Text: m.Content})

		switch m.Role {
		case "assistant":
			role = llms.ChatMessageTypeAI
			if len(m.ToolCalls) > 0 {
				for _, tc := range m.ToolCalls {
					parts = append(parts, llms.ToolCall{
						ID:   tc.ID,
						Type: tc.Type,
						FunctionCall: &llms.FunctionCall{
							Name:      tc.Function.Name,
							Arguments: tc.Function.Arguments,
						},
					})
				}
			}
		case "system":
			role = llms.ChatMessageTypeSystem
		case "tool":
			role = llms.ChatMessageTypeTool
			parts = []llms.ContentPart{llms.ToolCallResponse{
				ToolCallID: m.ToolCallID,
				Content:    m.Content,
			}}
		}

		serviceMsgs = append(serviceMsgs, llms.MessageContent{
			Role:  role,
			Parts: parts,
		})
	}
	return serviceMsgs
}

// ToCallOptions extracts and maps AI generation options and tools
func (input *AIChatInput) ToCallOptions() []llms.CallOption {
	options := make([]llms.CallOption, 0)
	params := make(map[string]interface{})

	// Map numerical parameters
	if input.MaxNewTokens != nil {
		options = append(options, llms.WithMaxTokens(*input.MaxNewTokens))
		params["max_new_tokens"] = *input.MaxNewTokens
	}
	if input.Temperature != nil {
		options = append(options, llms.WithTemperature(*input.Temperature))
		params["temperature"] = *input.Temperature
	}
	if input.TopP != nil {
		options = append(options, llms.WithTopP(*input.TopP))
		params["top_p"] = *input.TopP
	}
	if input.TopK != nil {
		options = append(options, llms.WithTopK(*input.TopK))
		params["top_k"] = *input.TopK
	}
	if input.FrequencePenalty != nil {
		options = append(options, llms.WithRepetitionPenalty(*input.FrequencePenalty))
		params["frequence_penalty"] = *input.FrequencePenalty
	}
	if len(input.StopSequences) > 0 {
		options = append(options, llms.WithStopWords(input.StopSequences))
		params["stop_sequences"] = input.StopSequences
	}
	if input.Seed != nil {
		params["seed"] = *input.Seed
	}

	// Map Tools
	if len(input.Tools) > 0 {
		lt := make([]llms.Tool, 0)
		for _, t := range input.Tools {
			lt = append(lt, llms.Tool{
				Type: t.Type,
				Function: &llms.FunctionDefinition{
					Name:        t.Function.Name,
					Description: t.Function.Description,
					Parameters:  t.Function.Parameters,
				},
			})
		}
		options = append(options, llms.WithTools(lt))
		if input.ToolChoice != nil {
			options = append(options, llms.WithToolChoice(input.ToolChoice))
		}
	}

	if len(params) > 0 {
		options = append(options, llms.WithMetadata(params))
	}

	return options
}
