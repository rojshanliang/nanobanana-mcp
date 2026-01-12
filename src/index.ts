#!/usr/bin/env node

/**
 * @author RoyShan
 * NanoBanana MCP - Gemini Vision & Image Generation for Claude
 * Supports both Google AI Studio and Vertex AI
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { VertexAI } from "@google-cloud/vertexai";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import dotenv from "dotenv";

dotenv.config();

/**
 * API Mode Type Definition
 */
type ApiMode = 'ai_studio' | 'vertex';

/**
 * API Configuration Interface
 */
interface ApiConfig {
  mode: ApiMode;
  aiStudio?: {
    apiKey: string;
    modelId: string;
  };
  vertex?: {
    projectId: string;
    location: string;
    modelId: string;
    credentials?: string;
  };
}

// REST API call function for image generation/editing
interface GeminiImageRequestPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiImageResponse {
  imageData?: string;
  textResponse: string;
  error?: string;
}

/**
 * API Client Interface - Unified interface for both AI Studio and Vertex AI
 */
interface ApiClient {
  generateImage(parts: GeminiImageRequestPart[], aspectRatio: string): Promise<GeminiImageResponse>;
  chat(modelConfig: any, history: any[], messageParts: any[]): Promise<string>;
}

/**
 * Load and validate API configuration based on API_MODE environment variable
 * @returns {ApiConfig} Validated API configuration
 */
