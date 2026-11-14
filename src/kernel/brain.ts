import type { AgentBrain, BrainRequest, BrainResponse } from "./types.js";

export class DevelopmentBrain implements AgentBrain {
  async respond(request: BrainRequest): Promise<BrainResponse> {
    return {
      message: `NallPuter development kernel received: ${request.userMessage}\nAvailable tools: ${request.tools.map((tool) => tool.name).join(", ")}. Connect an AgentBrain provider to enable model-driven planning.`
    };
  }
}
