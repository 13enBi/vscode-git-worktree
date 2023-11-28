import * as vscode from 'vscode';
import { registerWorkspaceFoldersTreeProvider } from './view';

export const activate = async (context: vscode.ExtensionContext) => {
    registerWorkspaceFoldersTreeProvider(context);
};

export const deactivate = () => {};
