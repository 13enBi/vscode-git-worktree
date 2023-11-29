import { execaCommand } from 'execa';
import { match, P } from 'ts-pattern';
import * as vscode from 'vscode';
import { API, GitExtension, Repository } from './types/git';
import { memoize } from 'lodash';

export const getVscodeGitApi = memoize<() => API | null>(
    () =>
        match(vscode.extensions.getExtension<GitExtension>('vscode.git'))
            .with(P.nullish, () => null)
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

const getArgs = (...args: any[]) => args.filter(Boolean).join(' ');

export class GitWorktreeApi {
    constructor(private repo: Repository) {}

    private $(command: string) {
        return execaCommand(command, { cwd: this.repo.rootUri.fsPath }).then(({ stdout }) => stdout);
    }

    async get() {
        const stdout = await this.$('git worktree list --porcelain');

        return stdout.split(/\n\s/).map((input, index) => new GitWorktree(input, index === 0));
    }

    remove(worktreePath: string, options?: { force?: boolean }) {
        return this.$(`git worktree remove ${getArgs(options?.force && '--force', worktreePath)}`);
    }

    prune(options?: { 'dry-run'?: boolean }) {
        return this.$(`git worktree prune ${getArgs(options?.['dry-run'] && '--dry-run')}`);
    }

    add(output: string, options?: { 'new-branch'?: string; force?: boolean; track?: boolean; 'commit-ish'?: string }) {
        return this.$(
            `git worktree add ${getArgs(
                options?.force && '--force',
                options?.track && '--track',
                options?.['new-branch'] && `-b ${options['new-branch']}`,
                output,
                options?.['commit-ish']
            )}`
        );
    }
}

export type GitRepo = Repository & {
    worktree: GitWorktreeApi;
};
export const getGitRepo = (uri: vscode.Uri): GitRepo => {
    const baseApi = getVscodeGitApi();
    const repo = baseApi?.getRepository(uri);
    if (!repo) throw new Error(`get git repo fail, path: ${uri.path}`);

    return Object.assign(repo, { worktree: new GitWorktreeApi(repo) });
};