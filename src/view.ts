import * as fs from 'fs';
import * as path from 'path';
import { match, P } from 'ts-pattern';
import * as vscode from 'vscode';
import { getGitRepo, GitRepo, GitWorktree } from './git';
import { createBranchPickItems } from './pick';
import { first } from 'lodash';

export class WorktreeViewItem extends vscode.TreeItem {
    constructor(
        public gitWorktree: GitWorktree,
        public parent: WorktreeViewList
    ) {
        super(gitWorktree.name, vscode.TreeItemCollapsibleState.None);
        this.init();
    }

    command = {
        title: 'Open Worktree',
        command: 'git-worktree.item.open',
        arguments: [this]
    };

    get openUri() {
        return vscode.Uri.file(path.resolve(this.gitWorktree.path, this.parent.folderRelativePath));
    }

    get isActive() {
        if (!vscode.workspace.getWorkspaceFolder(this.parent.workspaceFolder.uri)) return false;

        const relativePath = path.relative(this.gitWorktree.path, this.parent.workspaceFolder.uri.fsPath);
        return !relativePath || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
    }

    init() {
        this.contextValue = `worktree-item${this.isActive ? '_active' : ''}`;
        this.tooltip = this.gitWorktree.path;

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
                this.label = this.isActive ? `${this.gitWorktree.name}  ✨` : this.gitWorktree.name;
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
        const { mainWorktree } = this.parent;
        if (!mainWorktree) return;

        const defaultLocation = vscode.workspace
            .getConfiguration('git-worktree')
            .get<string | undefined>('defaultLocation');

        if (!defaultLocation)
            return vscode.window.showErrorMessage('Please set the default worktree location first', { modal: true });

        const repoName = path.basename(mainWorktree.path);
        const codeWorkspacePath = path.resolve(
            defaultLocation,
            './.code-workspace',
            `${repoName}.worktrees`,
            `${this.gitWorktree.name.replaceAll('/', '_')}.code-workspace`
        );

        if (!fs.existsSync(codeWorkspacePath)) {
            fs.mkdirSync(path.resolve(codeWorkspacePath, '../'), { recursive: true });
            fs.writeFileSync(
                codeWorkspacePath,
                JSON.stringify({
                    folders: [
                        this.parent.folderRelativePath && {
                            name: repoName,
                            path: this.gitWorktree.path
                        },
                        {
                            name: `${this.parent.workspaceFolder.name} - ${this.gitWorktree.name}`,
                            path: this.openUri.fsPath
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
        if (this.isActive) return;

        const isOpenWithWorkspace = vscode.workspace.getConfiguration('git-worktree').get<boolean>('openWithWorkspace');
        if (isOpenWithWorkspace) return this.openWithCodeWorkspace();

        await vscode.commands.executeCommand('vscode.openFolder', this.openUri, {
            forceNewWindow: true
        });
    }

    async copy() {
        await vscode.env.clipboard.writeText(this.gitWorktree.path);
    }

    async reveal() {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.gitWorktree.path));
    }
}

export class WorktreeViewList extends vscode.TreeItem {
    worktreeList: GitWorktree[] = [];
    gitRepo?: GitRepo;

    contextValue = 'worktree-list';

    constructor(
        public workspaceFolder: vscode.WorkspaceFolder,
        public provider: WorkspaceFoldersTreeProvider
    ) {
        super(workspaceFolder.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('repo');
    }

    async init() {
        this.gitRepo = await getGitRepo(this.workspaceFolder.uri);

        return this;
    }

    get folderRelativePath() {
        if (!this.gitRepo) return '';
        return path.relative(this.gitRepo.rootUri.fsPath, this.workspaceFolder.uri.fsPath);
    }

    get mainWorktree() {
        return this.worktreeList.find(item => item.main);
    }

    async getChildren() {
        if (!this.gitRepo) return [];
        if (!this.worktreeList.length) this.worktreeList = await this.gitRepo.worktree.get();

        return this.worktreeList.map(item => new WorktreeViewItem(item, this));
    }

    async prune() {
        if (!this.gitRepo) return;

        const output = await this.gitRepo.worktree.prune({ 'dry-run': true });
        const select = await vscode.window.showInformationMessage(output, { modal: true }, 'Ok', 'Cancel');
        if (select !== 'Ok') return;
        await this.gitRepo.worktree.prune();
        this.provider.refresh();
    }

    async add() {
        if (!this.gitRepo) return;

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
            track: false
        });
        this.provider.refresh();
    }
}

export class WorkspaceFoldersTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    static register(context: vscode.ExtensionContext) {
        const provider = new WorkspaceFoldersTreeProvider(vscode.workspace.workspaceFolders);

        context.subscriptions.push(vscode.window.registerTreeDataProvider('git-worktree-list', provider));
        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                provider.workspaceFolders = vscode.workspace.workspaceFolders || [];
                provider.refresh();
            })
        );

