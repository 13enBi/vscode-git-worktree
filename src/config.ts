import * as vscode from 'vscode';

export const getConfig = <T = string>(key: string) => vscode.workspace.getConfiguration('git-worktree').get<T>(key);
