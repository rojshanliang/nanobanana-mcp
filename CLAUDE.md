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

### API Mode (Dual API Support)

NanoBanana MCP supports two API access modes:

#### AI Studio Mode (Default)
**Use Case**: Development, testing, personal projects

**Environment Variables**:
```bash
API_MODE=ai_studio
GOOGLE_AI_API_KEY=your_ai_studio_api_key
```

**Features**:
- Quick setup, only requires API Key
- No GCP project needed
- Free tier available

#### Vertex AI Mode (Production)
**Use Case**: Production deployment, enterprise applications

**Environment Variables**:
```bash
API_MODE=vertex
VERTEX_PROJECT_ID=your-gcp-project-id
VERTEX_LOCATION=us-central1  # Optional, default: us-central1

# Authentication (choose one):
# Option A: Service Account Key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Option B: Application Default Credentials (ADC)
# Run: gcloud auth application-default login
```

**Features**:
- Higher rate limits and quotas
- Production-grade SLA
- Advanced monitoring and logging
- GCP service integration

#### Model ID Override (Optional)

Override default models via environment variables:
```bash
AI_STUDIO_MODEL_ID=gemini-2.5-flash-image      # AI Studio model
VERTEX_MODEL_ID=gemini-2.5-flash-image         # Vertex AI model
```

### Authentication Methods Comparison

| Method | Complexity | Use Case | Security Recommendation |
|--------|------------|----------|-------------------------|
| AI Studio API Key | Simple | Development/Testing | Store in `.env`, don't commit |
| Service Account Key | Medium | Production/CI/CD | Rotate regularly, minimum permissions |
| ADC | Advanced | Local development | Use personal GCP credentials |

## Installation to Claude Code

### AI Studio Mode Installation

```bash
source .env && claude mcp add nanobanana-mcp "node" "dist/index.js" \
  -e "GOOGLE_AI_API_KEY=$GOOGLE_AI_API_KEY"
```

### Vertex AI Mode Installation

**Using Service Account Key**:
```bash
source .env && claude mcp add nanobanana-mcp "node" "dist/index.js" \
  -e "API_MODE=vertex" \
  -e "VERTEX_PROJECT_ID=$VERTEX_PROJECT_ID" \
  -e "VERTEX_LOCATION=$VERTEX_LOCATION" \
  -e "GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"
```

**Using ADC (Application Default Credentials)**:
```bash
# Authenticate with ADC first
gcloud auth application-default login

# Install MCP server
source .env && claude mcp add nanobanana-mcp "node" "dist/index.js" \
  -e "API_MODE=vertex" \
  -e "VERTEX_PROJECT_ID=$VERTEX_PROJECT_ID" \
  -e "VERTEX_LOCATION=$VERTEX_LOCATION"
```

### Verify Installation

After installation, the server will display the current API mode in startup logs:
- AI Studio: `[NanoBanana] Initialized in ai_studio mode (API Key: AIza****xyz)`
- Vertex AI: `[NanoBanana] Initialized in vertex mode (Project: your-project-id, Location: us-central1)`

