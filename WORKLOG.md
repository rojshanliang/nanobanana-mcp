# WORKLOG

## [2026-01-12] docs: 修复文档中的环境变量名称和语言错误

### 修复内容
**作者**: RoyShan

#### 文档错误修正
- **README.md**: 修正所有环境变量名称
  - `VERTEX_AI_PROJECT` → `VERTEX_PROJECT_ID`
  - `VERTEX_AI_LOCATION` → `VERTEX_LOCATION`
  - `API_MODE=vertex_ai` → `API_MODE=vertex`
  - `CHAT_MODEL_ID`/`IMAGE_MODEL_ID` → `AI_STUDIO_MODEL_ID`/`VERTEX_MODEL_ID`
- **CLAUDE.md**: 全文英文化并修正环境变量
  - 将所有中文注释转换为英文
  - 修正安装命令中的环境变量名称
  - 更新启动日志示例以匹配实际输出

#### 影响范围
- 文档与代码实现完全一致
- 用户配置参考正确性提升

---

## [2026-01-12] feat: 实现 AI Studio 与 Vertex AI 双 API 模式支持

### 主要变更
**作者**: RoyShan

#### 1. 核心架构重构
- **API 抽象层**: 实现 `ApiClient` 接口，支持策略模式
- **AiStudioApiClient**: 封装 Google AI Studio SDK 调用
- **VertexApiClient**: 集成 Vertex AI SDK，包含响应适配器和错误处理增强
- **工厂模式**: `createApiClient()` 根据配置动态创建客户端

#### 2. 环境变量系统
- **双模式支持**: `API_MODE=ai_studio|vertex`
- **AI Studio 配置**:
  - `GOOGLE_AI_API_KEY` (必填)
  - `AI_STUDIO_MODEL_ID` (可选，默认 gemini-2.5-flash-image)
- **Vertex AI 配置**:
  - `VERTEX_PROJECT_ID` (必填)
  - `VERTEX_LOCATION` (可选，默认 us-central1)
  - `VERTEX_MODEL_ID` (可选)
  - `GOOGLE_APPLICATION_CREDENTIALS` (可选，支持 ADC)

#### 3. 向后兼容性
- 默认 `API_MODE=ai_studio`
- 现有用户无需修改配置
- 启动时显示当前模式和脱敏凭证

#### 4. 安全增强
- 更新 `.gitignore` 防止密钥文件泄露
- API Key 日志脱敏显示
- Vertex 认证支持密钥文件和 ADC 双模式

#### 5. 错误处理优化
- gRPC 错误包装为人性化提示
- 区域不匹配、配额超限、认证失败的明确提示
- 404 错误提供详细的故障排除建议

#### 6. 代码质量
- 所有韩文注释已英文化
- 文件头添加 `@author RoyShan` 标记
- TypeScript 类型定义完整
- 构建无警告通过

#### 7. 依赖更新
- 新增 `@google-cloud/vertexai@^1.10.0`
- 版本升级至 `1.1.0`

### 测试验证
✅ AI Studio 模式启动成功
✅ Vertex AI 模式启动成功
✅ 环境变量验证正常
✅ 向后兼容性测试通过
✅ TypeScript 编译成功

### 文件变更
- `src/index.ts`: 核心重构 (~300 行新增/修改)
- `package.json`: 依赖和版本更新
- `.env.example`: 新建完整配置模板
- `.gitignore`: 安全规则加固
- `README.md`: 全面更新 API 配置章节
- `CLAUDE.md`: 更新环境变量说明

---

## [2026-01-12] docs: 更新文档以支持双 API 模式 (AI Studio & Vertex AI)

### 更新内容

#### README.md
1. **Quick Start 章节**:
   - 添加 API 访问方式选择 (AI Studio vs Vertex AI)
   - 更新安装说明,引导用户选择 API 模式