        vscode.commands.registerCommand('git-worktree.list.refresh', () => provider.refresh());
        vscode.commands.registerCommand('git-worktree.list.prune', (node: WorktreeViewList) => node.prune());
        vscode.commands.registerCommand('git-worktree.list.add', (node: WorktreeViewList) => node.add());

        vscode.commands.registerCommand('git-worktree.item.remove', (node: WorktreeViewItem) => node.remove());
        vscode.commands.registerCommand('git-worktree.item.open', (node: WorktreeViewItem) => node.open());
        vscode.commands.registerCommand('git-worktree.item.copy', (node: WorktreeViewItem) => node.copy());
        vscode.commands.registerCommand('git-worktree.item.reveal', (node: WorktreeViewItem) => node.reveal());

        return provider;
    }

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
            .with(P.nullish, () =>
                Promise.all(this.workspaceFolders.map(item => new WorktreeViewList(item, this).init()))
            )
            .with(P.instanceOf(WorktreeViewList), element => element.getChildren())
            .otherwise(() => []);
    }
}

export class FavoritesProvider extends WorkspaceFoldersTreeProvider {
    static register(context: vscode.ExtensionContext) {
        const provider = new FavoritesProvider(context);
        const view = vscode.window.registerTreeDataProvider('git-worktree-favorites', provider);

        vscode.commands.registerCommand('git-worktree.favorites.add', () => provider.add());
        vscode.commands.registerCommand('git-worktree.favorites.refresh', () => provider.refresh());
        vscode.commands.registerCommand('git-worktree.favorites.remove', (node: WorktreeViewList) =>
            provider.remove(node.workspaceFolder.uri.fsPath)
        );

        context.subscriptions.push(view);

        return provider;
    }

    constructor(public context: vscode.ExtensionContext) {
        super();
        this.init();
    }

    contextValue = 'worktree-favorites';
    favorites: Set<string> = new Set();

    init() {
        const favorites = this.context.globalState.get<string[]>('worktree-favorites', []);
        this.favorites = new Set(favorites);
        this.workspaceFolders = favorites.map((item, index) => ({
            index,
            uri: vscode.Uri.file(item),
            name: path.basename(item)
        }));
    }

    refresh() {
        this.init();
        super.refresh();
    }

    async add() {
        const uri = first(
            await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Worktree Location',
                title: ''
            })
        );
        if (!uri) return;

        this.favorites.add(uri.fsPath);
        await this.context.globalState.update('worktree-favorites', [...this.favorites]);
        this.refresh();
    }

    async remove(path: string) {
        this.favorites.delete(path);
        await this.context.globalState.update('worktree-favorites', [...this.favorites]);
        this.refresh();
    }
}

export const registerWorkspaceFoldersTreeProvider = (context: vscode.ExtensionContext) => {
    WorkspaceFoldersTreeProvider.register(context);
    FavoritesProvider.register(context);
};
