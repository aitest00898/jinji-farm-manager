import { PRODUCTION_AI_MODEL } from "./analysis";
import type { AmbientAiRequestInput } from "./ambient";
import type {
  AmbientV2AiAdapter,
  AmbientV2AiRequest,
  AmbientV2ResponseFormat,
} from "./ambient-extraction-v2";

export const AMBIENT_V2_PRODUCTION_MAX_TOKENS = 1536;
export const AMBIENT_V2_PRODUCTION_TEMPERATURE = 0;

/**
 * Narrow structural interface for the already-tested Direct Workers AI REST
 * transport. This wrapper does not create a client or make a call by itself;
 * the caller must explicitly construct and invoke it in a future evaluation.
 */
export interface AmbientV2DirectRestTransport {
  run(model: string, input: AmbientV2DirectRestRequestInput): Promise<unknown>;
}

export type AmbientV2DirectRestRequestInput = AmbientAiRequestInput & {
  response_format?: AmbientV2ResponseFormat;
};

export interface AmbientV2DirectRestAdapterOptions {
  transport: AmbientV2DirectRestTransport;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Developer-only cross-model screening opt-in; Production keeps this false. */
  allowNonProductionModel?: boolean;
}

/**
 * Future real-model bridge for V2. It sends the V2 messages unchanged and
 * adds only the existing pinned Production inference parameters. It has no
 * D1, Queue, LINE, Candidate, Buffer, or business-write dependency.
 */
export class AmbientV2DirectRestAdapter implements AmbientV2AiAdapter {
  readonly name = "ambient-v2-direct-workers-ai-rest";
  readonly lastCall = undefined;
  private readonly transport: AmbientV2DirectRestTransport;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(options: AmbientV2DirectRestAdapterOptions) {
    this.transport = options.transport;
    this.model = options.model ?? PRODUCTION_AI_MODEL;
    this.maxTokens = options.maxTokens ?? AMBIENT_V2_PRODUCTION_MAX_TOKENS;
    this.temperature = options.temperature ?? AMBIENT_V2_PRODUCTION_TEMPERATURE;
    if (this.model !== PRODUCTION_AI_MODEL && options.allowNonProductionModel !== true) {
      throw new Error("AMBIENT_V2_MODEL_MUST_MATCH_PRODUCTION");
    }
    if (this.maxTokens !== AMBIENT_V2_PRODUCTION_MAX_TOKENS) throw new Error("AMBIENT_V2_MAX_TOKENS_MUST_MATCH_PRODUCTION");
    if (this.temperature !== AMBIENT_V2_PRODUCTION_TEMPERATURE) throw new Error("AMBIENT_V2_TEMPERATURE_MUST_MATCH_PRODUCTION");
  }

  run(request: AmbientV2AiRequest, _context: { safeRef: string }): Promise<unknown> {
    return this.transport.run(this.model, {
      messages: request.messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      ...(request.response_format ? { response_format: request.response_format } : {}),
    });
  }
}
