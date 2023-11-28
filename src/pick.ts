import * as vscode from 'vscode';
import { Ref } from './types/git';
import { groupBy } from 'lodash';

export const createSeparator = (label = ''): vscode.QuickPickItem => ({
    kind: vscode.QuickPickItemKind.Separator,
    label
});

const createBranchPickItem = (branch: Ref): vscode.QuickPickItem => ({
    kind: vscode.QuickPickItemKind.Default,
    label: branch.name || '(unknown)',
    description: `${branch.remote ? 'remote branch' : ''} $(git-commit) ${branch.commit?.slice(0, 6)}`,
    iconPath: new vscode.ThemeIcon('git-branch'),
});

export const createBranchPickItems = (branches: Ref[]) => {
    const { remote, local } = groupBy(branches, ({ remote }) => (remote ? 'remote' : 'local'));

    return [
        createSeparator('Branches'),
        ...local.map(createBranchPickItem),
        createSeparator('Remote Branches'),
        ...remote.map(createBranchPickItem)
    ];
};
