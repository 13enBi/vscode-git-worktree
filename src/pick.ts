import * as vscode from 'vscode';
import { Ref } from './types/git';
import { groupBy } from 'lodash';

type PickBranchItem = vscode.QuickPickItem & {
    branch?: Ref;
};

export const createSeparator = (label = ''): PickBranchItem => ({
    kind: vscode.QuickPickItemKind.Separator,
    label
});

const createBranchPickItem = (branch: Ref): PickBranchItem => ({
    kind: vscode.QuickPickItemKind.Default,
    label: branch.name || '(unknown)',
    description: `${branch.remote ? 'remote branch' : ''} $(git-commit) ${branch.commit?.slice(0, 6)}`,
    iconPath: new vscode.ThemeIcon('git-branch'),
    branch
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
