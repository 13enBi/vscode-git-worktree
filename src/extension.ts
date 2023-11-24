// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { NodeDependenciesProvider } from './views/demo';
import { WorkspaceFolders } from './views/list';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export const activate = (context: vscode.ExtensionContext) => {
    const rootPath =
        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined;
    console.log('🚀 ~ file: extension.ts:10 ~ rootPath:', rootPath);

    if (!rootPath) return;

    vscode.window.registerTreeDataProvider(
        'git-worktree-list',
        new WorkspaceFolders(vscode.workspace.workspaceFolders)
    );
};

// This method is called when your extension is deactivated
export const deactivate = () => {};
