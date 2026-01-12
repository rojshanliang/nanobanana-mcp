# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NanoBanana MCP is a Model Context Protocol server that enables Claude Desktop/Code to use Google Gemini's multimodal capabilities for image generation, editing, and vision analysis.

## Build Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Development mode with hot reload (tsx watch)
npm run start        # Run compiled server
```

## Architecture

Single-file MCP server (`src/index.ts`) using stdio transport:

- **MCP SDK Integration**: Uses `@modelcontextprotocol/sdk` for server/transport
- **Dual Gemini SDKs**:
  - `@google/generative-ai` (`genAI`) - For chat operations
  - `@google/genai` (`genAINew`) - For image generation/editing with streaming

### Tools Exposed

| Tool | Model | Purpose |
|------|-------|---------|
| `set_aspect_ratio` | N/A | **Required before image generation/editing.** Set aspect ratio for session |
| `gemini_chat` | gemini-2.5-flash-image | Multi-turn conversation with up to 10 images |
| `gemini_generate_image` | gemini-2.5-flash-image | 2K image generation with consistency support |
| `gemini_edit_image` | gemini-2.5-flash-image | Image editing via natural language |
| `get_image_history` | N/A | View session image history |
| `clear_conversation` | N/A | Reset conversation context |

### Aspect Ratio (Required)

Valid values: `1:1`, `9:16`, `16:9`, `3:4`, `4:3`, `3:2`, `2:3`, `5:4`, `4:5`, `21:9`

Must call `set_aspect_ratio` before `gemini_generate_image` or `gemini_edit_image`. No default value - returns error if not set.

### Session Management

- `conversations` Map stores per-session context (chat history + image history + aspect ratio)
- Image history supports references: `"last"` or `"history:N"`
- `MAX_IMAGE_HISTORY = 10` images per session (memory management)
- `MAX_REFERENCE_IMAGES = 3` included in consistency prompts

### Generated Files

Default save location: `~/Documents/nanobanana_generated/`
- Generated: `generated_[timestamp].png`
- Edited: `[original]_edited_[timestamp].png`

## Configuration

### API Mode (双 API 模式)

NanoBanana MCP 支持两种 API 访问模式:

#### AI Studio 模式 (默认)
**用途**: 开发、测试、个人项目

**环境变量**:
```bash
API_MODE=ai_studio
GOOGLE_AI_API_KEY=your_ai_studio_api_key
```

**特点**:
- 快速设置,仅需 API Key
- 无需 GCP 项目
- 免费额度可用

#### Vertex AI 模式 (生产环境)
**用途**: 生产部署、企业应用

**环境变量**:
```bash
API_MODE=vertex_ai
VERTEX_AI_PROJECT=your-gcp-project-id
VERTEX_AI_LOCATION=us-central1  # 可选,默认 us-central1

# 认证方式 (二选一):
# 方式A: 服务账号密钥
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# 方式B: Application Default Credentials (ADC)
# 运行: gcloud auth application-default login
```

**特点**:
- 更高的速率限制和配额
- 生产级 SLA
- 高级监控和日志
- GCP 服务集成

#### 模型ID覆盖 (可选)

可通过环境变量覆盖默认模型:
```bash
CHAT_MODEL_ID=gemini-2.5-flash-image      # 聊天模型
IMAGE_MODEL_ID=gemini-2.5-flash-image     # 图像生成模型
```

### 认证方法对比

| 方法 | 复杂度 | 使用场景 | 安全性建议 |
|------|--------|----------|-----------|
| AI Studio API Key | 简单 | 开发/测试 | 存储在 `.env`,不要提交 |
| 服务账号密钥 | 中等 | 生产/CI/CD | 定期轮换,最小权限 |
| ADC | 高级 | 本地开发 | 使用个人 GCP 凭证 |

## Installation to Claude Code

### AI Studio 模式安装

```bash
source .env && claude mcp add nanobanana-mcp "node" "dist/index.js" \
  -e "GOOGLE_AI_API_KEY=$GOOGLE_AI_API_KEY"
```

### Vertex AI 模式安装

**使用服务账号密钥**:
```bash
source .env && claude mcp add nanobanana-mcp "node" "dist/index.js" \
  -e "API_MODE=vertex_ai" \
  -e "VERTEX_AI_PROJECT=$VERTEX_AI_PROJECT" \
  -e "VERTEX_AI_LOCATION=$VERTEX_AI_LOCATION" \
  -e "GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"
```

**使用 ADC (Application Default Credentials)**:
```bash
# 先进行 ADC 认证
gcloud auth application-default login

# 安装 MCP 服务器
source .env && claude mcp add nanobanana-mcp "node" "dist/index.js" \
  -e "API_MODE=vertex_ai" \
  -e "VERTEX_AI_PROJECT=$VERTEX_AI_PROJECT" \
  -e "VERTEX_AI_LOCATION=$VERTEX_AI_LOCATION"
```

### 验证安装

安装后,服务器启动时会在日志中显示当前 API 模式:
- AI Studio: `[INFO] Using AI Studio API with model: gemini-2.5-flash-image`
- Vertex AI: `[INFO] Using Vertex AI in project: your-project-id, location: us-central1`

