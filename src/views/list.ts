import { match, P } from 'ts-pattern';
import * as vscode from 'vscode';
import { getGitRepo, GitRepo, GitWorktree } from '../helpers/git';

export class WorktreeViewItem extends vscode.TreeItem {
    constructor(
        public gitWorktree: GitWorktree,
        public parent: WorktreeViewList
    ) {
        super(gitWorktree.name, vscode.TreeItemCollapsibleState.None);
        this.tooltip = this.gitWorktree.path;
    }

    contextValue = 'worktree-item';

    async init() {
        return match<GitWorktree, Promise<this>>(this.gitWorktree)
            .with({ kind: 'bare' }, async () => {
                this.label = '(bare)';
                this.iconPath = new vscode.ThemeIcon('folder');
                this.command = {
                    title: 'Open Folder',
                    command: 'vscode.open',
                    arguments: [vscode.Uri.from({ scheme: this.gitWorktree.path })]
                };
                return this;
            })
            .with({ kind: 'detached' }, async () => {
                this.label = '(detached)';
                this.iconPath = new vscode.ThemeIcon('git-commit');
                return this;
            })
            .with({ kind: 'branch' }, async () => {
                const branchName = this.gitWorktree.name;
                this.label = this.gitWorktree.main ? `${branchName}  ✨` : branchName;
                this.iconPath = new vscode.ThemeIcon('git-branch');

                return this;
            })
            .otherwise(async () => this);
    }
}

export class WorktreeViewList extends vscode.TreeItem {
    worktreeList: WorktreeViewItem[] = [];
    gitRepo?: GitRepo;

    contextValue = 'worktree-list';

    constructor(
        public workspaceFolder: vscode.WorkspaceFolder,
        public provider: WorkspaceFoldersTreeProvider
    ) {
        super(workspaceFolder.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('repo');
        this.gitRepo = getGitRepo(this.workspaceFolder.uri);
    }

    async getChildren() {
        const worktreeList = await this.gitRepo.worktree.getWorktreeList();
        return Promise.all(worktreeList.map(item => new WorktreeViewItem(item, this).init()));
    }
}

export class WorkspaceFoldersTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(public workspaceFolders: readonly vscode.WorkspaceFolder[] = []) {}

    private eventEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    onDidChangeTreeData = this.eventEmitter.event;

    refresh() {
        this.eventEmitter.fire(undefined);
    }

    getParent(element: vscode.TreeItem) {
        return match(element)
            .with(P.instanceOf(WorktreeViewItem), element => element.parent)
            .otherwise(() => null);
    }

    getTreeItem(element: vscode.TreeItem) {
        return element;
    }

    getChildren(element?: vscode.TreeItem) {
        return match(element)
            .with(P.nullish, () => this.workspaceFolders.map(item => new WorktreeViewList(item, this)))
            .with(P.instanceOf(WorktreeViewList), element => element.getChildren())
            .otherwise(() => []);
    }
}

export const registerWorkspaceFoldersTreeProvider = (context: vscode.ExtensionContext) => {
    const provider = new WorkspaceFoldersTreeProvider(vscode.workspace.workspaceFolders);
    const view = vscode.window.registerTreeDataProvider('git-worktree-list', provider);
    context.subscriptions.push(view);

    vscode.commands.registerCommand('git-worktree-list.refresh', () => provider.refresh());

    return provider;
};
