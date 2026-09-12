import * as crypto from "node:crypto";
import * as vscode from "vscode";

export function getProjectId(workspace: vscode.WorkspaceFolder): string {
  return crypto
    .createHash("sha256")
    .update(workspace.uri.toString())
    .digest("hex")
    .slice(0, 16);
}
