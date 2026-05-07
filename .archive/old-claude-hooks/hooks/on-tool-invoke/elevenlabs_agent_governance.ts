#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * HOOK: elevenlabs_agent_governance.js
 * EVENT: PreToolUse
 * PURPOSE: [DEV] prefix enforcement for ElevenLabs agents
 * ENFORCEMENT: BLOCKING
 *
 * ELEVENLABS AGENT GOVERNANCE SYSTEM
 * ==================================
 *
 * Mirrors the n8n workflow governance system for ElevenLabs voice agents.
 *
 * Core principles:
 * - Deletion BLOCKED (ElevenLabs MCP doesn't expose delete, but we track for audit)
 * - Archiving ENCOURAGED via phase tags
 * - Deployment phases: DEV, ALPHA, BETA, GA, PROD
 * - Only DEV agents can be modified
 * - Before creating, check for similar existing agents
 * - New agents auto-tagged as DEV
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const yaml = require('js-yaml');
const {logHook, readStdinJson, outputResult, getProjectRoot} = require('../hook_utils');

const PROJECT_ROOT = getProjectRoot();
const GOVERNANCE_PATH = path.join(PROJECT_ROOT, 'context', 'elevenlabs-agents', 'governance.yaml');

// Load API constraints configuration
function loadApiConstraints() {
  try {
    const configPath = path.join(__dirname, '../../config/elevenlabs-api-constraints.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error: unknown) {
    logHook('elevenlabs-governance', 'Failed to load API constraints', {error: (error as Error).message});
  }
  return null;
}

const apiConstraints = loadApiConstraints();

// Load model configuration from centralized config
function loadModelConfig() {
  try {
    const configPath = path.join(__dirname, '../../config/model-rankings.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error: unknown) {
    logHook('elevenlabs-governance', 'Failed to load model config', {error: (error as Error).message});
  }

  return {
    banned: ['gpt-5-mini', 'gpt-4o-mini', 'gemini-2.0-flash-001'],
    deprecated_aliases: {},
    enforced: {elevenlabs_agent: 'gemini-3-flash-preview'},
  };
}

const modelConfig = loadModelConfig();

/**
 * Check if LLM model is banned
 * @param {string} model - Model name
 * @returns {{banned: boolean, reason: string|null}}
 */
function checkLlmModelBanned(model) {
  if (!model) {
    return {banned: false};
  }

  const banned = modelConfig.banned || [];
  const aliases = modelConfig.deprecated_aliases || {};
  const enforced = modelConfig.enforced?.elevenlabs_agent || 'gemini-3-flash-preview';

  const modelLower = model.toLowerCase();

  for (const bannedModel of banned) {
    if (modelLower === bannedModel.toLowerCase()) {
      const aliasMessage = aliases[bannedModel] || `Use '${enforced}' instead.`;
      return {
        banned: true,
        reason: `'${model}' is deprecated. ${aliasMessage}`,
      };
    }
  }

  return {banned: false};
}

// PHASE SYSTEM FOR ELEVENLABS AGENTS:
// - ElevenLabs has NO tags, only name prefixes [DEV], [ALPHA], [BETA], [PROD], [ARCHIVED]
// - Only [DEV] agents can be modified by Claude
// - Non-DEV phases require explicit user approval
const PHASES = ['DEV', 'ALPHA', 'BETA', 'PROD', 'ARCHIVED'];
const MODIFIABLE_PHASES = ['DEV']; // Only DEV can be modified by Claude
const PROTECTED_PHASES = ['ALPHA', 'BETA', 'PROD', 'ARCHIVED']; // All non-DEV require user approval

// CRITICAL GOVERNANCE RULE:
// Only DEV phase can be auto-assigned by Claude
// Promotions beyond DEV REQUIRE EXPLICIT USER APPROVAL
// Claude CANNOT create/modify non-DEV agents without user explicitly saying so
const AUTO_ASSIGNABLE_PHASES = ['DEV'];

/**
 * Parse deployment phase from entity name
 * ElevenLabs agents don't have tags, so phase is encoded in name: "[DEV] Agent Name"
 */
function parsePhaseFromName(name) {
  if (!name) {
    return null;
  }

  const match = name.match(/^\[([A-Z]+)]\s+/);
  if (match && PHASES.includes(match[1])) {
    return match[1];
  }

  return null; // No phase tag found
}

/**
 * Check if name has proper phase prefix
 */
function hasPhasePrefix(name) {
  return parsePhaseFromName(name) !== null;
}

/**
 * Add phase prefix to name
 */
function addPhasePrefix(name, phase = 'DEV') {
  // Remove existing prefix if any
  const cleanName = name.replace(/^\[[A-Z]+]\s+/, '');
  return `[${phase}] ${cleanName}`;
}

/**
 * Ensure governance directory exists
 */
function ensureGovernanceDir() {
  const dir = path.dirname(GOVERNANCE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

/**
 * Load agent governance configuration
 */
function loadGovernance() {
  try {
    ensureGovernanceDir();
    if (fs.existsSync(GOVERNANCE_PATH)) {
      return yaml.load(fs.readFileSync(GOVERNANCE_PATH, 'utf8'));
    }
  } catch (error: unknown) {
    logHook('elevenlabs-governance', 'Failed to load governance.yaml', {error: (error as Error).message});
  }

  return {agents: {}, settings: {}};
}

/**
 * Save agent governance configuration
 */
function saveGovernance(governance) {
  try {
    ensureGovernanceDir();
    fs.writeFileSync(GOVERNANCE_PATH, yaml.dump(governance, {lineWidth: 120}));
    return true;
  } catch (error: unknown) {
    logHook('elevenlabs-governance', 'Failed to save governance.yaml', {error: (error as Error).message});
    return false;
  }
}

/**
 * Get agent phase from governance
 */
function getAgentPhase(agentId, agentName) {
  const governance = loadGovernance();

  // Check by ID first
  if (governance.agents?.[agentId]) {
    return governance.agents[agentId].phase || 'DEV';
  }

  // Check by name (fallback)
  if (governance.agents) {
    for (const [id, meta] of Object.entries(governance.agents) as [string, AgentMeta][]) {
      if (meta.name === agentName) {
        return meta.phase || 'DEV';
      }
    }
  }

  return undefined; // Not tracked yet
}

/**
 * Calculate similarity between two agent names/descriptions
 */
function calculateSimilarity(string1, string2) {
  if (!string1 || !string2) {
    return 0;
  }

  string1 = string1.toLowerCase().replaceAll(/[^a-z\d\s]/g, '');
  string2 = string2.toLowerCase().replaceAll(/[^a-z\d\s]/g, '');

  const words1 = new Set(string1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(string2.split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return Math.round((intersection / union) * 100);
}

/**
 * Find similar agents in governance
 */
type AgentMatch = {
  id: string; name: string; description?: string; similarity: number; phase: string;
};
type AgentMeta = {
  name: string; description?: string; system_prompt_snippet?: string; phase?: string;
};
function findSimilarAgents(name: string, systemPrompt = '') {
  const governance = loadGovernance();
  const searchText = `${name} ${systemPrompt}`;
  const matches: AgentMatch[] = [];

  if (governance.agents) {
    for (const [id, meta] of Object.entries(governance.agents) as [string, AgentMeta][]) {
      const agentText = `${meta.name} ${meta.description || ''} ${meta.system_prompt_snippet || ''}`;
      const score = calculateSimilarity(searchText, agentText);
      if (score >= 30) {
        matches.push({
          id,
          name: meta.name,
          description: meta.description,
          similarity: score,
          phase: meta.phase || 'DEV',
        });
      }
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Register a new agent in governance
 */
function registerAgent(agentId, name, systemPrompt = '', phase = 'DEV') {
  const governance = loadGovernance();

  governance.agents ||= {};

  governance.agents[agentId] = {
    name,
    phase,
    description: `Voice agent: ${name}`,
    system_prompt_snippet: systemPrompt.slice(0, 200),
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    history: [{
      action: 'created',
      phase,
      timestamp: new Date().toISOString(),
    }],
  };

  saveGovernance(governance);
  logHook('elevenlabs-governance', 'Registered agent', {agentId, name, phase});
}

/**
 * Validate update_agent conversation_config for API constraints
 */
function validateUpdateAgentConfig(conversationConfig) {
  if (!apiConstraints || !conversationConfig) {
    return {valid: true};
  }

  const issues: string[] = [];
  const fixes: string[] = [];

  try {
    // Check for both tools and tool_ids
    if (conversationConfig.agent?.prompt?.tools && conversationConfig.agent?.prompt?.tool_ids) {
      issues.push('❌ CONFLICT: Both tools array and tool_ids array provided');
      fixes.push('Remove agent.prompt.tool_ids (keep full tools array)');
    }

    // Check tool schema properties for conflicting fields
    if (conversationConfig.agent?.prompt?.tools) {
      for (const [toolIndex, tool] of conversationConfig.agent.prompt.tools.entries()) {
        if (tool.api_schema?.request_body_schema?.properties) {
          const properties = tool.api_schema.request_body_schema.properties;

          for (const [propName, propSchema] of Object.entries(properties) as [string, any][]) {
            const hasDescription = propSchema.description !== undefined && propSchema.description !== '';
            const hasIsSystemProvided = propSchema.is_system_provided !== undefined;
            const hasDynamicVariable = propSchema.dynamic_variable !== undefined && propSchema.dynamic_variable !== '';
            const hasConstantValue = propSchema.constant_value !== undefined && propSchema.constant_value !== '';

            const conflictCount = [hasDescription, hasIsSystemProvided, hasDynamicVariable, hasConstantValue].filter(Boolean).length;

            if (conflictCount > 1) {
              issues.push(`❌ CONFLICT: Tool "${tool.name}" property "${propName}" has ${conflictCount} mutually exclusive fields set`);
              fixes.push(`Clean property: keep only 'type' and 'description', remove enum/is_system_provided/dynamic_variable/constant_value`);
            }
          }
        }
      }
    }
  } catch (error: unknown) {
    logHook('elevenlabs-governance', 'Validation error', {error: (error as Error).message});
    return {valid: true}; // Fail open
  }

  if (issues.length > 0) {
    return {
      valid: false,
      issues,
      fixes,
      message: `⚠️ ELEVENLABS API CONSTRAINT VIOLATIONS:

${issues.join('\n')}

**Required fixes:**
${fixes.join('\n')}

**Reference:** config/elevenlabs-api-constraints.json

**Auto-fix example:**
\`\`\`javascript
// Remove tool_ids field
delete conversationConfig.agent.prompt.tool_ids;

// Clean tool properties
for (const tool of conversationConfig.agent.prompt.tools) {
  if (tool.api_schema?.request_body_schema?.properties) {
    for (const prop of Object.values(tool.api_schema.request_body_schema.properties)) {
      delete prop.enum;
      delete prop.is_system_provided;
      delete prop.dynamic_variable;
      delete prop.constant_value;
      // Keep: type, description
    }
  }
}
\`\`\``,
    };
  }

  return {valid: true};
}

/**
 * Handle pre-update agent check
 */
async function handlePreUpdate(toolInput) {
  const conversationConfig = toolInput.conversation_config;

  logHook('elevenlabs-governance', 'Pre-update check', {hasConfig: !!conversationConfig});

  if (!conversationConfig) {
    return {continue: true};
  }

  // Validate API constraints
  const validation = validateUpdateAgentConfig(conversationConfig);
  if (!validation.valid) {
    return {
      continue: false,
      reason: validation.message,
    };
  }

  return {
    continue: true,
    systemMessage: '✅ ELEVENLABS GOVERNANCE: Update configuration validated',
  };
}

/**
 * Handle pre-create agent check
 */
async function handlePreCreate(toolInput) {
  const name = toolInput.name || '';
  const systemPrompt = toolInput.system_prompt || '';
  const llm = toolInput.llm || '';

  logHook('elevenlabs-governance', 'Pre-create check', {name, llm});

  // FIRST: Check LLM model - this is BLOCKING
  if (llm) {
    const modelCheck = checkLlmModelBanned(llm);
    if (modelCheck.banned) {
      const enforced = modelConfig.enforced?.elevenlabs_agent || 'gemini-3-flash-preview';
      return {
        continue: false,
        reason: `❌ MODEL BLOCKED: ${modelCheck.reason}

**RULE**: ElevenLabs agents must use approved LLM models.
**Enforced model**: ${enforced}

To proceed:
1. Change llm parameter to "${enforced}"
2. Or use another approved model from config/model-rankings.json`,
      };
    }
  }

  // Check for phase prefix in name
  const hasPrefix = hasPhasePrefix(name);
  const parsedPhase = parsePhaseFromName(name);

  // Find similar existing agents
  const similar = findSimilarAgents(name, systemPrompt);

  const messages: string[] = [];

  // Enforce naming convention
  if (!hasPrefix) {
    const suggestedName = addPhasePrefix(name, 'DEV');
    messages.push(`⚠️ NAMING CONVENTION: Agent name lacks phase prefix.
**Rename to**: \`${suggestedName}\`
ElevenLabs agents MUST have [PHASE] prefix (e.g., [DEV], [PROD]).`);
  } else if (parsedPhase !== 'DEV') {
    // BLOCK: Cannot assign non-DEV phase without explicit user approval
    return {
      continue: false,
      systemMessage: `❌ GOVERNANCE BLOCKED: Cannot create agent with [${parsedPhase}] phase.

**RULE**: Only [DEV] phase can be auto-assigned.
**Promotions beyond DEV require EXPLICIT USER APPROVAL.**

To proceed:
1. Create as [DEV]: Change name to "${addPhasePrefix(name, 'DEV')}"
2. Or get user approval: Ask user to explicitly approve [${parsedPhase}] phase`,
    };
  }

  // Check for similar agents
  if (similar.length > 0) {
    const top = similar[0];

    if (top.similarity >= 70) {
      messages.push(`⚠️ SIMILAR AGENT: Found "${top.name}" (${top.similarity}% match, ${top.phase}).
Consider cloning instead. Use mcp__elevenlabs-mcp__get_agent(agent_id: "${top.id}") to review.`);
    } else if (top.similarity >= 40) {
      const topMatches = similar.slice(0, 3).map(m =>
        `  - "${m.name}" (${m.similarity}% match, ${m.phase})`).join('\n');
      messages.push(`📋 Similar agents found:\n${topMatches}`);
    }
  }

  if (messages.length === 0) {
    messages.push(`✅ ELEVENLABS GOVERNANCE: Agent "${name}" will be registered.`);
  }

  return {
    continue: true,
    systemMessage: messages.join('\n\n'),
  };
}

/**
 * Handle post-create - register new agent with phase from name
 */
async function handlePostCreate(toolInput, toolOutput) {
  try {
    const output = typeof toolOutput === 'string' ? JSON.parse(toolOutput) : toolOutput;

    // Extract agent ID from response
    let agentId = null;
    if (output.text) {
      const match = output.text.match(/agent_[a-z\d]+/i);
      if (match) {
        agentId = match[0];
      }
    }

    const name = toolInput.name || 'Unnamed Agent';
    const systemPrompt = toolInput.system_prompt || '';

    // Parse phase from name, default to DEV
    const phase = parsePhaseFromName(name) || 'DEV';

    if (agentId) {
      registerAgent(agentId, name, systemPrompt, phase);

      const hasPrefix = hasPhasePrefix(name);
      let message = `✅ ELEVENLABS GOVERNANCE: Agent registered as ${phase} phase (ID: ${agentId})`;

      if (!hasPrefix) {
        message += `\n⚠️ Agent name lacks [${phase}] prefix. Consider renaming for consistency.`;
      }

      return {continue: true, systemMessage: message};
    }
  } catch (error: unknown) {
    logHook('elevenlabs-governance', 'Post-create registration failed', {error: (error as Error).message});
  }

  return {continue: true};
}

/**
 * Main hook handler
 */
async function main() {
  const hookType = process.env.CLAUDE_HOOK_TYPE || 'PreToolUse';

  logHook('elevenlabs-governance', `Hook triggered: ${hookType}`);

  try {
    const data = await readStdinJson();
    // Read tool_name from stdin (test) or env (production)
    const toolName = data.tool_name || process.env.CLAUDE_TOOL_NAME || '';
    const toolInput = data.tool_input || {};
    const toolOutput = data.tool_output || {};

    logHook('elevenlabs-governance', 'Processing', {toolName});

    let result = {continue: true};

    if (hookType === 'PreToolUse') {
      if (toolName.includes('create_agent')) {
        result = await handlePreCreate(toolInput);
      } else if (toolName.includes('update_agent')) {
        result = await handlePreUpdate(toolInput);
      }
    } else if (hookType === 'PostToolUse' && toolName.includes('create_agent')) {
      result = await handlePostCreate(toolInput, toolOutput);
    }

    outputResult(result);
    process.exit(result.continue ? 0 : 2);
  } catch (error: unknown) {
    logHook('elevenlabs-governance', 'Error', {error: (error as Error).message, stack: (error as Error).stack});
    outputResult({continue: true}); // Fail open
    process.exit(0);
  }
}

// Export for testing
export {
  PHASES, MODIFIABLE_PHASES, PROTECTED_PHASES, parsePhaseFromName, hasPhasePrefix, addPhasePrefix, calculateSimilarity, findSimilarAgents, getAgentPhase, registerAgent, checkLlmModelBanned, loadModelConfig,
};

// Run if called directly
if (require.main === module) {
  main();
}
