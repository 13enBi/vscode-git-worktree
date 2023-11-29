import * as path from 'path';
import { match, P } from 'ts-pattern';
import * as vscode from 'vscode';
import { getGitRepo, GitRepo, GitWorktree } from './git';
import { createBranchPickItems } from './pick';
import * as fs from 'fs';

export class WorktreeViewItem extends vscode.TreeItem {
    constructor(
        public gitWorktree: GitWorktree,
        public parent: WorktreeViewList
    ) {
        super(gitWorktree.name, vscode.TreeItemCollapsibleState.None);
        this.tooltip = this.gitWorktree.path;

        this.init();
    }

    contextValue = 'worktree-item';
    command = {
        title: 'Open Worktree',
        command: 'git-worktree.item.open',
        arguments: [this]
    };

    init() {
        match(this.gitWorktree)
            .with({ kind: 'bare' }, () => {
                this.label = '(bare)';
                this.iconPath = new vscode.ThemeIcon('folder');
            })
            .with({ kind: 'detached' }, () => {
                this.label = this.gitWorktree.hash?.slice(0, 6);
                this.iconPath = new vscode.ThemeIcon('git-commit');
            })
            .with({ kind: 'branch' }, () => {
                const branchName = this.gitWorktree.name;
                this.label = this.gitWorktree.main ? `${branchName}  ✨` : branchName;
                this.iconPath = new vscode.ThemeIcon('git-branch');
            });
    }

    async remove() {
        if (this.gitWorktree.main) return vscode.window.showErrorMessage(`?`);

        await this.parent.gitRepo?.worktree
            .remove(this.gitWorktree.path)
            .catch(message => vscode.window.showErrorMessage(`Remove Worktree Failed, Reason: ${message}`));
        this.parent.provider.refresh();
    }

    async openWithCodeWorkspace() {
        const defaultLocation = vscode.workspace
            .getConfiguration('git-worktree')
            .get<string | undefined>('defaultLocation');

        if (!defaultLocation)
            return vscode.window.showErrorMessage('Please set the default worktree location first', { modal: true });

        const codeWorkspacePath = path.resolve(
            defaultLocation,
            './.code-workspace',
            `${path.basename(this.parent.gitRepo.rootUri.fsPath)}.worktrees`,
            `${this.gitWorktree.name.replaceAll('/', ':')}.code-workspace`
        );

        if (!fs.existsSync(codeWorkspacePath)) {
            const relativePath = path.relative(
                this.parent.gitRepo.rootUri.fsPath,
                this.parent.workspaceFolder.uri.fsPath
            );
            fs.mkdirSync(path.resolve(codeWorkspacePath, '../'), { recursive: true });
            fs.writeFileSync(
                codeWorkspacePath,
                JSON.stringify({
                    folders: [
                        {
                            name: `${this.parent.workspaceFolder.name} - ${this.gitWorktree.name}`,
                            path: path.resolve(this.gitWorktree.path, relativePath)
                        }
                    ]
                }),
                {}
            );
        }

        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(codeWorkspacePath), {
            forceNewWindow: true
        });
    }

    async open() {
        const isOpenWithWorkspace = vscode.workspace.getConfiguration('git-worktree').get<boolean>('openWithWorkspace');
        if (isOpenWithWorkspace) return this.openWithCodeWorkspace();

        const relativePath = path.relative(this.parent.gitRepo.rootUri.fsPath, this.parent.workspaceFolder.uri.fsPath);
        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(path.resolve(this.gitWorktree.path, relativePath)),
            {
                forceNewWindow: true
            }
        );
    }

    async copy() {
        await vscode.env.clipboard.writeText(this.gitWorktree.path);
    }

    async reveal() {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.gitWorktree.path));
    }
}

export class WorktreeViewList extends vscode.TreeItem {
    worktreeList: WorktreeViewItem[] = [];
    gitRepo: GitRepo;

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
        const worktreeList = await this.gitRepo.worktree.get();

        return worktreeList.map(item => new WorktreeViewItem(item, this));
    }

    async prune() {
        const output = await this.gitRepo.worktree.prune({ 'dry-run': true });
        const select = await vscode.window.showInformationMessage(output, 'Ok', 'Cancel');
        if (select !== 'Ok') return;
        await this.gitRepo.worktree.prune();
        this.provider.refresh();
    }

    async add() {
        const defaultLocation = vscode.workspace
            .getConfiguration('git-worktree')
            .get<string | undefined>('defaultLocation');

        if (!defaultLocation)
            return vscode.window.showErrorMessage('Please set the default worktree location first', { modal: true });

        const branches = await this.gitRepo.getBranches({ remote: true });
        const selectedBranch = await vscode.window
            .showQuickPick(createBranchPickItems(branches))
            .then(selected => selected?.label);
        if (!selectedBranch) return;

        const newBranch = await vscode.window.showInputBox({
            title: `Create Worktree from "${selectedBranch}"`,
            placeHolder: 'Please provide a name for the new branch',
            validateInput: async value => {
                if (!value) return 'please enter a valid branch name';
                if (branches.find(({ name }) => name === value)) return `A branch named "${value}" already exists`;
            }
        });
        if (!newBranch) return;

        const outputPath = path.resolve(
            defaultLocation,
            `${path.basename(this.gitRepo.rootUri.fsPath)}.worktrees`,
            newBranch
        );
        const option = await vscode.window.showInformationMessage(
            `The worktree will be created in ${outputPath}`,
            { modal: true },
            'Ok'
        );
        if (option !== 'Ok') return;

        await this.gitRepo.worktree.add(outputPath, {
            'new-branch': newBranch,
            'commit-ish': selectedBranch,
            track: true
        });
        this.provider.refresh();
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

    vscode.commands.registerCommand('git-worktree.list.refresh', () => provider.refresh());
    vscode.commands.registerCommand('git-worktree.list.prune', (node: WorktreeViewList) => node.prune());
    vscode.commands.registerCommand('git-worktree.list.add', (node: WorktreeViewList) => node.add());

    vscode.commands.registerCommand('git-worktree.item.remove', (node: WorktreeViewItem) => node.remove());
    vscode.commands.registerCommand('git-worktree.item.open', (node: WorktreeViewItem) => node.open());
    vscode.commands.registerCommand('git-worktree.item.copy', (node: WorktreeViewItem) => node.copy());
    vscode.commands.registerCommand('git-worktree.item.reveal', (node: WorktreeViewItem) => node.reveal());

    return provider;
};