2. **新增 API Configuration 章节**:
   - **Mode 1: AI Studio** - 开发和个人使用模式
     - 快速设置指南
     - API Key 获取步骤
     - 优势和限制说明
   - **Mode 2: Vertex AI** - 生产和企业模式
     - 完整配置说明
     - 认证方式对比
     - 企业级特性介绍

3. **环境变量参考表**:
   - 完整的环境变量列表
   - 必需/可选标记
   - 默认值说明
   - 使用场景说明

4. **认证方法对比**:
   - AI Studio API Key
   - 服务账号密钥 (Service Account)
   - ADC (Application Default Credentials)
   - 安全性建议

5. **Vertex AI Setup Guide**:
   - Step 1: 启用 Vertex AI API
   - Step 2: 选择认证方法
     - 选项A: 服务账号 (生产环境推荐)
     - 选项B: ADC (本地开发)
   - Step 3: 验证配置
   - Step 4: 配置 Claude Desktop/Code
   - 完整的 gcloud 命令示例

6. **Troubleshooting API Configuration**:
   - AI Studio 问题排查
     - API key 无效
     - 配额超限
   - Vertex AI 问题排查
     - 项目未找到/权限拒绝
     - API 未启用
     - 区域不支持
     - 认证失败
   - 模式切换指南

7. **更新 Security 章节**:
   - 区分不同认证方式的安全建议
   - 服务账号密钥轮换
   - ADC 使用场景

8. **更新 Troubleshooting 章节**:
   - 引用详细的 API 配置故障排除指南
   - 按 API 模式分类的问题解决方案

#### CLAUDE.md
1. **Configuration 章节重构**:
   - **API Mode (双 API 模式)** 说明
   - AI Studio 模式配置
     - 环境变量示例
     - 特点说明
   - Vertex AI 模式配置
     - 环境变量示例
     - 认证方式对比
     - 特点说明
   - 模型ID覆盖配置

2. **认证方法对比表** (中文):
   - 复杂度评估
   - 使用场景
   - 安全性建议

3. **Installation to Claude Code 章节扩展**:
   - AI Studio 模式安装命令
   - Vertex AI 模式安装
     - 使用服务账号密钥
     - 使用 ADC
   - 验证安装指南
   - 日志输出示例

### 文档特点
- **双语支持**: README 英文,CLAUDE.md 中文
- **完整覆盖**: 涵盖开发到生产的完整流程
- **实操性强**: 提供完整的命令示例和配置模板
- **问题导向**: 详细的故障排除指南
- **安全意识**: 强调不同场景的安全最佳实践

### 文档结构
```
README.md (英文,面向公众)
├── Quick Start
│   └── Prerequisites (区分 AI 模式)
├── API Configuration ⭐ NEW
│   ├── Mode 1: AI Studio
│   ├── Mode 2: Vertex AI
│   ├── Environment Variables Reference
│   ├── Authentication Methods Comparison
│   ├── Vertex AI Setup Guide
│   └── Troubleshooting API Configuration
├── Available Tools
├── Security (更新)
└── Troubleshooting (更新)

CLAUDE.md (中文,面向开发者)
├── Configuration ⭐ UPDATED
│   ├── API Mode (双 API 模式)
│   ├── AI Studio 模式
│   ├── Vertex AI 模式
│   ├── 模型ID覆盖
│   └── 认证方法对比
└── Installation to Claude Code ⭐ UPDATED
    ├── AI Studio 模式安装
    ├── Vertex AI 模式安装
    └── 验证安装
```

### 技术要点
- 环境变量命名遵循实施计划规范
- 配置示例与代码实现保持一致
- 包含完整的 gcloud CLI 命令
- 支持的区域列表准确
- IAM 角色配置正确 (roles/aiplatform.user)

### 后续建议
1. 在 `.env.example` 中添加双模式配置模板
2. 考虑添加配置验证脚本 (validate-config.sh)
3. 为常见部署场景创建配置模板 (templates/)
