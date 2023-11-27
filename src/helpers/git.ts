import { execaCommand } from 'execa';
import { match, P } from 'ts-pattern';
import * as vscode from 'vscode';
import { API, GitExtension, Repository } from '../types/git';
import { memoize } from 'lodash';

export const getVscodeGitApi = memoize<() => API>(
    () =>
        match(vscode.extensions.getExtension<GitExtension>('vscode.git'))
            .with(P.nullish, () => void 0)
            .with({ isActive: true }, gitExtension => gitExtension.exports.getAPI(1))
            .otherwise(() => null)
    // .otherwise(gitExtension => gitExtension?.activate().then(ext => ext.getAPI(1)))
);

export class GitWorktree {
    kind: 'bare' | 'branch' | 'detached' | 'unknown' = 'unknown';
    path = '';
    hash = '';
    name = '';

    constructor(
        input: string,
        public main = false
    ) {
        const [path, ...lines] = input.trim().split('\n');
        this.path = path.replace(/^worktree\s*/, '');

        match(lines)
            .with(['bare'], () => {
                this.kind = 'bare';
                this.name = 'bare';
                this.hash = '';
            })
            .with([P.string.select('hash'), 'detached'], ({ hash }) => {
                this.kind = 'detached';
                this.name = 'detached';
                this.hash = hash.replace(/^HEAD\s*/, '');
            })
            .with([P.string.select('hash'), P.string.startsWith('branch').select('branch')], ({ hash, branch }) => {
                this.kind = 'branch';
                this.name = branch.replace(/^branch\s*refs\/heads\//, '');
                this.hash = hash.replace(/^HEAD\s*/, '');
            });
    }
}

export class GitWorktreeApi {
    constructor(private repo: Repository) {}

    private $(command: string) {
        return execaCommand(command, { cwd: this.repo.rootUri.fsPath }).then(({ stdout }) => stdout);
    }

    async getWorktreeList() {
        const stdout = await this.$('git worktree list --porcelain');

        return stdout.split(/\n\s/).map((input, index) => new GitWorktree(input, index === 0));
    }
}

export type GitRepo = Repository & {
    worktree: GitWorktreeApi;
};
export const getGitRepo = (uri: vscode.Uri): GitRepo => {
    const baseApi = getVscodeGitApi();
    const repo = baseApi?.getRepository(uri);
    if (!repo) return;

    return Object.assign(repo, { worktree: new GitWorktreeApi(repo) });
};
