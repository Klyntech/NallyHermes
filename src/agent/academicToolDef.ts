import type { ChatCompletionTool } from "openai/resources/index.js";

export const academicAgentTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "academic",
    description: "Work with the user's ingested academic library: list indexed PDFs/notes, search their extracted content, or read one document. Use for statutes, lecture notes, case materials, and course readings—not for personal facts (use memory) or general web research.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["list", "search", "get"],
          description: "list: catalogue documents; search: semantic/keyword query over indexed academic text; get: one document by id."
        },
        query: {
          type: "string",
          description: "Search query for operation=search (required for search)."
        },
        document_id: {
          type: "string",
          description: "Document id for operation=get."
        },
        course: {
          type: "string",
          description: "Optional course filter for list or search."
        }
      },
      required: ["operation"],
      additionalProperties: false
    }
  }
};
