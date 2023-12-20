import * as vscode from 'vscode';
import { registerWorkspaceFoldersTreeProvider } from './view';

export const Logger = vscode.window.createOutputChannel('Git Worktree', { log: true });

export const activate = async (context: vscode.ExtensionContext) => {
    registerWorkspaceFoldersTreeProvider(context);
    context.subscriptions.push(Logger)
};

export const deactivate = () => {};
