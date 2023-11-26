import { P, match } from 'ts-pattern';
import * as vscode from 'vscode';
import { GitApi, GitWorktree, getGitApi } from '../helpers/git';

export class WorktreeViewItem extends vscode.TreeItem {
    constructor(item: GitWorktree) {
        super(item.name, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('git-branch');
    }
}

export class WorktreeViewList extends vscode.TreeItem {
    worktreeList: GitWorktree[] = [];

    constructor(public workspaceFolder: vscode.WorkspaceFolder) {
        super(workspaceFolder.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('repo');
    }

    async init() {
        const gitApi = await getGitApi(this.workspaceFolder.uri);
        this.worktreeList = await gitApi.worktree.getWorktreeList();
    }

    getChildren() {
        return this.worktreeList.map(item => new WorktreeViewItem(item));
    }
}

export class WorkspaceFoldersTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(public workspaceFolders: readonly vscode.WorkspaceFolder[] = []) {}

    getTreeItem(element: vscode.TreeItem) {
        return element;
    }

    getChildren(element?: vscode.TreeItem) {
        return match(element)
            .with(P.nullish, () => this.workspaceFolders.map(item => new WorktreeViewList(item)))
            .with(P.instanceOf(WorktreeViewList), element => element.getChildren())
            .otherwise(() => []);
    }
}

export const registerWorkspaceFoldersTreeProvider = (context: vscode.ExtensionContext) => {
    const provider = new WorkspaceFoldersTreeProvider(vscode.workspace.workspaceFolders);
    const view = vscode.window.registerTreeDataProvider('git-worktree-list', provider);
    context.subscriptions.push(view);

    return provider;
};
