import type { ChatCompletionTool } from "openai/resources/index.js";

export const academicAgentTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "academic",
    description:
      "Work with the user's ingested academic library: list indexed PDFs/notes, search their extracted content, read one document, rename metadata, or delete a document. Use for statutes, lecture notes, case materials, and course readings—not for personal facts (use memory) or general web research. delete and rename change library state and require clear user intent.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["list", "search", "get", "delete", "rename"],
          description:
            "list: catalogue documents; search: semantic/keyword query over indexed academic text; get: one document by id; delete: remove a document by id; rename: update title and/or course for a document."
        },
        query: {
          type: "string",
          description: "Search query for operation=search (required for search)."
        },
        document_id: {
          type: "string",
          description: "Document id for operation=get, delete, or rename."
        },
        course: {
          type: "string",
          description: "Optional course filter for list/search, or new course label for rename."
        },
        title: {
          type: "string",
          description: "New title for operation=rename."
        }
      },
      required: ["operation"],
      additionalProperties: false
    }
  }
};