function loadApiConfig(): ApiConfig {
  const apiMode: ApiMode = (process.env.API_MODE as ApiMode) || 'ai_studio';

  if (apiMode === 'vertex') {
    const projectId = process.env.VERTEX_PROJECT_ID;
    if (!projectId) {
      console.error("Error: VERTEX_PROJECT_ID is required for Vertex AI mode");
      process.exit(1);
    }

    const config: ApiConfig = {
      mode: 'vertex',
      vertex: {
        projectId,
        location: process.env.VERTEX_LOCATION || 'us-central1',
        modelId: process.env.VERTEX_MODEL_ID || 'gemini-2.5-flash-image',
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      },
    };

    console.error(`[NanoBanana] Initialized in vertex mode (Project: ${projectId}, Location: ${config.vertex?.location})`);
    return config;
  } else {
    // Default: AI Studio mode
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.error("Error: GOOGLE_AI_API_KEY is required for AI Studio mode");
      process.exit(1);
    }

    const config: ApiConfig = {
      mode: 'ai_studio',
      aiStudio: {
        apiKey,
        modelId: process.env.AI_STUDIO_MODEL_ID || 'gemini-2.5-flash-image',
      },
    };

    // Mask API key for security
    const maskedKey = apiKey.length > 12
      ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`
      : '****';
    console.error(`[NanoBanana] Initialized in ai_studio mode (API Key: ${maskedKey})`);
    return config;
  }
}

/**
 * AI Studio API Client - Uses Google GenerativeAI SDK
 */
class AiStudioApiClient implements ApiClient {
  private genAI: GoogleGenerativeAI;
  private modelId: string;

  constructor(config: { apiKey: string; modelId: string }) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.modelId = config.modelId;
  }

  async generateImage(parts: GeminiImageRequestPart[], aspectRatio: string): Promise<GeminiImageResponse> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelId,
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: { aspectRatio },
        } as any,
      });

      const result = await model.generateContentStream({
        contents: [{ role: "user", parts: parts as Part[] }],
      });

      let imageData: string | undefined;
      let textParts: string[] = [];

      for await (const chunk of result.stream) {
        const parts = chunk?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            imageData = part.inlineData.data;
          } else if (part.text) {
            textParts.push(part.text);
          }
        }
      }

      return {
        imageData,
        textResponse: textParts.join(""),
      };
    } catch (error: any) {
      return {
        textResponse: "",
        error: error.message || String(error),
      };
    }
  }

  async chat(modelConfig: any, history: any[], messageParts: any[]): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelId,
      systemInstruction: modelConfig.systemInstruction,
    });

    const chat = model.startChat({
      history: history,
    });

    const result = await chat.sendMessage(messageParts);
    return result.response.text();
  }
}

/**
 * Vertex AI API Client - Uses Vertex AI SDK with response adapter
 */
class VertexApiClient implements ApiClient {
  private vertexAI: VertexAI;
  private modelId: string;
  private location: string;

  constructor(config: { projectId: string; location: string; modelId: string; credentials?: string }) {
    // Set credentials if provided
    if (config.credentials) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = config.credentials;
    }

    this.vertexAI = new VertexAI({
      project: config.projectId,
      location: config.location,
    });
    this.modelId = config.modelId;
    this.location = config.location;
  }

  async generateImage(parts: GeminiImageRequestPart[], aspectRatio: string): Promise<GeminiImageResponse> {
    try {
      const model = this.vertexAI.getGenerativeModel({
        model: this.modelId,
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: { aspectRatio },
        } as any,
      });

      const result = await model.generateContentStream({
        contents: [{ role: "user", parts: parts as any }],
      });

      let imageData: string | undefined;
      let textParts: string[] = [];

      for await (const chunk of result.stream) {
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if ((part as any).inlineData?.data) {
              imageData = (part as any).inlineData.data;
            } else if ((part as any).text) {
              textParts.push((part as any).text);
            }
          }
        }
      }

      return {
        imageData,
        textResponse: textParts.join(""),
      };
    } catch (error: any) {
      // Enhanced error handling with user-friendly messages
      let errMsg = error.message || String(error);

      if (error.code === 'NOT_FOUND' || errMsg.includes('404')) {
        errMsg = `Model not found. Please verify:\n` +
          `1. VERTEX_MODEL_ID="${this.modelId}" exists\n` +
          `2. VERTEX_LOCATION="${this.location}" has this model deployed`;
      } else if (errMsg.includes('429') || error.code === 'RESOURCE_EXHAUSTED') {
        errMsg = "Vertex AI quota exceeded. Please try again later or check your project quotas.";
      } else if (error.code === 'PERMISSION_DENIED') {
        errMsg = "Authentication failed. Please check:\n" +
          "1. GOOGLE_APPLICATION_CREDENTIALS points to valid key file\n" +
          "2. Or run: gcloud auth application-default login";
      }

      return {
        textResponse: "",
        error: errMsg,
      };
    }
  }

  async chat(modelConfig: any, history: any[], messageParts: any[]): Promise<string> {
    const model = this.vertexAI.getGenerativeModel({
      model: this.modelId,
      systemInstruction: modelConfig.systemInstruction,
    });

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(messageParts);
    const response = await result.response;
    return response.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}

/**
 * Factory function to create appropriate API client based on configuration
 */
function createApiClient(config: ApiConfig): ApiClient {
  if (config.mode === 'vertex') {
    return new VertexApiClient(config.vertex!);
  } else {
    return new AiStudioApiClient(config.aiStudio!);
  }
}

// Valid aspect ratio list
const VALID_ASPECT_RATIOS = [
  "1:1", "9:16", "16:9", "3:4", "4:3",
  "3:2", "2:3", "5:4", "4:5", "21:9"
] as const;
type AspectRatio = typeof VALID_ASPECT_RATIOS[number];

// Image history entry - maintains image consistency within a session
interface ImageHistoryEntry {
  id: string;
  filePath: string;
  base64Data: string;
  mimeType: string;
  prompt: string;
  timestamp: number;
  type: "generated" | "edited";
}

interface ConversationContext {
  history: Array<{
    role: "user" | "model";
    parts: Part[];
  }>;
  imageHistory: ImageHistoryEntry[];
  aspectRatio: AspectRatio | null;
}

const conversations = new Map<string, ConversationContext>();

// Maximum number of images in history (for memory management)
const MAX_IMAGE_HISTORY = 10;
// Maximum number of recent images to include in API requests
const MAX_REFERENCE_IMAGES = 3;

// Generate unique image ID
function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Add image to history
function addImageToHistory(
  context: ConversationContext,
  entry: ImageHistoryEntry
): void {
  context.imageHistory.push(entry);
  // Remove oldest entries if exceeding max count
  if (context.imageHistory.length > MAX_IMAGE_HISTORY) {
    context.imageHistory.shift();
  }
}

// Get image from history by reference ("last", "history:0", etc.)
function getImageFromHistory(
  context: ConversationContext,
  reference: string
): ImageHistoryEntry | null {
  if (!context.imageHistory?.length) return null;

  if (reference === 'last') {
    return context.imageHistory[context.imageHistory.length - 1];
  }

  const match = reference.match(/^history:(\d+)$/);
  if (match) {
    const index = parseInt(match[1], 10);
    return context.imageHistory[index] ?? null;
  }

  return null;
}

// Initialize/get conversation context
function getOrCreateContext(conversationId: string): ConversationContext {
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      history: [],
      imageHistory: [],
      aspectRatio: null,  // Must be set via set_aspect_ratio before image generation
    });
  }
  return conversations.get(conversationId)!;
}

async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);
  return imageBuffer.toString("base64");
}


async function saveImageFromBuffer(buffer: Buffer, outputPath: string): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(outputPath, buffer);
}


// Initialize API configuration and client
const apiConfig = loadApiConfig();
const apiClient = createApiClient(apiConfig);

const server = new Server(
  {
    name: "nanobanana-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "gemini_chat",
        description: "Chat with Gemini 2.5 Flash model. Supports multi-turn conversations with up to 10 reference images.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "The message to send to Gemini",
            },
            images: {
              type: "array",
              items: { type: "string" },
              description: "Array of image paths to include in the chat (max 10). Supports file paths, 'last', or 'history:N' references.",
              maxItems: 10,
            },
            conversation_id: {
              type: "string",
              description: "Optional conversation ID for maintaining context and accessing image history",
            },
            system_prompt: {
              type: "string",
              description: "Optional system prompt to guide the model's behavior",
            },
          },
          required: ["message"],
        },
      },
      {
        name: "gemini_generate_image",
        description: "Generate images using Gemini's image generation capabilities. Supports session-based image consistency for maintaining style/character across multiple generations.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Description of the image to generate",
            },
            aspect_ratio: {
              type: "string",
              enum: [...VALID_ASPECT_RATIOS],
              description: "Aspect ratio for the generated image. Overrides session setting if provided.",
            },
            output_path: {
              type: "string",
              description: "Optional path where to save the generated image. If not provided, saves to ~/Documents/nanobanana_generated/",
            },
            conversation_id: {
              type: "string",
              description: "Session ID for maintaining image history and consistency across generations",
            },
            use_image_history: {
              type: "boolean",
              description: "If true, includes previous generated images from this session for style/character consistency",
            },
            reference_images: {
              type: "array",
              items: { type: "string" },
              description: "Array of file paths to reference images for style/character consistency",
            },
            enable_google_search: {
              type: "boolean",
              description: "Enable Google Search for real-world reference grounding",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "gemini_edit_image",
        description: "Edit or modify existing images based on prompts. Supports session history references ('last' or 'history:N') and image consistency features.",
        inputSchema: {
          type: "object",
          properties: {
            image_path: {
              type: "string",
              description: "Path to the original image. Use 'last' for most recent generated image, or 'history:N' (e.g., 'history:0') to reference by index",
            },
            edit_prompt: {
              type: "string",
              description: "Instructions for how to edit the image",
            },
            aspect_ratio: {
              type: "string",
              enum: [...VALID_ASPECT_RATIOS],
              description: "Aspect ratio for the edited image. Overrides session setting if provided.",
            },
            output_path: {
              type: "string",
              description: "Optional output path. If not provided, saves to ~/Documents/nanobanana_generated/",
            },
            conversation_id: {
              type: "string",
              description: "Session ID for accessing image history and maintaining consistency",
            },
            reference_images: {
              type: "array",
              items: { type: "string" },
              description: "Additional reference images for style consistency (max 10). Supports file paths, 'last', or 'history:N' references.",
              maxItems: 10,
            },
            enable_google_search: {
              type: "boolean",
              description: "Enable Google Search for real-world reference grounding",
            },
          },
          required: ["image_path", "edit_prompt"],
        },
      },
      {
        name: "get_image_history",
        description: "Get the list of generated/edited images in a session for reference",
        inputSchema: {
          type: "object",
          properties: {
            conversation_id: {
              type: "string",
              description: "The session ID to get image history for",
            },
          },
          required: ["conversation_id"],
        },
      },
      {
        name: "clear_conversation",
        description: "Clear conversation history for a specific conversation ID",
        inputSchema: {
          type: "object",
          properties: {
            conversation_id: {
              type: "string",
              description: "The conversation ID to clear",
            },
          },
          required: ["conversation_id"],
        },
      },
      {
        name: "set_aspect_ratio",
        description: "Set the aspect ratio for subsequent image generation and editing in this session. Must be called before generating/editing images if a specific ratio is desired.",
        inputSchema: {
          type: "object",
          properties: {
            aspect_ratio: {
              type: "string",
              enum: [...VALID_ASPECT_RATIOS],
              description: "The aspect ratio to use for image generation/editing",
            },
            conversation_id: {
              type: "string",
              description: "Session ID to apply this setting to (default: 'default')",
            },
          },
          required: ["aspect_ratio"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "gemini_chat": {
        const { message, conversation_id = "default", system_prompt, images = [] } = args as any;

        const context = getOrCreateContext(conversation_id);

        // Build message parts with images (max 10)
        const messageParts: Part[] = [{ text: message }];
        const imageRefs = (images as string[]).slice(0, 10);
        const failedImages: Array<{ path: string; reason: string }> = [];

        for (const imgRef of imageRefs) {
          try {
            // Check for history reference
            const historyImage = getImageFromHistory(context, imgRef);
            if (historyImage) {
              messageParts.push({
                inlineData: {
                  mimeType: historyImage.mimeType,
                  data: historyImage.base64Data,
                },
              });
            } else {
              // File path
              let resolvedPath = imgRef;
              if (!path.isAbsolute(resolvedPath)) {
                resolvedPath = path.join(process.cwd(), resolvedPath);
              }
              // Try alternative path if not found
              try {
                await fs.access(resolvedPath);
              } catch {
                const homeDir = os.homedir();
                const altPath = path.join(homeDir, 'Documents', 'nanobanana_generated', path.basename(imgRef));
                await fs.access(altPath);
                resolvedPath = altPath;
              }
              const base64 = await imageToBase64(resolvedPath);
              messageParts.push({
                inlineData: {
                  mimeType: "image/png",
                  data: base64,
                },
              });
            }
          } catch (error) {
            failedImages.push({
              path: imgRef,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Add user message to history
        context.history.push({
          role: "user",
          parts: messageParts,
        });

        // Start chat with history using API client
        const text = await apiClient.chat(
          { systemInstruction: system_prompt },
          context.history.slice(0, -1),
          messageParts
        );

        // Add model response to history
        context.history.push({
          role: "model",
          parts: [{ text }],
        });

        const imageCount = messageParts.length - 1;
        let responseText = imageCount > 0
          ? `[${imageCount} image(s) included]\n\n${text}`
          : text;

        if (failedImages.length > 0) {
          responseText += `\n\nWarning: ${failedImages.length} image(s) could not be loaded:\n`;
          responseText += failedImages.map(f => `  - ${f.path}: ${f.reason}`).join('\n');
        }

        return {
          content: [{ type: "text", text: responseText }],
        };
      }

      case "gemini_generate_image": {
        const {
          prompt,
          aspect_ratio,
          output_path,
          conversation_id = "default",
          use_image_history = false,
          reference_images = [],
        } = args as any;

        try {
          // Get/create conversation context
          const context = getOrCreateContext(conversation_id);

          // Validate directly passed aspect_ratio
          if (aspect_ratio && !VALID_ASPECT_RATIOS.includes(aspect_ratio as AspectRatio)) {
            return {
              content: [{
                type: "text",
                text: `Invalid aspect ratio: ${aspect_ratio}. Valid: ${VALID_ASPECT_RATIOS.join(", ")}`,
              }],
              isError: true,
            };
          }

          // Priority: direct param > session setting
          const effectiveAspectRatio = aspect_ratio ?? context.aspectRatio;

          // aspectRatio 필수 체크 (둘 다 없으면 에러)
          if (effectiveAspectRatio === null) {
            return {
              content: [{
                type: "text",
                text: `Error: Aspect ratio not specified. Either pass aspect_ratio parameter or call set_aspect_ratio first.\nValid ratios: ${VALID_ASPECT_RATIOS.join(", ")}`,
              }],
              isError: true,
            };
          }

          // contents 구성: 참조 이미지 + 히스토리 이미지 + 프롬프트
          const parts: GeminiImageRequestPart[] = [];
          const failedReferenceImages: Array<{ path: string; reason: string }> = [];

          // 1. 수동 지정 참조 이미지 추가
          if (reference_images && reference_images.length > 0) {
            for (const imgPath of reference_images) {
              try {
                let resolvedPath = imgPath;
                if (!path.isAbsolute(resolvedPath)) {
                  resolvedPath = path.join(process.cwd(), resolvedPath);
                }
                const base64 = await imageToBase64(resolvedPath);
                parts.push({
                  inlineData: {
                    mimeType: "image/png",
                    data: base64,
                  },
                });
              } catch (error) {
                failedReferenceImages.push({
                  path: imgPath,
                  reason: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }

          // 2. 히스토리 이미지 추가 (일관성 유지용)
          if (use_image_history && context.imageHistory.length > 0) {
            const recentImages = context.imageHistory.slice(-MAX_REFERENCE_IMAGES);
            for (const img of recentImages) {
              parts.push({
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.base64Data,
                },
              });
            }
          }

          // 3. 프롬프트 추가 (히스토리 이미지가 있으면 일관성 유지 지시 추가)
          let finalPrompt = prompt;
          if (use_image_history && context.imageHistory.length > 0) {
            finalPrompt = `${prompt}\n\nIMPORTANT: Maintain visual consistency with the provided reference images (same style, character appearance, color palette).`;
          }
          parts.push({ text: finalPrompt });

          // Call API client for image generation
          const apiResponse = await apiClient.generateImage(parts, effectiveAspectRatio);

          if (apiResponse.error) {
            return {
              content: [{
                type: "text",
                text: `Image generation failed: ${apiResponse.error}\n${apiResponse.textResponse}`,
              }],
              isError: true,
            };
          }

          if (!apiResponse.imageData) {
            return {
              content: [{
                type: "text",
                text: `Image generation failed.\nPrompt: "${prompt}"\n` +
                      (apiResponse.textResponse ? `Model response: ${apiResponse.textResponse}` : 'No image returned from model'),
              }],
              isError: true,
            };
          }

          // Determine output path - always ensure PNG extension
          let finalPath = output_path;
          if (!finalPath) {
            const homeDir = os.homedir();
            const tempDir = path.join(homeDir, 'Documents', 'nanobanana_generated');
            await fs.mkdir(tempDir, { recursive: true });
            const filename = `generated_${Date.now()}.png`;
            finalPath = path.join(tempDir, filename);
          } else {
            if (!path.isAbsolute(finalPath)) {
              finalPath = path.join(process.cwd(), finalPath);
            }
            if (!finalPath.toLowerCase().endsWith('.png')) {
              finalPath = finalPath.replace(/\.[^/.]+$/, '') + '.png';
            }
          }

          // Save image
          const buffer = Buffer.from(apiResponse.imageData, 'base64');
          await saveImageFromBuffer(buffer, finalPath);

          // 생성된 이미지를 히스토리에 저장
          addImageToHistory(context, {
            id: generateImageId(),
            filePath: finalPath,
            base64Data: apiResponse.imageData,
            mimeType: "image/png",
            prompt: prompt,
            timestamp: Date.now(),
            type: "generated",
          });

          let successText = `Image generated successfully!\n` +
                `Prompt: "${prompt}"\n` +
                `Saved to: ${finalPath}\n` +
                `Session: ${conversation_id} (history: ${context.imageHistory.length} images)`;

          if (failedReferenceImages.length > 0) {
            successText += `\n\nWarning: ${failedReferenceImages.length} reference image(s) could not be loaded:\n`;
            successText += failedReferenceImages.map(f => `  - ${f.path}: ${f.reason}`).join('\n');
          }

          if (apiResponse.textResponse) {
            successText += `\n\nModel response: ${apiResponse.textResponse}`;
          }

          return {
            content: [{ type: "text", text: successText }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error generating image: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      }

      case "gemini_edit_image": {
        const {
          image_path,
          edit_prompt,
          aspect_ratio,
          output_path,
          conversation_id = "default",
          reference_images = [],
        } = args as any;

        try {
          // Get/create conversation context
          const context = getOrCreateContext(conversation_id);

          // Validate directly passed aspect_ratio
          if (aspect_ratio && !VALID_ASPECT_RATIOS.includes(aspect_ratio as AspectRatio)) {
            return {
              content: [{
                type: "text",
                text: `Invalid aspect ratio: ${aspect_ratio}. Valid: ${VALID_ASPECT_RATIOS.join(", ")}`,
              }],
              isError: true,
            };
          }

          // Priority: direct param > session setting
          const effectiveAspectRatio = aspect_ratio ?? context.aspectRatio;

          // aspectRatio 필수 체크 (둘 다 없으면 에러)
          if (effectiveAspectRatio === null) {
            return {
              content: [{
                type: "text",
                text: `Error: Aspect ratio not specified. Either pass aspect_ratio parameter or call set_aspect_ratio first.\nValid ratios: ${VALID_ASPECT_RATIOS.join(", ")}`,
              }],
              isError: true,
            };
          }

          // 히스토리 참조 확인 ("last", "history:N")
          let resolvedImagePath = image_path;
          let imageBase64: string;

          const historyImage = getImageFromHistory(context, image_path);
          if (historyImage) {
            // 히스토리에서 이미지 가져오기
            resolvedImagePath = historyImage.filePath;
            imageBase64 = historyImage.base64Data;
          } else {
            // 파일 경로로 처리
            if (!path.isAbsolute(resolvedImagePath)) {
              resolvedImagePath = path.join(process.cwd(), resolvedImagePath);
            }

            // Check if file exists
            try {
              await fs.access(resolvedImagePath);
            } catch {
              // If file doesn't exist in CWD, try in Documents/nanobanana_generated
              const homeDir = os.homedir();
              const altPath = path.join(homeDir, 'Documents', 'nanobanana_generated', path.basename(image_path));
              try {
                await fs.access(altPath);
                resolvedImagePath = altPath;
              } catch {
                throw new Error(`Image file not found: ${image_path}. Use 'last' or 'history:N' to reference session images.`);
              }
            }

            // Read the original image
            imageBase64 = await imageToBase64(resolvedImagePath);
          }

          // contents 구성: 참조 이미지들 + 프롬프트 + 원본 이미지
          const parts: GeminiImageRequestPart[] = [];
          const failedReferenceImages: Array<{ path: string; reason: string }> = [];

          // 1. 추가 참조 이미지 (스타일 일관성용, 최대 10개)
          const refImages = (reference_images as string[] || []).slice(0, 10);
          for (const imgRef of refImages) {
            try {
              // Check for history reference
              const refHistoryImage = getImageFromHistory(context, imgRef);
              if (refHistoryImage) {
                parts.push({
                  inlineData: {
                    mimeType: refHistoryImage.mimeType,
                    data: refHistoryImage.base64Data,
                  },
                });
              } else {
                // File path
                let refPath = imgRef;
                if (!path.isAbsolute(refPath)) {
                  refPath = path.join(process.cwd(), refPath);
                }
                // Try alternative path if not found
                try {
                  await fs.access(refPath);
                } catch {
                  const homeDir = os.homedir();
                  const altPath = path.join(homeDir, 'Documents', 'nanobanana_generated', path.basename(imgRef));
                  await fs.access(altPath);
                  refPath = altPath;
                }
                const refBase64 = await imageToBase64(refPath);
                parts.push({
                  inlineData: {
                    mimeType: "image/png",
                    data: refBase64,
                  },
                });
              }
            } catch (error) {
              failedReferenceImages.push({
                path: imgRef,
                reason: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // 2. 편집 프롬프트
          const editingPrompt = `Based on this image, generate a new edited version with the following modifications: ${edit_prompt}

IMPORTANT: Create a completely new image that incorporates the requested changes while maintaining the style and overall composition of the original.`;
          parts.push({ text: editingPrompt });

          // 3. 원본 이미지
          parts.push({
            inlineData: {
              mimeType: "image/png",
              data: imageBase64,
            },
          });

          // Call API client for image generation
          const apiResponse = await apiClient.generateImage(parts, effectiveAspectRatio);

          if (apiResponse.error) {
            return {
              content: [{
                type: "text",
                text: `Image editing failed: ${apiResponse.error}\n${apiResponse.textResponse}`,
              }],
              isError: true,
            };
          }

          if (!apiResponse.imageData) {
            return {
              content: [{
                type: "text",
                text: `Image editing failed.\nOriginal: ${image_path}\nEdit request: "${edit_prompt}"\n` +
                      (apiResponse.textResponse ? `Model response: ${apiResponse.textResponse}` : 'No image returned from model'),
              }],
              isError: true,
            };
          }

          // Determine output path - ensure PNG extension for edited images
          let finalPath = output_path;
          if (!finalPath) {
            const origName = historyImage ? `history_${historyImage.id}` : path.parse(image_path).name;
            const homeDir = os.homedir();
            const tempDir = path.join(homeDir, 'Documents', 'nanobanana_generated');
            await fs.mkdir(tempDir, { recursive: true });
            const filename = `${origName}_edited_${Date.now()}.png`;
            finalPath = path.join(tempDir, filename);
          } else {
            if (!path.isAbsolute(finalPath)) {
              finalPath = path.join(process.cwd(), finalPath);
            }
            if (!finalPath.toLowerCase().endsWith('.png')) {
              finalPath = finalPath.replace(/\.[^/.]+$/, '') + '.png';
            }
          }

          // Save image
          const buffer = Buffer.from(apiResponse.imageData, 'base64');
          await saveImageFromBuffer(buffer, finalPath);

          // 편집된 이미지를 히스토리에 저장
          addImageToHistory(context, {
            id: generateImageId(),
            filePath: finalPath,
            base64Data: apiResponse.imageData,
            mimeType: "image/png",
            prompt: edit_prompt,
            timestamp: Date.now(),
            type: "edited",
          });

          let successText = `Image edited successfully!\n` +
                `Original: ${historyImage ? `[${image_path}] ${resolvedImagePath}` : resolvedImagePath}\n` +
                `Edit request: "${edit_prompt}"\n` +
                `Saved to: ${finalPath}\n` +
                `Session: ${conversation_id} (history: ${context.imageHistory.length} images)`;

          if (failedReferenceImages.length > 0) {
            successText += `\n\nWarning: ${failedReferenceImages.length} reference image(s) could not be loaded:\n`;
            successText += failedReferenceImages.map(f => `  - ${f.path}: ${f.reason}`).join('\n');
          }

          if (apiResponse.textResponse) {
            successText += `\n\nModel response: ${apiResponse.textResponse}`;
          }

          return {
            content: [{ type: "text", text: successText }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error editing image: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      }

      case "get_image_history": {
        const { conversation_id } = args as any;

        const context = conversations.get(conversation_id);
        if (!context || !context.imageHistory?.length) {
          return {
            content: [
              {
                type: "text",
                text: `No image history found for session: ${conversation_id}`,
              },
            ],
          };
        }

        const historyInfo = context.imageHistory.map((img, index) => ({
          index,
          reference: `history:${index}`,
          id: img.id,
          filePath: img.filePath,
          prompt: img.prompt,
          type: img.type,
          timestamp: new Date(img.timestamp).toISOString(),
        }));

        return {
          content: [
            {
              type: "text",
              text: `Image History for session "${conversation_id}" (${context.imageHistory.length} images):\n\n` +
                    `Use "last" to reference the most recent image, or "history:N" (e.g., "history:0") to reference by index.\n\n` +
                    JSON.stringify(historyInfo, null, 2),
            },
          ],
        };
      }

      case "clear_conversation": {
        const { conversation_id } = args as any;
        conversations.delete(conversation_id);

        return {
          content: [
            {
              type: "text",
              text: `Conversation history cleared for ID: ${conversation_id}`,
            },
          ],
        };
      }

      case "set_aspect_ratio": {
        const { aspect_ratio, conversation_id = "default" } = args as any;

        // Validate aspect ratio
        if (!VALID_ASPECT_RATIOS.includes(aspect_ratio as AspectRatio)) {
          return {
            content: [{
              type: "text",
              text: `Invalid aspect ratio: ${aspect_ratio}. Valid: ${VALID_ASPECT_RATIOS.join(", ")}`,
            }],
            isError: true,
          };
        }

        const context = getOrCreateContext(conversation_id);
        context.aspectRatio = aspect_ratio as AspectRatio;

        return {
          content: [{
            type: "text",
            text: `✓ Aspect ratio set to ${aspect_ratio} for session: ${conversation_id}\nThis will apply to both image generation and editing.`,
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gemini MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});