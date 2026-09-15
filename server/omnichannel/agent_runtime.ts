/**
 * Safe, bounded function-calling runtime for the DoorDrop sales employee.
 *
 * This is the DoorDrop/TypeScript adaptation of the useful orchestration ideas
 * from the referenced AI-Sales-agent project. It deliberately does not copy
 * that project's console app, SQLite database, provider-specific checkout, or
 * dynamic code execution. DoorDrop remains the source of truth for tenants,
 * catalog, orders, channels, and permissions.
 */

export type AgentChatResult = {
  message: any;
  usage?: any;
};

export type AgentRuntimeOptions = {
  messages: any[];
  tools: any[];
  maxLoops?: number;
  maxToolResultChars?: number;
  callChat: (messages: any[], tools?: any[]) => Promise<AgentChatResult>;
  executeTool: (toolName: string, args: Record<string, any>) => Promise<unknown>;
  onToolCall?: (toolName: string, args: Record<string, any>) => void | Promise<void>;
};

export type AgentRuntimeResult = {
  message: any;
  totalTokens: number;
  loops: number;
};

function parseToolArguments(rawArguments: unknown): Record<string, any> {
  if (rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, any>;
  }

  if (typeof rawArguments !== 'string' || rawArguments.trim() === '') return {};

  try {
    const parsed = JSON.parse(rawArguments);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serializeToolResult(value: unknown, maxChars: number): string {
  let serialized = '';
  try {
    serialized = JSON.stringify(value ?? { result: null });
  } catch {
    serialized = JSON.stringify({ error: 'La herramienta devolvió un resultado no serializable.' });
  }

  if (!serialized) serialized = JSON.stringify({ result: null });
  return serialized.length > maxChars
    ? `${serialized.slice(0, Math.max(0, maxChars - 32))}...[resultado truncado]`
    : serialized;
}

function addUsage(totalTokens: number, usage: any): number {
  const used = Number(usage?.total_tokens || 0);
  return Number.isFinite(used) && used > 0 ? totalTokens + used : totalTokens;
}

/**
 * Runs a bounded assistant/tool loop using only the tool schemas supplied by
 * DoorDrop. Tool arguments are parsed as JSON; eval/dynamic code execution is
 * intentionally not available in this runtime.
 */
export async function runAgentTurn(options: AgentRuntimeOptions): Promise<AgentRuntimeResult> {
  const workingMessages = [...options.messages];
  const availableTools = new Set(
    (options.tools || [])
      .map(tool => String(tool?.function?.name || '').trim())
      .filter(Boolean)
  );
  const maxLoops = Math.max(1, Math.min(5, Number(options.maxLoops || 4)));
  const maxToolResultChars = Math.max(1000, Math.min(16000, Number(options.maxToolResultChars || 8000)));

  let current = await options.callChat(workingMessages, options.tools);
  let totalTokens = addUsage(0, current.usage);
  let loops = 0;

  while (Array.isArray(current.message?.tool_calls) && current.message.tool_calls.length > 0 && loops < maxLoops) {
    loops += 1;
    workingMessages.push(current.message);

    for (let index = 0; index < current.message.tool_calls.length; index += 1) {
      const toolCall = current.message.tool_calls[index];
      const toolName = String(toolCall?.function?.name || '').trim();
      const args = parseToolArguments(toolCall?.function?.arguments);
      const toolCallId = String(toolCall?.id || `doordrop-tool-${loops}-${index + 1}`);

      await options.onToolCall?.(toolName, args);

      let result: unknown;
      if (!toolName || !availableTools.has(toolName)) {
        result = { error: 'La herramienta solicitada no está habilitada para este agente.' };
      } else {
        try {
          result = await options.executeTool(toolName, args);
        } catch {
          result = { error: 'No se pudo completar esta acción en este momento.' };
        }
      }

      workingMessages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: serializeToolResult(result, maxToolResultChars)
      });
    }

    current = await options.callChat(
      workingMessages,
      loops < maxLoops ? options.tools : undefined
    );
    totalTokens = addUsage(totalTokens, current.usage);
  }

  // If the model still asks for tools at the hard limit, request a final
  // response without tools so a raw tool-call payload never reaches a customer.
  if (Array.isArray(current.message?.tool_calls) && current.message.tool_calls.length > 0) {
    workingMessages.push(current.message);
    workingMessages.push({
      role: 'system',
      content: 'Responde ahora con un mensaje final breve usando solo los resultados disponibles. No solicites más herramientas.'
    });
    current = await options.callChat(workingMessages);
    totalTokens = addUsage(totalTokens, current.usage);
  }

  return { message: current.message, totalTokens, loops };
}
