import * as vscode from 'vscode';
import { registerWorkspaceFoldersTreeProvider } from './views/list';

export const activate = (context: vscode.ExtensionContext) => {
    registerWorkspaceFoldersTreeProvider(context);
};

export const deactivate = () => {};
