import * as vscode from 'vscode';

export class WorktreeItem extends vscode.TreeItem {
    constructor(public label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('git-branch');
    }
}

export class WorktreeList extends vscode.TreeItem implements vscode.TreeDataProvider<WorktreeItem> {
    constructor(public workspaceFolder: vscode.WorkspaceFolder) {
        super(workspaceFolder.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('repo');
    }

    getTreeItem(element: WorktreeItem) {
        return element;
    }

    getChildren() {
        return [new WorktreeItem('demo')];
    }
}

export class WorkspaceFolders implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(public workspaceFolders: readonly vscode.WorkspaceFolder[] = []) {}

    getTreeItem(element: vscode.TreeItem) {
        return element;
    }

    getChildren(element?: vscode.TreeItem) {
        if (element instanceof WorktreeList) return element.getChildren();

        return this.workspaceFolders.map(item => new WorktreeList(item));
    }
}
